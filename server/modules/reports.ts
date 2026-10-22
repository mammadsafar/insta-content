import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {query,one} from '../core/db.js';
import {requireUser,can,HttpError} from '../core/security.js';
import {localDate,weeklyPeriod} from '../core/time.js';
import {taskList} from './tasks.js';

export async function reportPages(user:any,requested?:string):Promise<string[]>{
  const pages=await query('SELECT id FROM pages');
  const ids=pages.filter(p=>can(user,p.id,'report')).map(p=>p.id);
  if(requested&&!ids.includes(requested))throw new HttpError(403,'اجازهٔ مشاهدهٔ گزارش این صفحه را ندارید.');
  return requested?[requested]:ids;
}
export async function registerReports(app:FastifyInstance):Promise<void>{
  app.get('/api/today',async req=>{
    const user=requireUser(req),today=localDate(),period=weeklyPeriod(),ids=await reportPages(user);
    const [tasks,publications,approvals,workItems,pageTrends]=await Promise.all([
      taskList(user,today),
      query(`SELECT c.id,c.page_id,c.type,c.data,c.state,c.followup_user_id,c.published_at,s.date::text AS scheduled_date,s.position AS scheduled_order,s.time AS scheduled_time,
        s.date < $1::date AND c.state<>'published' AS overdue
        FROM content c LEFT JOIN schedule_slots s ON s.content_id=c.id WHERE c.trashed_at IS NULL AND
        ((s.date<=$1::date AND c.state<>'published') OR (c.published_at AT TIME ZONE 'Asia/Tehran')::date=$1::date)
        ORDER BY s.date,s.position`,[today]),
      user.role==='owner'?query(`SELECT id,page_id,type,data,revision,state,created_at FROM content WHERE state='awaiting_approval' AND trashed_at IS NULL ORDER BY updated_at`):Promise.resolve([]),
      query(`SELECT w.*,p.name AS page_name FROM work_items w JOIN pages p ON p.id=w.page_id
        WHERE w.completed_at IS NULL AND ($1='owner' OR w.assignee_id=$2) ORDER BY w.due_at`,[user.role,user.id]),
      query(`SELECT p.id AS page_id,p.name,r.id AS report_id,r.period_start::text,r.period_end::text,r.metrics,r.submitted_at FROM pages p LEFT JOIN LATERAL
        (SELECT * FROM weekly_reports WHERE page_id=p.id AND finalized ORDER BY period_start DESC LIMIT 1) r ON true WHERE p.id=ANY($1::uuid[])`,[ids])
    ]);
    // Work queues contain responsibility and missing-state only, never analytics values.
    const missingAnalytics=await query(`SELECT c.id AS content_id,c.page_id,c.type,c.data->>'title' AS title,c.published_at,
      NOT EXISTS(SELECT 1 FROM analytics_snapshots a WHERE a.content_id=c.id AND a.checkpoint='first_hour' AND a.finalized) AS missing_first_hour,
      NOT EXISTS(SELECT 1 FROM analytics_snapshots a WHERE a.content_id=c.id AND a.checkpoint='next_day' AND a.finalized) AS missing_next_day
      FROM content c JOIN pages p ON p.id=c.page_id WHERE c.state='published' AND ($1='owner' OR p.reminder_user_id=$2)
      AND (NOT EXISTS(SELECT 1 FROM analytics_snapshots a WHERE a.content_id=c.id AND a.checkpoint='first_hour' AND a.finalized) OR NOT EXISTS(SELECT 1 FROM analytics_snapshots a WHERE a.content_id=c.id AND a.checkpoint='next_day' AND a.finalized)) ORDER BY c.published_at`,[user.role,user.id]);
    const missingWeekly=await query(`SELECT p.id AS page_id,p.name,$3::text AS period_start,$4::text AS period_end FROM pages p WHERE ($1='owner' OR p.reminder_user_id=$2) AND NOT EXISTS(SELECT 1 FROM weekly_reports r WHERE r.page_id=p.id AND r.period_start=$3::date AND r.finalized)`,[user.role,user.id,period.start,period.end]);
    return {data:{date:today,tasks,publications,approvals,workItems,missingAnalytics,missingWeekly,pageTrends}};
  });
  app.get('/api/reports',async req=>{
    const user=requireUser(req),f=z.object({pageId:z.uuid().optional(),from:z.iso.date().optional(),to:z.iso.date().optional(),type:z.enum(['reel','image','image_carousel','video_carousel','mixed_carousel','image_story','video_story']).optional(),topic:z.string().max(200).optional(),state:z.enum(['draft','awaiting_approval','changes_required','approved','published']).optional()}).parse(req.query);
    if(f.from&&f.to&&f.from>f.to)throw new HttpError(400,'ترتیب تاریخ‌ها معتبر نیست.');
    const ids=await reportPages(user,f.pageId),params=[ids,f.from??null,f.to??null,f.type??null,f.topic??null,f.state??null];
    const filtered=`c.page_id=ANY($1::uuid[]) AND c.trashed_at IS NULL AND ($2::date IS NULL OR COALESCE((c.published_at AT TIME ZONE 'Asia/Tehran')::date,s.date)>= $2::date) AND ($3::date IS NULL OR COALESCE((c.published_at AT TIME ZONE 'Asia/Tehran')::date,s.date)<= $3::date) AND ($4::text IS NULL OR c.type=$4) AND ($5::text IS NULL OR c.data->>'topic'=$5) AND ($6::text IS NULL OR c.state=$6)`;
    const [content,weeklyTrends,plannedVsPublished,completeness,tasks]=await Promise.all([
      query(`SELECT c.id,c.page_id,c.type,c.data,c.state,c.publication_url,c.published_at,s.date::text AS scheduled_date,a.id AS snapshot_id,a.checkpoint,a.metrics,a.unavailable,a.observed_at,a.finalized,
        extract(epoch FROM(a.observed_at-c.published_at))/3600 AS snapshot_age_hours
        FROM content c LEFT JOIN schedule_slots s ON s.content_id=c.id LEFT JOIN analytics_snapshots a ON a.content_id=c.id AND a.finalized WHERE ${filtered} ORDER BY c.created_at,a.observed_at`,params),
      query(`SELECT r.*,r.period_start::text,r.period_end::text,previous.metrics AS previous_metrics,
        (SELECT count(*)::int FROM content c WHERE c.page_id=r.page_id AND c.state='published' AND (c.published_at AT TIME ZONE 'Asia/Tehran')::date>=r.period_start AND (c.published_at AT TIME ZONE 'Asia/Tehran')::date<r.period_end) AS internal_publication_count
        FROM weekly_reports r LEFT JOIN weekly_reports previous ON previous.page_id=r.page_id AND previous.period_start=r.period_start-7 AND previous.finalized
        WHERE r.page_id=ANY($1::uuid[]) AND r.finalized AND ($2::date IS NULL OR r.period_end>$2::date) AND ($3::date IS NULL OR r.period_start<=$3::date) ORDER BY r.period_start`,params.slice(0,3)),
      query(`SELECT c.page_id,count(*) FILTER(WHERE s.content_id IS NOT NULL)::int AS planned,count(*) FILTER(WHERE c.state='published')::int AS published FROM content c LEFT JOIN schedule_slots s ON s.content_id=c.id WHERE ${filtered} GROUP BY c.page_id`,params),
      query(`SELECT c.page_id,count(*)::int AS published,
        count(*) FILTER(WHERE EXISTS(SELECT 1 FROM analytics_snapshots a WHERE a.content_id=c.id AND a.checkpoint='first_hour' AND a.finalized))::int AS first_hour_completed,
        count(*) FILTER(WHERE EXISTS(SELECT 1 FROM analytics_snapshots a WHERE a.content_id=c.id AND a.checkpoint='next_day' AND a.finalized))::int AS next_day_completed
        FROM content c LEFT JOIN schedule_slots s ON s.content_id=c.id WHERE ${filtered} AND c.state='published' GROUP BY c.page_id`,params),
      ids.length?query(`SELECT t.assignee_id,count(*)::int AS occurrences,count(*) FILTER(WHERE o.completed_at IS NOT NULL)::int AS completed,count(*) FILTER(WHERE o.completed_at IS NULL AND COALESCE(t.due_date,o.date)<$4::date)::int AS overdue FROM task_occurrences o JOIN task_templates t ON t.id=o.template_id WHERE ($1='owner' OR t.assignee_id=$2) AND ($3::date IS NULL OR o.date>=$3::date) AND ($5::date IS NULL OR o.date<=$5::date) GROUP BY t.assignee_id`,[user.role,user.id,f.from??null,localDate(),f.to??null]):Promise.resolve([])
    ]);
    return {data:{content,weeklyTrends,plannedVsPublished,completeness,tasks}};
  });
}
