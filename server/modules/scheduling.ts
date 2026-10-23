import type {FastifyInstance} from 'fastify';
import type {PoolClient} from 'pg';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import {query,transaction} from '../core/db.js';
import {requireUser,authorize,audit,HttpError} from '../core/security.js';
import {localDate} from '../core/time.js';
import {idSchema,dateSchema,timeSchema,lockPage,isStory,notifyOwner} from './content-core.js';
import {planSchedule,type Slot,type ScheduleRequest} from './schedule-plan.js';

const requestSchema=z.object({operation:z.enum(['swap','insert','delete','restore']),contentId:idSchema,targetId:idSchema.optional(),slot:z.object({date:dateSchema,position:z.number().int().min(1).max(1000),time:timeSchema.nullable().optional()}).strict().optional()}).strict();
function fingerprint(value:unknown){return createHash('sha256').update(JSON.stringify(value)).digest('hex');}
const slotSignature=(slots:Slot[])=>slots.map(x=>[x.contentId,x.date,x.position,x.time??null]);
async function preview(client:PoolClient,pageId:string,body:ScheduleRequest,page:any) {
  const content=(await client.query('SELECT id,type,published_at,trashed_at,revision FROM content WHERE page_id=$1 ORDER BY id',[pageId])).rows;
  const item=content.find(x=>x.id===body.contentId);
  if(!item)throw new HttpError(404,'محتوا در این صفحه پیدا نشد.');
  if(item.published_at||isStory(item.type))throw new HttpError(409,'این عملیات فقط برای پست منتشرنشده است.');
  if(body.operation==='restore'?!item.trashed_at:Boolean(item.trashed_at))throw new HttpError(409,body.operation==='restore'?'محتوا در سطل زباله نیست.':'ابتدا محتوا را بازیابی کنید.');
  if(body.slot&&body.slot.date<localDate())throw new HttpError(422,'برای جابه‌جایی، تاریخ امروز یا آینده را انتخاب کنید.');
  const before=(await client.query('SELECT content_id AS "contentId",date,position,time::text FROM schedule_slots WHERE page_id=$1 ORDER BY date,position',[pageId])).rows.map(x=>({...x,time:x.time?.slice(0,5)??null})) as Slot[];
  const published=new Set(content.filter(x=>x.published_at).map(x=>x.id));
  if(body.targetId&&published.has(body.targetId))throw new HttpError(409,'جایگاه محتوای منتشرشده قفل است.');
  const rules=(await client.query('SELECT * FROM schedule_rules WHERE page_id=$1 ORDER BY effective_date',[pageId])).rows;
  let planned:Slot[];
  try {planned=planSchedule(before.filter(x=>!published.has(x.contentId)),body,rules,before.filter(x=>published.has(x.contentId)));}
  catch(e){throw new HttpError(422,(e as Error).message);}
  const after=[...planned,...before.filter(x=>published.has(x.contentId))].sort((a,b)=>a.date.localeCompare(b.date)||a.position-b.position);
  const changes=[...new Set([...before,...after].map(x=>x.contentId))].map(contentId=>({contentId,from:before.find(x=>x.contentId===contentId)??null,to:after.find(x=>x.contentId===contentId)??null})).filter(x=>JSON.stringify(x.from)!==JSON.stringify(x.to));
  const previewHash=fingerprint({version:page.schedule_version,body,before,after,content});
  return {version:page.schedule_version,previewHash,operation:body.operation,contentId:body.contentId,changes,before,after,sparsePolicy:'occupied-slots',trashBefore:Boolean(item.trashed_at),trashAfter:body.operation==='delete'};
}
async function writeSlots(client:PoolClient,pageId:string,slots:Slot[]) {
  await client.query('DELETE FROM schedule_slots WHERE page_id=$1',[pageId]);
  for(const slot of slots)await client.query('INSERT INTO schedule_slots(page_id,date,position,time,content_id) VALUES ($1,$2,$3,$4,$5)',[pageId,slot.date,slot.position,slot.time,slot.contentId]);
}

