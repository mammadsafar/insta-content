import type {FastifyInstance} from 'fastify';
import type {PoolClient} from 'pg';
import {z} from 'zod';
import {one,query,transaction} from '../core/db.js';
import {HttpError,requireUser,audit,can} from '../core/security.js';
import {addDays} from '../core/time.js';

const general=['views','firstHourViews','nextDayViews','viewers','reach','likes','comments','shares','reposts','saves','followersGained','profileVisits','leads','directMessages','orders','attributedSales','salesAttributionNotes'];
const video=['videoDurationSeconds','averageWatchTimeSeconds','skipRatePercentage','reelsTabPercentage','explorePercentage','nonFollowersPercentage'];
const story=['storyReplies','storyLinkTaps','storyForward','storyBack','storyExits'];
const labels:Record<string,string>={views:'بازدید',firstHourViews:'بازدید ساعت اول',nextDayViews:'بازدید روز بعد',viewers:'بینندگان',reach:'حساب‌های دسترسی‌یافته',likes:'پسند',comments:'نظر',shares:'اشتراک‌گذاری',reposts:'بازنشر',saves:'ذخیره',followersGained:'دنبال‌کنندگان جذب‌شده',profileVisits:'بازدید نمایه',leads:'سرنخ',directMessages:'پیام مستقیم',orders:'سفارش',attributedSales:'فروش منتسب (تومان)',salesAttributionNotes:'توضیح انتساب فروش',videoDurationSeconds:'مدت ویدئو (ثانیه)',averageWatchTimeSeconds:'میانگین تماشا (ثانیه)',skipRatePercentage:'نرخ رد کردن',reelsTabPercentage:'درصد زبانه ریلز',explorePercentage:'درصد اکسپلور',nonFollowersPercentage:'درصد غیردنبال‌کنندگان',storyReplies:'پاسخ استوری',storyLinkTaps:'کلیک پیوند',storyForward:'رفتن به بعد',storyBack:'رفتن به قبل',storyExits:'خروج استوری'};
export function fieldsFor(type:string) {return [...general,...(['reel','video_story','video_carousel','mixed_carousel'].includes(type)?video:[]),...(type.endsWith('_story')?story:[])].map(key=>({key,label:labels[key],kind:key==='salesAttributionNotes'?'text':key.endsWith('Percentage')?'percent':'number'}));}
const metrics=z.record(z.string(),z.union([z.number().finite().nonnegative(),z.string().max(10000)]));
const snapshot=z.object({checkpoint:z.enum(['first_hour','next_day','later']),observedAt:z.iso.datetime({offset:true}),metrics,unavailable:z.array(z.string()).max(40).default([]),finalized:z.boolean()});
export function validateMetrics(type:string,checkpoint:string,m:Record<string,number|string>,unavailable:string[],finalized:boolean){
  const fields=fieldsFor(type),allowed=new Map(fields.map(f=>[f.key,f.kind]));
  for(const [key,value] of Object.entries(m)){
    if(!allowed.has(key))throw new HttpError(400,'شاخص برای این نوع محتوا معتبر نیست.');
    if(allowed.get(key)==='text'?typeof value!=='string':typeof value!=='number'||value<0||!Number.isFinite(value)||(allowed.get(key)==='percent'&&value>100))throw new HttpError(400,'مقدار شاخص معتبر نیست.');
  }
  if(new Set(unavailable).size!==unavailable.length||unavailable.some(k=>!allowed.has(k)||Object.hasOwn(m,k)))throw new HttpError(400,'شاخص ناموجود نباید هم‌زمان مقدار داشته باشد.');
  if(finalized){
    const viewKey=checkpoint==='first_hour'?'firstHourViews':checkpoint==='next_day'?'nextDayViews':'views';
    const required=[viewKey,'reach',...(type.endsWith('_story')?['storyExits']:[]),...(['reel','video_story','video_carousel','mixed_carousel'].includes(type)?['averageWatchTimeSeconds']:[])];
    if(required.some(k=>!Object.hasOwn(m,k)&&!unavailable.includes(k)&&!(k===viewKey&&Object.hasOwn(m,'views'))))throw new HttpError(400,'شاخص‌های ضروری را وارد کنید یا ناموجود بودن آن‌ها را مشخص کنید.');
  }
}
async function completeAnalytics(c:PoolClient,contentId:string,checkpoint:string,actor:string){
  if(checkpoint==='later')return;
  await c.query(`UPDATE work_items SET completed_at=COALESCE(completed_at,now()),completed_by=COALESCE(completed_by,$3) WHERE content_id=$1 AND checkpoint=$2`,[contentId,checkpoint,actor]);
}
async function publishedContent(id:string,c?:PoolClient){
  const row=c?(await c.query('SELECT * FROM content WHERE id=$1',[id])).rows[0]:await one('SELECT * FROM content WHERE id=$1',[id]);
  if(!row)throw new HttpError(404,'محتوا پیدا نشد.');
  if(row.state!=='published')throw new HttpError(400,'آمار فقط برای محتوای منتشرشده ثبت می‌شود.');
  return row;
}
function validateObserved(observed:string,published:Date){
  if(Date.parse(observed)<new Date(published).getTime()||Date.parse(observed)>Date.now()+60000)throw new HttpError(400,'زمان مشاهده باید پس از انتشار و پیش از اکنون باشد.');
}
export async function registerAnalytics(app:FastifyInstance):Promise<void>{
  app.get('/api/analytics/fields',async req=>{requireUser(req);const type=z.object({type:z.string()}).parse(req.query).type;return {data:fieldsFor(type)};});
  app.get('/api/content/:id/analytics',async req=>{
    requireUser(req);const id=z.object({id:z.uuid()}).parse(req.params).id;await publishedContent(id);
    return {data:await query(`SELECT s.*,extract(epoch FROM (s.observed_at-c.published_at))/3600 AS elapsed_hours,
      s.checkpoint='first_hour' AND s.observed_at>c.published_at+interval '90 minutes' AS late_entry
      FROM analytics_snapshots s JOIN content c ON c.id=s.content_id WHERE s.content_id=$1 ORDER BY s.observed_at,s.created_at`,[id])};
  });
  app.post('/api/content/:id/analytics',async req=>{
    const user=requireUser(req),id=z.object({id:z.uuid()}).parse(req.params).id,b=snapshot.parse(req.body);
    return {data:await transaction(async c=>{
      const content=await publishedContent(id,c);validateMetrics(content.type,b.checkpoint,b.metrics,b.unavailable,b.finalized);validateObserved(b.observedAt,content.published_at);
      const r=await c.query(`INSERT INTO analytics_snapshots(content_id,checkpoint,observed_at,metrics,unavailable,finalized,submitter_id,finalized_at) VALUES($1,$2,$3,$4,$5,$6,$7,CASE WHEN $6 THEN now() END) RETURNING *`,[id,b.checkpoint,b.observedAt,JSON.stringify(b.metrics),JSON.stringify(b.unavailable),b.finalized,user.id]);
      if(b.finalized)await completeAnalytics(c,id,b.checkpoint,user.id);
      await audit(c,user.id,'analytics.create','analytics',r.rows[0].id,{snapshot:r.rows[0]});return r.rows[0];
    })};
  });
  app.patch('/api/analytics/:id',async req=>{
    const user=requireUser(req),id=z.object({id:z.uuid()}).parse(req.params).id,b=snapshot.omit({checkpoint:true}).partial().extend({expectedVersion:z.number().int().positive()}).parse(req.body);
    return {data:await transaction(async c=>{
      const old=(await c.query('SELECT * FROM analytics_snapshots WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!old)throw new HttpError(404,'آمار پیدا نشد.');
      if(old.version!==b.expectedVersion)throw new HttpError(409,'آمار تغییر کرده است؛ دوباره بارگذاری کنید.');
      const content=await publishedContent(old.content_id,c),m=b.metrics??old.metrics,u=b.unavailable??old.unavailable,f=b.finalized??old.finalized,o=b.observedAt??old.observed_at.toISOString();
      if(old.finalized&&!f)throw new HttpError(400,'آمار نهایی‌شده فقط قابل اصلاح است.');
      validateMetrics(content.type,old.checkpoint,m,u,f);validateObserved(o,content.published_at);
      const r=await c.query(`UPDATE analytics_snapshots SET observed_at=$2,metrics=$3,unavailable=$4,finalized=$5,submitter_id=$6,finalized_at=CASE WHEN $5 THEN COALESCE(finalized_at,now()) END,version=version+1,updated_at=now() WHERE id=$1 RETURNING *`,[id,o,JSON.stringify(m),JSON.stringify(u),f,user.id]);
      if(f)await completeAnalytics(c,old.content_id,old.checkpoint,user.id);
      await audit(c,user.id,'analytics.correct','analytics',id,{before:old,after:r.rows[0]});return r.rows[0];
    })};
  });
  app.get('/api/pages/:pageId/weekly-reports',async req=>{
    const user=requireUser(req),id=z.object({pageId:z.uuid()}).parse(req.params).pageId;
    if(can(user,id,'report'))return {data:await query('SELECT *,period_start::text,period_end::text FROM weekly_reports WHERE page_id=$1 ORDER BY period_start DESC',[id])};
    // Entry users can resume their own unfinished form. Other/finalized periods expose
    // only identity/version/completion so a duplicate submission can be corrected
    // without disclosing the page's analytical values.
    return {data:await query(`SELECT id,page_id,period_start::text,period_end::text,finalized,version,submitted_at,
      NOT(submitter_id=$2 AND NOT finalized) AS restricted,
      CASE WHEN submitter_id=$2 AND NOT finalized THEN metrics ELSE '{}'::jsonb END AS metrics,
      CASE WHEN submitter_id=$2 AND NOT finalized THEN notes ELSE '' END AS notes,
      CASE WHEN submitter_id=$2 AND NOT finalized THEN screenshots ELSE '[]'::jsonb END AS screenshots
      FROM weekly_reports WHERE page_id=$1 ORDER BY period_start DESC`,[id,user.id])};
  });
  app.post('/api/pages/:pageId/weekly-reports',async req=>{
    const user=requireUser(req),id=z.object({pageId:z.uuid()}).parse(req.params).pageId,b=weekly.parse(req.body);
    validateWeekly(b);
    return {data:await transaction(async c=>{
      if(!(await c.query('SELECT id FROM pages WHERE id=$1',[id])).rowCount)throw new HttpError(404,'صفحه پیدا نشد.');
      const r=await c.query(`INSERT INTO weekly_reports(page_id,period_start,period_end,metrics,notes,screenshots,finalized,submitter_id,submitted_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,CASE WHEN $7 THEN now() END) ON CONFLICT(page_id,period_start) DO NOTHING RETURNING *`,[id,b.periodStart,addDays(b.periodStart,7),JSON.stringify(b.metrics),b.notes,JSON.stringify(b.screenshots),b.finalized,user.id]);
      if(!r.rowCount)throw new HttpError(409,'این دوره قبلاً ثبت شده است؛ از اصلاح گزارش استفاده کنید.');
      await screenshotsValid(c,id,b.screenshots,user.id);if(b.finalized)await completeWeekly(c,id,b.periodStart,user.id);
      await audit(c,user.id,'weekly.create','weekly_report',r.rows[0].id,{report:r.rows[0]});return r.rows[0];
    })};
  });
  app.patch('/api/weekly-reports/:id',async req=>{
    const user=requireUser(req),id=z.object({id:z.uuid()}).parse(req.params).id,b=weekly.omit({periodStart:true}).partial().extend({expectedVersion:z.number().int().positive()}).parse(req.body);
    return {data:await transaction(async c=>{
      const old=(await c.query('SELECT *,period_start::text FROM weekly_reports WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!old)throw new HttpError(404,'گزارش پیدا نشد.');
      if(old.version!==b.expectedVersion)throw new HttpError(409,'گزارش تغییر کرده است؛ دوباره بارگذاری کنید.');
      const v={periodStart:old.period_start,metrics:b.metrics??old.metrics,notes:b.notes??old.notes,screenshots:b.screenshots??old.screenshots,finalized:b.finalized??old.finalized};
      if(old.finalized&&!v.finalized)throw new HttpError(400,'گزارش نهایی‌شده فقط قابل اصلاح است.');validateWeekly(v);await screenshotsValid(c,old.page_id,v.screenshots,user.id);
      const r=await c.query(`UPDATE weekly_reports SET metrics=$2,notes=$3,screenshots=$4,finalized=$5,submitter_id=$6,submitted_at=CASE WHEN $5 THEN COALESCE(submitted_at,now()) END,version=version+1 WHERE id=$1 RETURNING *`,[id,JSON.stringify(v.metrics),v.notes,JSON.stringify(v.screenshots),v.finalized,user.id]);
      if(v.finalized)await completeWeekly(c,old.page_id,old.period_start,user.id);
      await audit(c,user.id,'weekly.correct','weekly_report',id,{before:old,after:r.rows[0]});return r.rows[0];
    })};
  });
}
const weekly=z.object({periodStart:z.iso.date(),metrics,notes:z.string().max(20000).default(''),screenshots:z.array(z.uuid()).max(20).default([]),finalized:z.boolean()});
const weeklyKeys=['followersAtEnd','follows','unfollows','views','reach','interactions','profileVisits','directMessages','leads','orders','attributedSales','salesAttributionNotes'];
function validateWeekly(b:z.infer<typeof weekly>){
  if(new Date(`${b.periodStart}T12:00:00Z`).getUTCDay()!==6||addDays(b.periodStart,7)>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tehran'}).format(new Date()))throw new HttpError(400,'دوره باید از شنبه و مربوط به یک هفتهٔ کامل باشد.');
  for(const [k,v] of Object.entries(b.metrics))if(!weeklyKeys.includes(k)||(k==='salesAttributionNotes'?typeof v!=='string':typeof v!=='number'||v<0))throw new HttpError(400,'شاخص گزارش معتبر نیست.');
  if(b.finalized&&!Object.hasOwn(b.metrics,'followersAtEnd'))throw new HttpError(400,'تعداد دنبال‌کنندگان پایان دوره ضروری است.');
}
async function screenshotsValid(c:PoolClient,pageId:string,ids:string[],userId:string){
  if(ids.length&&(await c.query(`SELECT id FROM assets WHERE id=ANY($1::uuid[]) AND page_id=$2 AND purpose='insights' AND completed AND (uploader_id=$3 OR EXISTS(SELECT 1 FROM users WHERE id=$3 AND role='owner')) FOR SHARE`,[ids,pageId,userId])).rowCount!==new Set(ids).size)throw new HttpError(400,'تصویر گزارش معتبر نیست.');
}
async function completeWeekly(c:PoolClient,pageId:string,start:string,actor:string){await c.query('UPDATE work_items SET completed_at=COALESCE(completed_at,now()),completed_by=COALESCE(completed_by,$3) WHERE page_id=$1 AND period_start=$2 AND type=\'weekly\'',[pageId,start,actor]);}
