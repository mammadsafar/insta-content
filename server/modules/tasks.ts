import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {one,query,transaction} from '../core/db.js';
import {HttpError,requireUser,audit,notify} from '../core/security.js';
import {localDate} from '../core/time.js';

const date=z.iso.date();
const create=z.object({title:z.string().trim().min(1).max(500),assigneeId:z.uuid().optional(),priority:z.number().int().min(1).max(3).default(2),dueDate:date.optional(),recurrence:z.object({weekdays:z.array(z.number().int().min(0).max(6)).min(1).max(7)}).optional()});
export async function taskList(user:any,selected=localDate()) {
  return transaction(async c=>{
    await c.query(`INSERT INTO task_occurrences(template_id,date)
      SELECT id,CASE WHEN weekdays IS NULL THEN COALESCE(due_date,created_at AT TIME ZONE 'Asia/Tehran')::date ELSE $1::date END
      FROM task_templates WHERE active AND ($2='owner' OR assignee_id=$3)
      AND (created_at AT TIME ZONE 'Asia/Tehran')::date <= $1::date
      AND (weekdays IS NULL OR weekdays @> to_jsonb(ARRAY[extract(dow from $1::date)::int]))
      ON CONFLICT(template_id,date) DO NOTHING`,[selected,user.role,user.id]);
    const r=await c.query(`SELECT o.*,o.date::text,t.title,t.assignee_id,t.priority,t.weekdays,t.owner_assigned,t.creator_id,t.active,t.due_date::text,
      (o.completed_at IS NULL AND t.due_date < $1::date) AS overdue,u.name AS assignee_name
      FROM task_occurrences o JOIN task_templates t ON t.id=o.template_id JOIN users u ON u.id=t.assignee_id
      WHERE ($2='owner' OR t.assignee_id=$3) AND ((t.weekdays IS NOT NULL AND o.date=$1::date) OR (t.weekdays IS NULL AND (o.completed_at IS NULL OR o.date=$1::date)))
      ORDER BY o.completed_at NULLS FIRST,t.owner_assigned DESC,t.priority,t.created_at`,[selected,user.role,user.id]);
    return r.rows;
  });
}
export async function registerTasks(app:FastifyInstance):Promise<void> {
  app.get('/api/tasks',async req=>({data:await taskList(requireUser(req),z.object({date:date.optional()}).parse(req.query).date)}));
  app.post('/api/tasks',async req=>{
    const user=requireUser(req),b=create.parse(req.body),assignee=b.assigneeId??user.id;
    if(assignee!==user.id && user.role!=='owner')throw new HttpError(403,'تنها مالک می‌تواند کار واگذار کند.');
    if(!await one('SELECT id FROM users WHERE id=$1 AND active',[assignee]))throw new HttpError(400,'کاربر فعال پیدا نشد.');
    const assigned=user.role==='owner'&&assignee!==user.id;
    return {data:await transaction(async c=>{
      const r=await c.query(`INSERT INTO task_templates(title,creator_id,assignee_id,priority,weekdays,due_date,owner_assigned) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,[b.title,user.id,assignee,assigned&&b.recurrence?1:b.priority,b.recurrence?JSON.stringify([...new Set(b.recurrence.weekdays)]):null,b.dueDate??null,assigned]);
      await audit(c,user.id,'task.create','task',r.rows[0].id,{});
      if(assigned)await notify(c,assignee,'task_assignment','کار تازه‌ای به شما واگذار شد.',{taskId:r.rows[0].id,href:'/today'},user.id);
      return r.rows[0];
    })};
  });
  app.patch('/api/tasks/:id',async req=>{
    const user=requireUser(req),id=z.object({id:z.uuid()}).parse(req.params).id;
    const b=z.object({title:z.string().trim().min(1).max(500).optional(),active:z.boolean().optional(),dueDate:date.nullable().optional()}).parse(req.body);
    return {data:await transaction(async c=>{
      const t=(await c.query('SELECT * FROM task_templates WHERE id=$1 FOR UPDATE',[id])).rows[0];
      if(!t)throw new HttpError(404,'کار پیدا نشد.');
      if(user.role!=='owner'&&(t.owner_assigned||t.creator_id!==user.id))throw new HttpError(403,'اجازهٔ تغییر این کار را ندارید.');
      const r=await c.query('UPDATE task_templates SET title=$2,active=$3,due_date=$4 WHERE id=$1 RETURNING *',[id,b.title??t.title,b.active??t.active,b.dueDate===undefined?t.due_date:b.dueDate]);
      await audit(c,user.id,'task.update','task',id,b);return r.rows[0];
    })};
  });
  app.post('/api/tasks/:id/complete',async req=>{
    const user=requireUser(req),id=z.object({id:z.uuid()}).parse(req.params).id,b=z.object({date:date.optional()}).parse(req.body??{}),selected=b.date??localDate();
    await taskList(user,selected);
    return {data:await transaction(async c=>{
      const t=(await c.query('SELECT * FROM task_templates WHERE id=$1 FOR UPDATE',[id])).rows[0];
      if(!t)throw new HttpError(404,'کار پیدا نشد.');
      if(user.role!=='owner'&&t.assignee_id!==user.id)throw new HttpError(403,'اجازهٔ تکمیل این کار را ندارید.');
      const r=await c.query(`UPDATE task_occurrences SET completed_at=COALESCE(completed_at,now()),completed_by=COALESCE(completed_by,$3)
        WHERE template_id=$1 AND (date=$2::date OR $4::boolean) RETURNING *`,[id,selected,user.id,t.weekdays===null]);
      if(!r.rows.length)throw new HttpError(400,'این روز رخداد کاری ندارد.');
      await audit(c,user.id,'task.complete','task',id,{date:selected});return r.rows[0];
    })};
  });
}
