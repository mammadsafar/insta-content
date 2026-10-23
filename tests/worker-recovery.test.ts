import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {one,query,pool} from '../server/core/db.js';
import {scheduleWork,processOneJob} from '../server/worker.js';
import {localDate} from '../server/core/time.js';

test('worker recovers missed recurring days and weekly periods, and reconciles a finalized report before reminding',async()=>{
  const member=await one("INSERT INTO users(name,email,password_hash) VALUES('Recovery member',$1,'test') RETURNING *",[`${randomUUID()}@test.invalid`]);
  const page=await one("INSERT INTO pages(name,reminder_user_id,created_at) VALUES('Recovery fixture',$1,now()-interval '30 days') RETURNING *",[member.id]);
  const template=await one("INSERT INTO task_templates(title,creator_id,assignee_id,weekdays,created_at) VALUES('Missed days',$1,$1,'[0,1,2,3,4,5,6]',now()-interval '4 days') RETURNING *",[member.id]);
  // Remove the daily cache marker to emulate the first recovery tick of this day.
  await query('DELETE FROM worker_heartbeats WHERE id=$1',[`tasks:${localDate()}`]);
  await scheduleWork();
  const before=await query('SELECT * FROM task_occurrences WHERE template_id=$1 ORDER BY date',[template.id]);
  assert.equal(before.length,5);assert.ok(before.every(r=>!r.completed_at));
  await scheduleWork();
  assert.equal((await query('SELECT * FROM task_occurrences WHERE template_id=$1',[template.id])).length,5);
  const weeks=await query("SELECT * FROM work_items WHERE page_id=$1 AND type='weekly' ORDER BY period_start",[page.id]);
  assert.ok(weeks.length>=4,'Missed Saturdays must all have independent work records');
  const work=weeks[0];
  await query("INSERT INTO weekly_reports(page_id,period_start,period_end,metrics,finalized,submitter_id,submitted_at) VALUES($1,$2,$2::date+7,'{\"followersAtEnd\":0}',true,$3,now())",[page.id,work.period_start,member.id]);
  // This pending work simulates an insertion that raced with report finalization.
  await query("INSERT INTO jobs(dedupe_key,type,payload,run_at) VALUES($1,'work_reminder',$2,'2000-01-01')",[`recovery:${randomUUID()}`,{workId:work.id}]);
  await processOneJob();
  const reconciled=await one('SELECT * FROM work_items WHERE id=$1',[work.id]);
  assert.ok(reconciled.completed_at);assert.equal(reconciled.completed_by,member.id);
  assert.equal(Number((await one('SELECT count(*) n FROM notifications WHERE user_id=$1',[member.id])).n),0);
});
test.after(async()=>pool.end());
