import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {query,transaction} from '../core/db.js';
import {requireUser,requireOwner,authorize,HttpError,audit,notify} from '../core/security.js';
import {idSchema,dateSchema,lockPage,lockContent,validateAssets,packageSignature,requireApproval,checkRevision,recordPublication,refreshPackageSignature,invalidatePackage,notifyOwner} from './content-core.js';

async function lockPackage(client:any,id:string) {
  const ref=(await client.query('SELECT page_id FROM story_packages WHERE id=$1',[id])).rows[0];
  if(!ref)throw new HttpError(404,'بستهٔ استوری پیدا نشد.');
  await lockPage(client,ref.page_id);
  return (await client.query('SELECT * FROM story_packages WHERE id=$1 FOR UPDATE',[id])).rows[0];
}
export async function registerStories(app:FastifyInstance) {
  app.get('/api/pages/:pageId/packages',async req=>{
    requireUser(req);const pageId=idSchema.parse((req.params as any).pageId),{date}=z.object({date:dateSchema.optional()}).parse(req.query);
    const packages=await query('SELECT * FROM story_packages WHERE page_id=$1 AND ($2::date IS NULL OR date=$2) ORDER BY date,created_at',[pageId,date??null]);
    const items=await query(`SELECT c.*,(SELECT count(*)::int FROM analytics_snapshots a WHERE a.content_id=c.id AND a.finalized) AS analytics_count,
      EXISTS(SELECT 1 FROM analytics_snapshots a WHERE a.content_id=c.id AND a.checkpoint='first_hour' AND a.finalized) AS first_hour_completed,
      EXISTS(SELECT 1 FROM analytics_snapshots a WHERE a.content_id=c.id AND a.checkpoint='next_day' AND a.finalized) AS next_day_completed,
      EXISTS(SELECT 1 FROM assets WHERE id=COALESCE(c.data->>'coverId',c.data->'assets'->>0)::uuid AND thumbnail_key IS NOT NULL) AS lead_asset_has_thumbnail,
      (SELECT count(*)::int FROM feedback f WHERE f.content_id=c.id AND NOT f.resolved) AS open_feedback_count
      FROM content c WHERE package_id=ANY($1::uuid[]) AND trashed_at IS NULL ORDER BY package_position NULLS LAST,c.id`,[packages.map(x=>x.id)]);
    return {data:packages.map(pkg=>{
      const children=items.filter(x=>x.package_id===pkg.id);
      return {...pkg,items:children,total_count:children.length,published_count:children.filter(x=>x.published_at).length,analytics_count:children.filter(x=>x.first_hour_completed&&x.next_day_completed).length};
    })};
  });
  app.post('/api/pages/:pageId/packages',async req=>{
    const user=requireUser(req),pageId=idSchema.parse((req.params as any).pageId);authorize(user,pageId,'edit');
    const body=z.object({date:dateSchema,name:z.string().trim().min(1).max(200).default('استوری‌های امروز')}).strict().parse(req.body);
    return {data:await transaction(async client=>{
      await lockPage(client,pageId);
      const row=(await client.query('INSERT INTO story_packages(page_id,date,name,created_by) VALUES ($1,$2,$3,$4) RETURNING *',[pageId,body.date,body.name,user.id])).rows[0];
      await audit(client,user.id,'package.create','package',row.id,body);return row;
    })};
  });
  app.patch('/api/packages/:id',async req=>{
    const user=requireUser(req),id=idSchema.parse((req.params as any).id),body=z.object({name:z.string().trim().min(1).max(200).optional(),date:dateSchema.optional(),expectedVersion:z.number().int().positive()}).strict().parse(req.body);
    return {data:await transaction(async client=>{
      const pkg=await lockPackage(client,id);authorize(user,pkg.page_id,'edit');
      if(pkg.version!==body.expectedVersion)throw new HttpError(409,'بسته تغییر کرده است؛ دوباره بارگذاری کنید.');
      if(body.date&&body.date!==pkg.date&&(await client.query('SELECT id FROM content WHERE package_id=$1 AND published_at IS NOT NULL LIMIT 1',[id])).rows.length)throw new HttpError(409,'تاریخ بستهٔ دارای استوری منتشرشده قفل است؛ موارد باقی‌مانده را به بستهٔ دیگری منتقل کنید.');
      const changed=body.date&&body.date!==pkg.date||body.name&&body.name!==pkg.name;
      if(changed)await invalidatePackage(client,id);
      const row=(await client.query('UPDATE story_packages SET name=COALESCE($2,name),date=COALESCE($3,date) WHERE id=$1 RETURNING *',[id,body.name??null,body.date??null])).rows[0];
      await audit(client,user.id,'package.edit','package',id,{name:body.name,date:body.date});return row;
    })};
  });
  app.post('/api/packages/:id/approve',async req=>{
    const user=requireUser(req);requireOwner(user);
    const id=idSchema.parse((req.params as any).id),body=z.object({expectedVersion:z.number().int().positive()}).strict().parse(req.body);
    return {data:await transaction(async client=>{
      const pkg=await lockPackage(client,id);
      if(pkg.version!==body.expectedVersion)throw new HttpError(409,'بسته تغییر کرده است؛ ترتیب تازه را بررسی کنید.');
      const items=(await client.query('SELECT * FROM content WHERE package_id=$1 AND published_at IS NULL AND trashed_at IS NULL ORDER BY package_position NULLS LAST,id FOR UPDATE',[id])).rows;
      if(!items.length)throw new HttpError(422,'بسته استوری منتشرنشده‌ای برای تأیید ندارد.');
      for(const item of items)await validateAssets(client,pkg.page_id,item.type,item.data,true);
      const signature=await packageSignature(client,id);
      await client.query("UPDATE content SET state='approved',approved_revision=revision,approved_by=$2,approved_at=now(),claim_user_id=NULL,claim_revision=NULL,claimed_at=NULL WHERE package_id=$1 AND published_at IS NULL AND trashed_at IS NULL",[id,user.id]);
      const result=(await client.query('UPDATE story_packages SET approved_signature=$2,approved_by=$3,approved_at=now() WHERE id=$1 RETURNING *',[id,JSON.stringify(signature),user.id])).rows[0];
      await audit(client,user.id,'package.approve','package',id,{version:pkg.version,signature});
      for(const recipient of new Set<string>(items.flatMap(x=>[x.creator_id,x.followup_user_id])))if(recipient!==user.id)await notify(client,recipient,'package_approved','ترتیب استوری‌های باقی‌مانده برای انتشار تأیید شد.',{packageId:id,pageId:pkg.page_id,href:`/pages/${pkg.page_id}`},user.id,`package-approved:${id}:${pkg.version}:${recipient}`);
      return result;
    })};
  });
  app.post('/api/packages/:id/reorder',async req=>{
    const user=requireUser(req),id=idSchema.parse((req.params as any).id);
    const body=z.object({expectedVersion:z.number().int().positive(),items:z.array(idSchema).max(500)}).strict().parse(req.body);
    return {data:await transaction(async client=>{
      const pkg=await lockPackage(client,id);authorize(user,pkg.page_id,'edit');
      if(pkg.version!==body.expectedVersion)throw new HttpError(409,'بسته تغییر کرده است؛ ترتیب تازه را دریافت کنید.');
      const rows=(await client.query('SELECT * FROM content WHERE package_id=$1 AND trashed_at IS NULL ORDER BY package_position NULLS LAST,id FOR UPDATE',[id])).rows;
      if(body.items.length!==rows.length||new Set(body.items).size!==rows.length||rows.some(r=>!body.items.includes(r.id)))throw new HttpError(422,'ترتیب باید شامل تمام استوری‌های بسته باشد.');
      if(rows.some((r,index)=>r.published_at&&body.items[index]!==r.id))throw new HttpError(409,'جایگاه استوری منتشرشده قابل تغییر نیست.');
      const positions=rows.map((r,index)=>r.package_position??index+1);
      // Vacate positive positions before assigning the new permutation. The unique
      // visible-position index is immediate; every temporary value remains private
      // to this transaction and published rows are never touched.
      for(const [index,row] of rows.entries())if(!row.published_at)await client.query('UPDATE content SET package_position=$2 WHERE id=$1',[row.id,-index-1]);
      for(const [index,contentId] of body.items.entries())await client.query('UPDATE content SET package_position=$2 WHERE id=$1 AND published_at IS NULL',[contentId,positions[index]]);
      await invalidatePackage(client,id);
      await audit(client,user.id,'package.reorder','package',id,{before:rows.map(r=>r.id),after:body.items});
      return {version:pkg.version+1};
    })};
  });
  app.post('/api/packages/:id/publish',async req=>{
    const user=requireUser(req),id=idSchema.parse((req.params as any).id),body=z.object({items:z.array(z.object({id:idSchema,revision:z.number().int().positive()}).strict()).min(1).max(100)}).strict().parse(req.body);
    if(new Set(body.items.map(x=>x.id)).size!==body.items.length)throw new HttpError(422,'هر استوری را فقط یک‌بار انتخاب کنید.');
    return {data:await transaction(async client=>{
      const pkg=await lockPackage(client,id);
      const items=(await client.query('SELECT * FROM content WHERE package_id=$1 AND id=ANY($2::uuid[]) ORDER BY package_position NULLS LAST,id FOR UPDATE',[id,body.items.map(x=>x.id)])).rows;
      if(items.length!==body.items.length)throw new HttpError(422,'استوری انتخاب‌شده عضو این بسته نیست.');
      for(const item of items) {
        checkRevision(item,body.items.find(x=>x.id===item.id)!.revision,true);
        if(item.published_at)continue;
        await requireApproval(client,item);
        if(item.claim_user_id&&item.claim_user_id!==user.id)throw new HttpError(409,'عضو دیگری در حال آماده‌سازی یکی از استوری‌ها است.');
      }
      const at=new Date(),published=[];
      for(const item of items)published.push(await recordPublication(client,item,user.id,undefined,at));
      await refreshPackageSignature(client,id);
      await audit(client,user.id,'package.publish','package',id,{items:body.items});return {items:published,packageId:pkg.id};
    })};
  });
  app.delete('/api/content/:id',async req=>{
    const user=requireUser(req),id=idSchema.parse((req.params as any).id),body=z.object({expectedRevision:z.number().int().positive()}).strict().parse(req.body);
    return {data:await transaction(async client=>{
      const item=await lockContent(client,id);
      if(!item.package_id)throw new HttpError(422,'برای حذف پست از پیش‌نمایش برنامهٔ انتشار استفاده کنید.');
      const pkg=await lockPackage(client,item.package_id);authorize(user,pkg.page_id,'edit');
      checkRevision(item,body.expectedRevision);
      await invalidatePackage(client,pkg.id);
      const row=(await client.query('UPDATE content SET trashed_at=now(),claim_user_id=NULL,claim_revision=NULL,claimed_at=NULL WHERE id=$1 RETURNING *',[id])).rows[0];
      await audit(client,user.id,'story.trash','content',id,{});
      await notifyOwner(client,user.id,'schedule','یک استوری به سطل زباله منتقل شد.',{contentId:id,pageId:pkg.page_id});return row;
    })};
  });
  app.post('/api/content/:id/restore',async req=>{
    const user=requireUser(req),id=idSchema.parse((req.params as any).id),body=z.object({expectedRevision:z.number().int().positive(),packageId:idSchema.optional(),packagePosition:z.number().int().positive().optional()}).strict().parse(req.body);
    return {data:await transaction(async client=>{
      const item=await lockContent(client,id);
      if(!item.package_id)throw new HttpError(422,'برای بازیابی پست از پیش‌نمایش برنامهٔ انتشار استفاده کنید.');
      const pkg=await lockPackage(client,item.package_id);authorize(user,pkg.page_id,'edit');
      if(!item.trashed_at||item.revision!==body.expectedRevision)throw new HttpError(409,'وضعیت محتوا تغییر کرده است.');
      const destination=body.packageId??pkg.id;
      if(!(await client.query('SELECT id FROM story_packages WHERE id=$1 AND page_id=$2',[destination,pkg.page_id])).rows.length)throw new HttpError(422,'بستهٔ مقصد معتبر نیست.');
      const position=body.packagePosition??(await client.query('SELECT COALESCE(max(package_position),0)+1 AS n FROM content WHERE package_id=$1',[destination])).rows[0].n;
      if((await client.query('SELECT id FROM content WHERE package_id=$1 AND package_position=$2 AND trashed_at IS NULL',[destination,position])).rows.length)throw new HttpError(409,'جایگاه مقصد پر است.');
      await invalidatePackage(client,pkg.id);if(destination!==pkg.id)await invalidatePackage(client,destination);
      const row=(await client.query("UPDATE content SET trashed_at=NULL,package_id=$2,package_position=$3,state='draft',approved_revision=NULL,approved_by=NULL,approved_at=NULL WHERE id=$1 RETURNING *",[id,destination,position])).rows[0];
      await audit(client,user.id,'story.restore','content',id,{packageId:destination,position});return row;
    })};
  });
}
