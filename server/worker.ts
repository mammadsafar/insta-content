import {pathToFileURL} from 'node:url';
import webpush from 'web-push';
import {pool,query,transaction} from './core/db.js';
import {notify} from './core/security.js';
import {addDays,iranInstant,localDate,weeklyPeriod} from './core/time.js';
import {isPublicPushEndpoint} from './modules/notifications.js';

const vapidReady=()=>!!(process.env.VAPID_PUBLIC_KEY&&process.env.VAPID_PRIVATE_KEY&&process.env.VAPID_SUBJECT);
/** Scheduling runs on the server even with no browser. Uniqueness provides safe retries. */
export async function scheduleWork(now=new Date()):Promise<void>{
  const period=weeklyPeriod(now),today=localDate(now);
  await transaction(async c=>{
    await c.query(`UPDATE work_items w SET assignee_id=p.reminder_user_id FROM pages p WHERE p.id=w.page_id AND w.completed_at IS NULL AND w.assignee_id IS DISTINCT FROM p.reminder_user_id`);
    const pages=(await c.query('SELECT * FROM pages')).rows;
    for(const page of pages){
      const due=iranInstant(period.end,page.settings.weeklyReminderTime??'09:00');
      await c.query(`INSERT INTO work_items(dedupe_key,type,page_id,period_start,assignee_id,due_at,completed_at,completed_by)
        SELECT $1,'weekly',$2,$3,$4,$5,r.submitted_at,r.submitter_id FROM (SELECT 1) x LEFT JOIN weekly_reports r ON r.page_id=$2 AND r.period_start=$3 AND r.finalized
        ON CONFLICT(dedupe_key) DO NOTHING`,[`weekly:${page.id}:${period.start}`,page.id,period.start,page.reminder_user_id,due]);
    }
    await c.query(`INSERT INTO jobs(dedupe_key,type,payload,run_at)
      SELECT 'reminder:'||w.id||':'||$1,'work_reminder',jsonb_build_object('workId',w.id),GREATEST(w.due_at,$2::timestamptz)
      FROM work_items w WHERE w.completed_at IS NULL AND w.assignee_id IS NOT NULL AND w.due_at<=$2::timestamptz
      ON CONFLICT(dedupe_key) DO NOTHING`,[today,now]);
    await c.query(`INSERT INTO worker_heartbeats(id,updated_at) VALUES('main',now()) ON CONFLICT(id) DO UPDATE SET updated_at=now()`);
  });
}
async function workReminder(workId:string,dedupe:string):Promise<void>{
  await transaction(async c=>{
    const w=(await c.query(`SELECT w.*,p.reminder_user_id FROM work_items w JOIN pages p ON p.id=w.page_id WHERE w.id=$1 FOR UPDATE OF w`,[workId])).rows[0];
    if(!w||w.completed_at||!w.reminder_user_id)return;
    await c.query('UPDATE work_items SET assignee_id=$2 WHERE id=$1',[w.id,w.reminder_user_id]);
    if(!(await c.query('SELECT id FROM users WHERE id=$1 AND active',[w.reminder_user_id])).rowCount)return;
    await notify(c,w.reminder_user_id,w.type==='weekly'?'weekly_due':'analytics_due',w.type==='weekly'?'گزارش هفتگی آمادهٔ ثبت است.':'زمان ثبت آمار محتوا رسیده است.',{pageId:w.page_id,contentId:w.content_id,checkpoint:w.checkpoint,periodStart:w.period_start,href:w.content_id?`/content/${w.content_id}`:`/pages/${w.page_id}/weekly`},undefined,dedupe);
  });
}
async function analyticsJob(job:any):Promise<void>{
  const {contentId,checkpoint}=job.payload;
  if(!['first_hour','next_day'].includes(checkpoint)||!contentId)throw new Error('Invalid analytics job');
  const id=await transaction(async c=>{
    const content=(await c.query('SELECT c.*,p.reminder_user_id FROM content c JOIN pages p ON p.id=c.page_id WHERE c.id=$1',[contentId])).rows[0];
    if(!content||content.state!=='published')return;
    const r=await c.query(`INSERT INTO work_items(dedupe_key,type,page_id,content_id,checkpoint,assignee_id,due_at,completed_at,completed_by)
      SELECT $1,'analytics',$2,$3,$4,$5,$6,a.finalized_at,a.submitter_id FROM (SELECT 1) x LEFT JOIN LATERAL
      (SELECT finalized_at,submitter_id FROM analytics_snapshots WHERE content_id=$3 AND checkpoint=$4 AND finalized ORDER BY finalized_at LIMIT 1) a ON true
      ON CONFLICT(dedupe_key) DO UPDATE SET assignee_id=EXCLUDED.assignee_id RETURNING id`,[`analytics:${contentId}:${checkpoint}`,content.page_id,contentId,checkpoint,content.reminder_user_id,job.run_at]);
    return r.rows[0].id;
  });
  if(id)await workReminder(id,`reminder:${id}:${localDate()}`);
}
async function pushJob(job:any):Promise<void>{
  if(!vapidReady())return; // Durable in-app notification is already present.
  webpush.setVapidDetails(process.env.VAPID_SUBJECT!,process.env.VAPID_PUBLIC_KEY!,process.env.VAPID_PRIVATE_KEY!);
  const n=(await query(`SELECT n.* FROM notifications n JOIN users u ON u.id=n.user_id WHERE n.id=$1 AND u.active`,[job.payload.notificationId]))[0];
  if(!n)return;
  const subscriptions=await query('SELECT * FROM push_subscriptions WHERE user_id=$1',[n.user_id]);
  const transient:Error[]=[];
  for(const s of subscriptions){
    if(!isPublicPushEndpoint(s.endpoint)){await query('DELETE FROM push_subscriptions WHERE id=$1',[s.id]);continue;}
    try{
      await webpush.sendNotification(s.subscription,JSON.stringify({id:n.id,title:n.title,body:n.title,tag:n.dedupe_key??n.id,target:n.target,url:n.target.href??'/notifications'}),{TTL:86400,timeout:10000});
    }catch(error:any){
      if(error.statusCode===404||error.statusCode===410)await query('DELETE FROM push_subscriptions WHERE id=$1',[s.id]);
      else transient.push(new Error('Push delivery temporarily unavailable'));
    }
  }
  if(transient.length)throw transient[0];
}
/** Leases are reclaimed after a crash. Token is locked_at, preventing a stale worker completing another lease. */
export async function processOneJob(now=new Date()):Promise<boolean>{
  const job=await transaction(async c=>{
    await c.query(`UPDATE jobs SET status=CASE WHEN attempts>=8 THEN 'failed' ELSE 'pending' END,locked_at=NULL,last_error='زمان پردازش پایان یافت؛ دوباره تلاش می‌شود.' WHERE status='running' AND locked_at < $1::timestamptz-interval '5 minutes'`,[now]);
    const r=await c.query(`WITH next AS (SELECT id FROM jobs WHERE status='pending' AND run_at<=$1 ORDER BY run_at FOR UPDATE SKIP LOCKED LIMIT 1)
      UPDATE jobs j SET status='running',attempts=attempts+1,locked_at=$1 FROM next WHERE j.id=next.id RETURNING j.*`,[now]);return r.rows[0];
  });
  if(!job)return false;
  try{
    if(job.type==='analytics'||job.type==='analytics_reminder')await analyticsJob(job);
    else if(job.type==='work_reminder')await workReminder(job.payload.workId,job.dedupe_key);
    else if(job.type==='push')await pushJob(job);
    else throw new Error('Unsupported job');
    await query(`UPDATE jobs SET status='done',completed_at=now(),locked_at=NULL,last_error=NULL WHERE id=$1 AND locked_at=$2 AND status='running'`,[job.id,job.locked_at]);
  }catch{
    await query(`UPDATE jobs SET status=CASE WHEN attempts>=8 THEN 'failed' ELSE 'pending' END,run_at=$3,locked_at=NULL,last_error='پردازش انجام نشد؛ تلاش مجدد خودکار است.' WHERE id=$1 AND locked_at=$2 AND status='running'`,[job.id,job.locked_at,new Date(now.getTime()+Math.min(3600000,15000*2**job.attempts))]);
  }
  return true;
}
export async function runWorker():Promise<void>{
  let running=true;process.once('SIGTERM',()=>{running=false;});process.once('SIGINT',()=>{running=false;});
  while(running){
    try{await scheduleWork();for(let i=0;i<100&&running;i++)if(!await processOneJob())break;}
    catch{console.error('خطا در پردازش پس‌زمینه؛ تلاش مجدد انجام می‌شود.');}
    if(running)await new Promise<void>(resolve=>{setTimeout(resolve,1000);});
  }
  await pool.end();
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){runWorker().catch(()=>{process.exitCode=1;});}
