import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {one,query,transaction} from '../core/db.js';
import {HttpError,requireUser,requireOwner,authorize,audit} from '../core/security.js';
import {idSchema,dateSchema,timeSchema,revisionSchema,isStory,lockPage,lockContent,checkRevision,validateAssets,invalidatePackage,requireApproval,recordPublication,refreshPackageSignature,notifyOwner} from './content-core.js';

const typeSchema=z.enum(['reel','image','image_carousel','video_carousel','mixed_carousel','image_story','video_story']);
const text=z.string().max(20000);
const fields={type:typeSchema.optional(),title:text.optional(),caption:text.optional(),topic:z.string().max(200).optional(),scenario:text.optional(),hook:text.optional(),description:text.optional(),cta:text.optional(),assets:z.array(idSchema).max(30).optional(),coverId:idSchema.nullable().optional(),music:z.object({mode:z.enum(['embedded','instagram','none']).optional(),audioId:idSchema.nullable().optional(),url:z.url().max(2000).optional(),trackName:text.optional(),notes:text.optional(),offsetSeconds:z.number().nonnegative().optional(),volume:text.optional()}).strict().nullable().optional(),packageId:idSchema.nullable().optional(),packagePosition:z.number().int().positive().optional(),scheduledDate:dateSchema.nullable().optional(),scheduledOrder:z.number().int().min(1).max(1000).optional(),scheduledTime:timeSchema.nullable().optional()};
const outputKeys=['title','caption','topic','scenario','hook','description','cta','assets','coverId','music'];
const patchSchema=z.object({...fields,expectedRevision:z.number().int().positive(),followupUserId:idSchema.optional()}).strict();
const publicationSchema=revisionSchema.extend({url:z.url().max(2000).optional()}).strict();
function jsonEqual(a:unknown,b:unknown):boolean {
  if(a===b)return true;
  if(!a||!b||typeof a!=='object'||typeof b!=='object')return false;
  const ak=Object.keys(a).sort(),bk=Object.keys(b).sort();
  return ak.join(',')===bk.join(',')&&ak.every(k=>jsonEqual((a as any)[k],(b as any)[k]));
}
async function assignPackage(client:any,pageId:string,type:string,packageId:string|null,position?:number,currentId?:string) {
  if(!isStory(type)) {
    if(packageId)throw new HttpError(422,'فقط استوری می‌تواند عضو بسته باشد.');
    return null;
  }
  if(!packageId)throw new HttpError(422,'برای استوری یک بسته انتخاب کنید.');
  const pkg=(await client.query('SELECT * FROM story_packages WHERE id=$1 AND page_id=$2',[packageId,pageId])).rows[0];
  if(!pkg)throw new HttpError(422,'بستهٔ استوری معتبر نیست.');
  if(position) {
    const occupied=(await client.query('SELECT id FROM content WHERE package_id=$1 AND package_position=$2 AND trashed_at IS NULL AND id<>COALESCE($3::uuid,gen_random_uuid())',[packageId,position,currentId??null])).rows[0];
    if(occupied)throw new HttpError(409,'این جایگاه در بسته پر است؛ جایگاه دیگری انتخاب کنید.');
  }
  return pkg;
}
async function directSchedule(client:any,row:any,body:any) {
  if(!Object.keys(body).some(k=>k.startsWith('scheduled')))return;
  if(isStory(row.type))throw new HttpError(422,'تاریخ استوری از بستهٔ آن تعیین می‌شود.');
  const previous=(await client.query('SELECT * FROM schedule_slots WHERE content_id=$1',[row.id])).rows[0];
  const date=body.scheduledDate===undefined?previous?.date:body.scheduledDate;
  await client.query('DELETE FROM schedule_slots WHERE content_id=$1',[row.id]);
  if(date) {
    const position=body.scheduledOrder??previous?.position??1;
    const taken=(await client.query('SELECT content_id FROM schedule_slots WHERE page_id=$1 AND date=$2 AND position=$3',[row.page_id,date,position])).rows[0];
    if(taken)throw new HttpError(409,'جایگاه پر است؛ از پیش‌نمایش درج یا جابه‌جایی استفاده کنید.');
    await client.query('INSERT INTO schedule_slots(page_id,date,position,time,content_id) VALUES ($1,$2,$3,$4,$5)',[row.page_id,date,position,body.scheduledTime===undefined?previous?.time??null:body.scheduledTime,row.id]);
  }
  await client.query('UPDATE pages SET schedule_version=schedule_version+1 WHERE id=$1',[row.page_id]);
}

