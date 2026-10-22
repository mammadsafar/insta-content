import type {PoolClient} from 'pg';
import {z} from 'zod';
import {HttpError,audit,notify} from '../core/security.js';
import {nextDayReminder} from '../core/time.js';

export const idSchema=z.string().uuid();
export const revisionSchema=z.object({expectedRevision:z.number().int().positive(),reason:z.string().trim().max(10000).optional()});
export const dateSchema=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s=>!Number.isNaN(Date.parse(s+'T12:00:00Z'))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s,'تاریخ معتبر نیست.');
export const timeSchema=z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const isStory=(type:string)=>type.endsWith('_story');
export async function lockPage(client:PoolClient,pageId:string) {
  const row=(await client.query('SELECT * FROM pages WHERE id=$1 FOR UPDATE',[pageId])).rows[0];
  if(!row) throw new HttpError(404,'صفحه پیدا نشد.');
  return row;
}
export async function lockContent(client:PoolClient,id:string) {
  const ref=(await client.query('SELECT page_id FROM content WHERE id=$1',[id])).rows[0];
  if(!ref) throw new HttpError(404,'محتوا پیدا نشد.');
  await lockPage(client,ref.page_id);
  return (await client.query('SELECT * FROM content WHERE id=$1 FOR UPDATE',[id])).rows[0];
}
export function checkRevision(content:any,expected:number,allowPublished=false) {
  if(content.revision!==expected) throw new HttpError(409,'نسخهٔ محتوا تغییر کرده است؛ دوباره بارگذاری کنید.','REVISION_CONFLICT');
  if(!allowPublished&&content.published_at) throw new HttpError(409,'محتوای منتشرشده قابل تغییر نیست.');
  if(content.trashed_at) throw new HttpError(409,'ابتدا محتوا را از سطل زباله بازیابی کنید.');
}
export async function validateAssets(client:PoolClient,pageId:string,type:string,data:any,complete:boolean) {
  const refs=[...(data.assets??[]).map((id:string)=>({id,purpose:'content'})),...(data.coverId?[{id:data.coverId,purpose:'content'}]:[]),...(data.music?.audioId?[{id:data.music.audioId,purpose:'music'}]:[])];
  if(complete&&!(data.assets?.length)) throw new HttpError(422,'برای ارسال تأیید، فایل نهایی را اضافه کنید.');
  const rows=refs.length?(await client.query('SELECT * FROM assets WHERE id=ANY($1::uuid[])',[refs.map(x=>x.id)])).rows:[];
  for(const ref of refs) {
    const row=rows.find(x=>x.id===ref.id);
    if(!row||row.page_id!==pageId||row.purpose!==ref.purpose||!row.completed) throw new HttpError(422,'فایل نامعتبر است یا بارگذاری آن کامل نشده است.');
  }
  const media=(data.assets??[]).map((id:string)=>rows.find(x=>x.id===id));
  if(new Set(data.assets??[]).size!==(data.assets??[]).length) throw new HttpError(422,'یک فایل را دوبار انتخاب نکنید.');
  if(['image','image_story','reel','video_story'].includes(type)&&media.length>1) throw new HttpError(422,'این نوع محتوا فقط یک فایل می‌پذیرد.');
  if(type.startsWith('image')&&media.some((x:any)=>!x.mime_type.startsWith('image/'))) throw new HttpError(422,'این محتوا به فایل تصویر نیاز دارد.');
  if(['reel','video_story','video_carousel'].includes(type)&&media.some((x:any)=>!x.mime_type.startsWith('video/'))) throw new HttpError(422,'این محتوا به فایل ویدیو نیاز دارد.');
  if(data.coverId&&!rows.find(x=>x.id===data.coverId)?.mime_type.startsWith('image/')) throw new HttpError(422,'کاور باید تصویر باشد.');
}
export async function invalidatePackage(client:PoolClient,packageId:string|null) {
  if(!packageId)return;
  await client.query('UPDATE story_packages SET version=version+1,approved_signature=NULL,approved_by=NULL,approved_at=NULL WHERE id=$1',[packageId]);
  await client.query("UPDATE content SET state='draft',approved_revision=NULL,approved_by=NULL,approved_at=NULL,claim_user_id=NULL,claim_revision=NULL,claimed_at=NULL WHERE package_id=$1 AND published_at IS NULL AND state='approved'",[packageId]);
}
export async function packageSignature(client:PoolClient,packageId:string) {
  return (await client.query('SELECT id,revision,package_position FROM content WHERE package_id=$1 AND published_at IS NULL AND trashed_at IS NULL ORDER BY package_position NULLS LAST,id',[packageId])).rows;
}
export async function requireApproval(client:PoolClient,content:any) {
  if(content.state!=='approved'||content.approved_revision!==content.revision) throw new HttpError(409,'این نسخه هنوز تأیید نشده است.');
  if(content.package_id) {
    const pkg=(await client.query('SELECT * FROM story_packages WHERE id=$1',[content.package_id])).rows[0];
    if(!pkg?.approved_signature||JSON.stringify(pkg.approved_signature)!==JSON.stringify(await packageSignature(client,pkg.id))) throw new HttpError(409,'ترتیب یا نسخهٔ استوری‌ها تغییر کرده است؛ تأیید دوبارهٔ بسته لازم است.');
  }
}
export async function refreshPackageSignature(client:PoolClient,packageId:string|null) {
  if(packageId) await client.query('UPDATE story_packages SET approved_signature=$2::jsonb WHERE id=$1 AND approved_signature IS NOT NULL',[packageId,JSON.stringify(await packageSignature(client,packageId))]);
}
export async function recordPublication(client:PoolClient,content:any,userId:string,url:string|undefined,at:Date) {
  if(content.published_at)return content;
  const row=(await client.query("UPDATE content SET state='published',published_at=$2,published_by=$3,publication_url=$4,claim_user_id=NULL,claim_revision=NULL,claimed_at=NULL,updated_at=now() WHERE id=$1 RETURNING *",[content.id,at,userId,url??null])).rows[0];
  const page=(await client.query('SELECT * FROM pages WHERE id=$1',[content.page_id])).rows[0];
  for(const checkpoint of ['first_hour','next_day']) {
    const dueAt=checkpoint==='first_hour'?new Date(at.getTime()+3600000):nextDayReminder(at,page.settings.nextDayReminderTime);
    const dedupe=`analytics:${content.id}:${checkpoint}`;
    await client.query("INSERT INTO jobs(dedupe_key,type,payload,run_at) VALUES ($1,'analytics_reminder',$2,$3) ON CONFLICT(dedupe_key) DO NOTHING",[dedupe,{contentId:content.id,pageId:content.page_id,checkpoint},dueAt]);
    await client.query("INSERT INTO work_items(dedupe_key,type,page_id,content_id,checkpoint,assignee_id,due_at) VALUES ($1,'analytics',$2,$3,$4,$5,$6) ON CONFLICT(dedupe_key) DO NOTHING",[dedupe,content.page_id,content.id,checkpoint,content.followup_user_id,dueAt]);
  }
  await audit(client,userId,'content.publish','content',content.id,{revision:content.revision,publishedAt:at.toISOString()});
  return row;
}
export async function notifyOwner(client:PoolClient,actorId:string,type:string,title:string,target:any,dedupe?:string) {
  const owners=(await client.query("SELECT id FROM users WHERE role='owner' AND active")).rows;
  for(const owner of owners) await notify(client,owner.id,type,title,target,actorId,dedupe?`${dedupe}:${owner.id}`:undefined);
}