export async function registerScheduling(app:FastifyInstance) {
  app.post('/api/pages/:pageId/schedule/preview',async req=>{
    const user=requireUser(req),pageId=idSchema.parse((req.params as any).pageId),body=requestSchema.parse(req.body);authorize(user,pageId,'edit');
    return {data:await transaction(async client=>preview(client,pageId,body,await lockPage(client,pageId)))};
  });
  app.post('/api/pages/:pageId/schedule/apply',async req=>{
    const user=requireUser(req),pageId=idSchema.parse((req.params as any).pageId);authorize(user,pageId,'edit');
    const {expectedVersion,previewHash,...body}=requestSchema.extend({expectedVersion:z.number().int().positive(),previewHash:z.string().regex(/^[a-f0-9]{64}$/)}).parse(req.body);
    return {data:await transaction(async client=>{
      const page=await lockPage(client,pageId);
      if(page.schedule_version!==expectedVersion)throw new HttpError(409,'برنامه تغییر کرده است؛ پیش‌نمایش تازه بگیرید.','SCHEDULE_CONFLICT');
      const plan=await preview(client,pageId,body,page);
      if(plan.previewHash!==previewHash)throw new HttpError(409,'پیش‌نمایش معتبر نیست یا محتوا تغییر کرده است.','PREVIEW_CONFLICT');
      await writeSlots(client,pageId,plan.after);
      if(body.operation==='delete')await client.query('UPDATE content SET trashed_at=now(),claim_user_id=NULL,claim_revision=NULL,claimed_at=NULL WHERE id=$1',[body.contentId]);
      if(body.operation==='restore')await client.query('UPDATE content SET trashed_at=NULL WHERE id=$1',[body.contentId]);
      const version=expectedVersion+1;
      await client.query('UPDATE pages SET schedule_version=$2 WHERE id=$1',[pageId,version]);
      const operation=(await client.query('INSERT INTO schedule_operations(page_id,actor_id,operation,before_state,after_state,applied_version) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',[pageId,user.id,body.operation,{slots:plan.before,contentId:body.contentId,trashed:plan.trashBefore},{slots:plan.after,contentId:body.contentId,trashed:plan.trashAfter},version])).rows[0];
      await audit(client,user.id,'schedule.apply','page',pageId,{operationId:operation.id,operation:body.operation,changes:plan.changes});
      await notifyOwner(client,user.id,'schedule','برنامهٔ انتشار به‌روزرسانی شد.',{pageId,operationId:operation.id,changedCount:plan.changes.length});
      return {...plan,version,operationId:operation.id};
    })};
  });
  app.post('/api/pages/:pageId/schedule/undo',async req=>{
    const user=requireUser(req),pageId=idSchema.parse((req.params as any).pageId);authorize(user,pageId,'edit');
    const body=z.object({operationId:idSchema,expectedVersion:z.number().int().positive()}).strict().parse(req.body);
    return {data:await transaction(async client=>{
      const page=await lockPage(client,pageId);
      const op=(await client.query('SELECT * FROM schedule_operations WHERE id=$1 AND page_id=$2 FOR UPDATE',[body.operationId,pageId])).rows[0];
      if(!op||op.undone||op.applied_version!==page.schedule_version||body.expectedVersion!==page.schedule_version)throw new HttpError(409,'این عملیات دیگر با اطمینان قابل بازگشت نیست.');
      const live=(await client.query('SELECT content_id AS "contentId",date,position,time::text FROM schedule_slots WHERE page_id=$1 ORDER BY date,position',[pageId])).rows.map(x=>({...x,time:x.time?.slice(0,5)??null}));
      if(JSON.stringify(slotSignature(live))!==JSON.stringify(slotSignature(op.after_state.slots)))throw new HttpError(409,'جایگاه‌ها پس از این عملیات تغییر کرده‌اند.');
      const changedIds=new Set<string>([...op.before_state.slots,...op.after_state.slots].filter((x:Slot)=>JSON.stringify(op.before_state.slots.find((s:Slot)=>s.contentId===x.contentId))!==JSON.stringify(op.after_state.slots.find((s:Slot)=>s.contentId===x.contentId))).map((x:Slot)=>x.contentId));
      changedIds.add(op.before_state.contentId);
      if((await client.query('SELECT id FROM content WHERE id=ANY($1::uuid[]) AND published_at IS NOT NULL',[[...changedIds]])).rows.length)throw new HttpError(409,'محتوای مرتبط منتشر شده است و بازگشت ممکن نیست.');
      await writeSlots(client,pageId,op.before_state.slots);
      await client.query('UPDATE content SET trashed_at=CASE WHEN $2 THEN now() ELSE NULL END WHERE id=$1',[op.before_state.contentId,op.before_state.trashed]);
      await client.query('UPDATE schedule_operations SET undone=true WHERE id=$1',[op.id]);
      await client.query('UPDATE pages SET schedule_version=schedule_version+1 WHERE id=$1',[pageId]);
      await audit(client,user.id,'schedule.undo','page',pageId,{operationId:op.id});
      await notifyOwner(client,user.id,'schedule','عملیات برنامهٔ انتشار بازگردانی شد.',{pageId,operationId:op.id});
      return {version:page.schedule_version+1};
    })};
  });
  app.get('/api/pages/:pageId/schedule/rules',async req=>{
    requireUser(req);const pageId=idSchema.parse((req.params as any).pageId);
    return {data:await query('SELECT * FROM schedule_rules WHERE page_id=$1 ORDER BY effective_date',[pageId])};
  });
  app.post('/api/pages/:pageId/schedule/rules',async req=>{
    const user=requireUser(req),pageId=idSchema.parse((req.params as any).pageId);authorize(user,pageId,'edit');
    const body=z.object({effectiveDate:dateSchema,postsPerDay:z.number().int().min(1).max(24),times:z.array(timeSchema).max(24).default([])}).strict().parse(req.body);
    if(body.effectiveDate<localDate()||body.times.length>body.postsPerDay)throw new HttpError(422,'قاعده باید از امروز یا آینده باشد و تعداد ساعت‌ها از جایگاه‌ها بیشتر نباشد.');
    return {data:await transaction(async client=>{
      await lockPage(client,pageId);
      const result=(await client.query('INSERT INTO schedule_rules(page_id,effective_date,posts_per_day,times) VALUES ($1,$2,$3,$4) ON CONFLICT(page_id,effective_date) DO UPDATE SET posts_per_day=EXCLUDED.posts_per_day,times=EXCLUDED.times RETURNING *',[pageId,body.effectiveDate,body.postsPerDay,JSON.stringify(body.times)])).rows[0];
      await client.query('UPDATE pages SET schedule_version=schedule_version+1 WHERE id=$1',[pageId]);
      await audit(client,user.id,'schedule.rules','page',pageId,body);return result;
    })};
  });
}
