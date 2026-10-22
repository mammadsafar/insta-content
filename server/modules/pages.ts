import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query, transaction } from '../core/db.js';
import { audit, authorize, HttpError, requireOwner, requireUser } from '../core/security.js';

export async function registerPages(app:FastifyInstance):Promise<void>{
  app.get('/api/pages',async(req)=>{requireUser(req);return {data:await query('SELECT * FROM pages ORDER BY created_at')};});
  app.patch('/api/pages/:id',async(req)=>{
    const user=requireUser(req);requireOwner(user);
    const {id}=z.object({id:z.uuid()}).parse(req.params);
    const time=z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
    const body=z.object({name:z.string().trim().min(1).max(100).optional(),username:z.string().max(100).optional(),avatarId:z.uuid().nullable().optional(),reminderUserId:z.uuid().nullable().optional(),settings:z.object({nextDayReminderTime:time.optional(),weeklyReminderTime:time.optional()}).strict().optional()}).strict().parse(req.body);
    return {data:await transaction(async(tx)=>{
      const page=(await tx.query('SELECT * FROM pages WHERE id=$1 FOR UPDATE',[id])).rows[0];
      if(!page) throw new HttpError(404,'صفحه پیدا نشد.');
      if(body.reminderUserId && !(await tx.query('SELECT 1 FROM users WHERE id=$1 AND active',[body.reminderUserId])).rowCount) throw new HttpError(400,'مسئول باید عضو فعال باشد.');
      if(body.avatarId && !(await tx.query("SELECT 1 FROM assets WHERE id=$1 AND page_id=$2 AND purpose='avatar' AND completed",[body.avatarId,id])).rowCount) throw new HttpError(400,'تصویر صفحه معتبر نیست.');
      const updated=(await tx.query('UPDATE pages SET name=$2,username=$3,avatar_id=$4,reminder_user_id=$5,settings=$6 WHERE id=$1 RETURNING *',[id,body.name??page.name,body.username??page.username,body.avatarId===undefined?page.avatar_id:body.avatarId,body.reminderUserId===undefined?page.reminder_user_id:body.reminderUserId,JSON.stringify({...page.settings,...body.settings})])).rows[0];
      if(body.reminderUserId!==undefined) await tx.query('UPDATE work_items SET assignee_id=$2 WHERE page_id=$1 AND completed_at IS NULL',[id,body.reminderUserId]);
      await audit(tx,user.id,'update_page','page',id,body);return updated;
    })};
  });
  app.get('/api/pages/:id/topics',async(req)=>{requireUser(req);const {id}=z.object({id:z.uuid()}).parse(req.params);return {data:await query('SELECT * FROM topics WHERE page_id=$1 ORDER BY name',[id])};});
  app.post('/api/pages/:id/topics',async(req)=>{
    const user=requireUser(req);const {id}=z.object({id:z.uuid()}).parse(req.params);authorize(user,id,'edit');
    const {name}=z.object({name:z.string().trim().min(1).max(100)}).parse(req.body);
    return {data:await transaction(async(tx)=>{
      const row=(await tx.query('INSERT INTO topics(page_id,name) VALUES($1,$2) ON CONFLICT(page_id,name) DO UPDATE SET name=excluded.name RETURNING *',[id,name])).rows[0];
      await audit(tx,user.id,'create_topic','topic',row.id);return row;
    })};
  });
}