export async function registerContent(app:FastifyInstance) {
  app.get('/api/pages/:pageId/content',async req=>{
    requireUser(req);const {pageId}=req.params as any;idSchema.parse(pageId);
    const filters=z.object({state:z.enum(['draft','awaiting_approval','changes_required','approved','published']).optional(),kind:z.enum(['post','story']).optional(),trash:z.enum(['1','true','0','false']).optional()}).parse(req.query);
    return {data:await query(`SELECT c.*,s.date AS scheduled_date,s.position AS scheduled_order,s.time AS scheduled_time,
      (SELECT count(*)::int FROM feedback f WHERE f.content_id=c.id AND NOT f.resolved) AS open_feedback_count,
      (SELECT count(*)::int FROM analytics_snapshots a WHERE a.content_id=c.id AND finalized) AS analytics_count
      FROM content c LEFT JOIN schedule_slots s ON s.content_id=c.id WHERE c.page_id=$1
      AND ($2::text IS NULL OR c.state=$2) AND ($3::text IS NULL OR CASE WHEN $3='story' THEN c.type LIKE '%_story' ELSE c.type NOT LIKE '%_story' END)
      AND ((c.trashed_at IS NOT NULL)=$4) ORDER BY s.date NULLS LAST,s.position,c.created_at DESC`,[pageId,filters.state??null,filters.kind??null,['1','true'].includes(filters.trash??'')])};
  });
  app.post('/api/pages/:pageId/content',async req=>{
    const user=requireUser(req),{pageId}=req.params as any;idSchema.parse(pageId);authorize(user,pageId,'edit');
    const body=z.object({...fields,type:typeSchema}).strict().parse(req.body);
    return {data:await transaction(async client=>{
      await lockPage(client,pageId);
      const pkg=await assignPackage(client,pageId,body.type,body.packageId??null,body.packagePosition);
      const data=Object.fromEntries(outputKeys.filter(k=>(body as any)[k]!==undefined).map(k=>[k,(body as any)[k]]));
      await validateAssets(client,pageId,body.type,data,false);
      const pos=body.packagePosition??(pkg?(await client.query('SELECT COALESCE(max(package_position),0)+1 AS n FROM content WHERE package_id=$1',[pkg.id])).rows[0].n:null);
      const row=(await client.query('INSERT INTO content(page_id,type,data,creator_id,followup_user_id,package_id,package_position) VALUES ($1,$2,$3,$4,$4,$5,$6) RETURNING *',[pageId,body.type,data,user.id,pkg?.id??null,pos])).rows[0];
      await client.query('INSERT INTO content_revisions(content_id,revision,data,author_id) VALUES ($1,1,$2,$3)',[row.id,{...data,type:row.type},user.id]);
      await directSchedule(client,row,body);await invalidatePackage(client,pkg?.id??null);
      await audit(client,user.id,'content.create','content',row.id,{});return row;
    })};
  });
  app.get('/api/content/:id',async req=>{
    requireUser(req);const id=idSchema.parse((req.params as any).id);
    const row=await one('SELECT c.*,s.date AS scheduled_date,s.position AS scheduled_order,s.time AS scheduled_time FROM content c LEFT JOIN schedule_slots s ON s.content_id=c.id WHERE c.id=$1',[id]);
    if(!row)throw new HttpError(404,'محتوا پیدا نشد.');
    const [revisions,feedback,assets]=await Promise.all([
      query('SELECT r.*,u.name AS author_name FROM content_revisions r JOIN users u ON u.id=r.author_id WHERE content_id=$1 ORDER BY revision DESC',[id]),
      query('SELECT f.*,u.name AS author_name FROM feedback f JOIN users u ON u.id=f.author_id WHERE content_id=$1 ORDER BY created_at',[id]),
      query('SELECT id,original_name,mime_type,size,width,height,completed,thumbnail_key IS NOT NULL AS has_thumbnail,purpose FROM assets WHERE id=ANY($1::uuid[])',[[...(row.data.assets??[]),row.data.coverId,row.data.music?.audioId].filter(Boolean)]),
    ]);return {data:{...row,revisions,feedback,assets}};
  });
  app.patch('/api/content/:id',async req=>{
    const user=requireUser(req),id=idSchema.parse((req.params as any).id),body=patchSchema.parse(req.body);
    return {data:await transaction(async client=>{
      const row=await lockContent(client,id);authorize(user,row.page_id,'edit');checkRevision(row,body.expectedRevision);
      if(body.followupUserId) {
        requireOwner(user);
        if(!(await client.query('SELECT id FROM users WHERE id=$1 AND active',[body.followupUserId])).rows.length)throw new HttpError(422,'مسئول پیگیری معتبر نیست.');
        await client.query('UPDATE content SET followup_user_id=$2 WHERE id=$1',[id,body.followupUserId]);
        await client.query('UPDATE work_items SET assignee_id=$2 WHERE content_id=$1 AND completed_at IS NULL',[id,body.followupUserId]);
        await audit(client,user.id,'content.assign','content',id,{assigneeId:body.followupUserId});
      }
      const type=body.type??row.type,packageId=body.packageId===undefined?row.package_id:body.packageId;
      const packagePosition=body.packagePosition??row.package_position;
      await assignPackage(client,row.page_id,type,packageId,packagePosition,id);
      const data={...row.data,...Object.fromEntries(outputKeys.filter(k=>(body as any)[k]!==undefined).map(k=>[k,(body as any)[k]]))};
      await validateAssets(client,row.page_id,type,data,false);
      const changed=type!==row.type||!jsonEqual(data,row.data),sequenceChanged=packageId!==row.package_id||packagePosition!==row.package_position;
      if(changed) {
        await client.query("UPDATE content SET type=$2,data=$3,revision=revision+1,state='draft',approved_revision=NULL,approved_by=NULL,approved_at=NULL,claim_user_id=NULL,claim_revision=NULL,claimed_at=NULL,updated_at=now() WHERE id=$1",[id,type,data]);
        await client.query('INSERT INTO content_revisions(content_id,revision,data,author_id) VALUES ($1,$2,$3,$4)',[id,row.revision+1,{...data,type},user.id]);
      }
      if(sequenceChanged)await client.query('UPDATE content SET package_id=$2,package_position=$3 WHERE id=$1',[id,packageId,packagePosition]);
      if(changed||sequenceChanged) {
        await invalidatePackage(client,row.package_id);
        if(packageId!==row.package_id)await invalidatePackage(client,packageId);
      }
      await directSchedule(client,{...row,type},body);
      await audit(client,user.id,'content.edit','content',id,{fromRevision:row.revision,toRevision:row.revision+(changed?1:0),sequenceChanged});
      return (await client.query('SELECT * FROM content WHERE id=$1',[id])).rows[0];
    })};
  });
  for(const action of ['submit','approve','revoke'] as const)app.post(`/api/content/:id/${action}`,async req=>{
    const user=requireUser(req),id=idSchema.parse((req.params as any).id),body=revisionSchema.strict().parse(req.body);
    return {data:await transaction(async client=>{
      const row=await lockContent(client,id);checkRevision(row,body.expectedRevision);
      if(action==='submit')authorize(user,row.page_id,'edit');else requireOwner(user);
      if(action==='approve'&&isStory(row.type))throw new HttpError(409,'استوری‌ها باید به‌ترتیب در بسته تأیید شوند.');
      if(action!=='revoke')await validateAssets(client,row.page_id,row.type,row.data,true);
      if(action==='approve'&&row.state!=='awaiting_approval')throw new HttpError(409,'ابتدا این نسخه را برای تأیید ارسال کنید.');
      if(action==='submit'&&row.state==='approved')throw new HttpError(409,'این نسخه قبلاً تأیید شده است.');
      if(action==='revoke') {
        if(!body.reason?.trim())throw new HttpError(422,'دلیل درخواست اصلاح را بنویسید.');
        await client.query('INSERT INTO feedback(content_id,revision,author_id,text) VALUES ($1,$2,$3,$4)',[id,row.revision,user.id,body.reason]);
        await invalidatePackage(client,row.package_id);
      }
      const state=action==='submit'?'awaiting_approval':action==='approve'?'approved':'changes_required';
      const result=(await client.query('UPDATE content SET state=$2,approved_revision=$3,approved_by=$4,approved_at=$5,claim_user_id=NULL,claim_revision=NULL,claimed_at=NULL,updated_at=now() WHERE id=$1 RETURNING *',[id,state,action==='approve'?row.revision:null,action==='approve'?user.id:null,action==='approve'?new Date():null])).rows[0];
      await audit(client,user.id,`content.${action}`,'content',id,{revision:row.revision,reason:body.reason});
      if(action==='submit')await notifyOwner(client,user.id,'approval','محتوای تازه در انتظار تأیید است.',{contentId:id,pageId:row.page_id},`approval:${id}:${row.revision}`);
      return result;
    })};
  });
  app.post('/api/content/:id/feedback',async req=>{
    const user=requireUser(req),id=idSchema.parse((req.params as any).id);
    const body=z.object({text:z.string().trim().max(10000).optional(),audioId:idSchema.optional(),assetId:idSchema.optional(),offsetSeconds:z.number().nonnegative().max(86400).optional(),parentId:idSchema.optional()}).strict().refine(x=>Boolean(x.text||x.audioId),'متن یا فایل صوتی لازم است.').parse(req.body);
    return {data:await transaction(async client=>{
      const row=await lockContent(client,id);authorize(user,row.page_id,'suggest');
      if(body.audioId&&!(await client.query("SELECT id FROM assets WHERE id=$1 AND page_id=$2 AND purpose='feedback' AND completed",[body.audioId,row.page_id])).rows.length)throw new HttpError(422,'فایل صوتی معتبر نیست.');
      if(body.assetId&&!(row.data.assets??[]).includes(body.assetId))throw new HttpError(422,'فایل انتخاب‌شده در این نسخه نیست.');
      if(body.parentId&&!(await client.query('SELECT id FROM feedback WHERE id=$1 AND content_id=$2 AND revision=$3',[body.parentId,id,row.revision])).rows.length)throw new HttpError(422,'بازخورد والد مربوط به این نسخه نیست.');
      const result=(await client.query('INSERT INTO feedback(content_id,revision,author_id,text,audio_id,asset_id,offset_seconds,parent_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',[id,row.revision,user.id,body.text??null,body.audioId??null,body.assetId??null,body.offsetSeconds??null,body.parentId??null])).rows[0];
      await audit(client,user.id,'feedback.create','content',id,{feedbackId:result.id,revision:row.revision});return result;
    })};
  });
  app.patch('/api/feedback/:id',async req=>{
    const user=requireUser(req),id=idSchema.parse((req.params as any).id),body=z.object({resolved:z.boolean()}).strict().parse(req.body);
    return {data:await transaction(async client=>{
      const feedback=(await client.query('SELECT * FROM feedback WHERE id=$1',[id])).rows[0];if(!feedback)throw new HttpError(404,'بازخورد پیدا نشد.');
      const row=await lockContent(client,feedback.content_id);authorize(user,row.page_id,'suggest');
      if(user.role!=='owner'&&user.id!==feedback.author_id)authorize(user,row.page_id,'edit');
      await audit(client,user.id,'feedback.resolve','feedback',id,{resolved:body.resolved});
      return (await client.query('UPDATE feedback SET resolved=$2,resolved_by=$3,resolved_at=$4 WHERE id=$1 RETURNING *',[id,body.resolved,body.resolved?user.id:null,body.resolved?new Date():null])).rows[0];
    })};
  });
  for(const action of ['claim','release','publish'] as const)app.post(`/api/content/:id/${action}`,async req=>{
    const user=requireUser(req),id=idSchema.parse((req.params as any).id),body=publicationSchema.parse(req.body);
    return {data:await transaction(async client=>{
      const row=await lockContent(client,id);checkRevision(row,body.expectedRevision,true);
      if(row.published_at) {if(action==='publish')return row;throw new HttpError(409,'این محتوا منتشر شده است.');}
      if(action==='release') {
        if(row.claim_user_id&&row.claim_user_id!==user.id)requireOwner(user);
        return (await client.query('UPDATE content SET claim_user_id=NULL,claim_revision=NULL,claimed_at=NULL WHERE id=$1 RETURNING *',[id])).rows[0];
      }
      await requireApproval(client,row);
      if(row.claim_user_id&&row.claim_user_id!==user.id)throw new HttpError(409,'عضو دیگری در حال آماده‌سازی انتشار است.','CLAIM_CONFLICT');
      if(action==='claim')return (await client.query('UPDATE content SET claim_user_id=$2,claim_revision=revision,claimed_at=COALESCE(claimed_at,now()) WHERE id=$1 RETURNING *',[id,user.id])).rows[0];
      if(row.claim_revision&&row.claim_revision!==row.revision)throw new HttpError(409,'نسخهٔ آماده‌سازی تغییر کرده است؛ دوباره بررسی کنید.');
      const published=await recordPublication(client,row,user.id,body.url,new Date());
      await refreshPackageSignature(client,row.package_id);return published;
    })};
  });
  app.patch('/api/content/:id/publication-url',async req=>{
    const user=requireUser(req),id=idSchema.parse((req.params as any).id),{url}=z.object({url:z.url().max(2000)}).strict().parse(req.body);
    return {data:await transaction(async client=>{
      const row=await lockContent(client,id);if(!row.published_at)throw new HttpError(409,'ابتدا انتشار را ثبت کنید.');
      await audit(client,user.id,'publication.url','content',id,{from:row.publication_url,to:url});
      return (await client.query('UPDATE content SET publication_url=$2 WHERE id=$1 RETURNING *',[id,url])).rows[0];
    })};
  });
}
