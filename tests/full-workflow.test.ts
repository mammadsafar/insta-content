import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import sharp from 'sharp';
import {createApp} from '../server/app.js';
import {hashPassword} from '../server/core/security.js';
import {one,query,pool} from '../server/core/db.js';
import {weeklyPeriod} from '../server/core/time.js';

test('authenticated end-to-end operations with real assets, approval changes, publication, snapshots and report isolation',{skip:!process.env.DATABASE_URL},async()=>{
  assert.match(process.env.DATABASE_URL!,/rooz_test(?:\?|$)/,'Integration fixtures require the isolated rooz_test database');
  const root=await mkdtemp(join(tmpdir(),'rooz-workflow-'));
  process.env.MEDIA_ROOT=root;
  const password='Integration-password-2026!';
  const existing=await one("SELECT * FROM users WHERE role='owner'");
  let owner:any;
  if(existing){
    assert.match(existing.email,/@test\.invalid$/,'Never modify a real owner in integration tests');
    owner=await one('UPDATE users SET password_hash=$2 WHERE id=$1 RETURNING *',[existing.id,await hashPassword(password)]);
  }else owner=await one("INSERT INTO users(name,email,password_hash,role) VALUES('Test owner',$1,$2,'owner') RETURNING *",[`workflow-owner-${randomUUID()}@test.invalid`,await hashPassword(password)]);
  const app=await createApp({logger:false,staticFiles:false});
  const request=async(cookie:string,method:any,url:string,payload?:any)=>{
    const result=await app.inject({method,url,payload,headers:{cookie}});
    assert.ok(result.statusCode<300,`${method} ${url}: ${result.statusCode} ${result.body}`);
    return result.json().data;
  };
  const login=async(email:string)=>{
    const response=await app.inject({method:'POST',url:'/api/auth/login',payload:{email,password}});
    assert.equal(response.statusCode,200,response.body);return String(response.headers['set-cookie']).split(';')[0];
  };
  try{
    const oc=await login(owner.email);
    const page=await one('INSERT INTO pages(name,reminder_user_id) VALUES($1,$2) RETURNING *',['Workflow isolated page',owner.id]);
    const member=await request(oc,'POST','/api/users',{name:'Workflow member',email:`workflow-member-${randomUUID()}@test.invalid`,password,permissions:[{pageId:page.id,canEdit:true,canSuggest:true,canReport:false}]});
    const mc=await login(member.email);
    const data=await sharp({create:{width:40,height:60,channels:3,background:'#bb716b'}}).png().toBuffer();
    const upload=async()=>{
      const payload=Buffer.concat([Buffer.from('--workflow\r\nContent-Disposition: form-data; name="file"; filename="final.png"\r\nContent-Type: image/png\r\n\r\n'),data,Buffer.from('\r\n--workflow--\r\n')]);
      const response=await app.inject({method:'POST',url:`/api/media?purpose=content&pageId=${page.id}`,headers:{cookie:mc,'content-type':'multipart/form-data; boundary=workflow'},payload});
      assert.equal(response.statusCode,201,response.body);return response.json().data;
    };
    const original=await upload();
    const content=await request(mc,'POST',`/api/pages/${page.id}/content`,{type:'image',title:'Workflow test',caption:'متن آزمایشی\nخط دوم',assets:[original.id]});
    await request(mc,'POST',`/api/content/${content.id}/submit`,{expectedRevision:1});
    await request(mc,'POST',`/api/content/${content.id}/feedback`,{text:'پیشنهاد اصلاح'});
    await request(oc,'POST',`/api/content/${content.id}/revoke`,{expectedRevision:1,reason:'لطفاً کاور و متن اصلاح شود.'});
    const replacement=await upload();
    const revised=await request(mc,'PATCH',`/api/content/${content.id}`,{expectedRevision:1,assets:[replacement.id],caption:'متن نهایی\nخط دوم'});
    assert.equal(revised.id,content.id);assert.equal(revised.revision,2);
    await request(mc,'POST',`/api/content/${content.id}/submit`,{expectedRevision:2});
    await request(oc,'POST',`/api/content/${content.id}/approve`,{expectedRevision:2});
    const preview=await request(mc,'GET',`/api/content/${content.id}`);
    assert.equal(preview.feedback[0].revision,1,'Old feedback must remain attached to original revision');
    await request(mc,'POST',`/api/content/${content.id}/claim`,{expectedRevision:2});
    const download=await app.inject({url:`/api/media/${replacement.id}/download`,headers:{cookie:mc}});
    assert.equal(download.statusCode,200,download.body);assert.deepEqual(download.rawPayload,data);
    const published=await request(mc,'POST',`/api/content/${content.id}/publish`,{expectedRevision:2,url:'https://www.instagram.com/p/manual-test/'});
    assert.equal(published.published_by,member.id);
    const again=await request(mc,'POST',`/api/content/${content.id}/publish`,{expectedRevision:2});
    assert.equal(again.published_at,published.published_at);
    const first=await request(mc,'POST',`/api/content/${content.id}/analytics`,{checkpoint:'first_hour',observedAt:new Date().toISOString(),metrics:{firstHourViews:0,reach:0},unavailable:[],finalized:true});
    assert.equal(first.metrics.firstHourViews,0);
    const work=await one("SELECT * FROM work_items WHERE content_id=$1 AND checkpoint='first_hour'",[content.id]);
    assert.equal(work.completed_by,member.id,'Any member submission completes assigned work');
    assert.equal(work.assignee_id,owner.id,'Reminder responsibility stays with page recipient');
    const next=await request(mc,'POST',`/api/content/${content.id}/analytics`,{checkpoint:'later',observedAt:new Date().toISOString(),metrics:{views:100,reach:50},unavailable:[],finalized:true});
    assert.notEqual(next.id,first.id);
    await request(mc,'PATCH',`/api/analytics/${first.id}`,{expectedVersion:1,metrics:{firstHourViews:1,reach:0}});
    assert.equal(Number((await one("SELECT count(*) FROM audit_logs WHERE action='analytics.correct' AND target_id=$1",[first.id])).count),1);
    const period=weeklyPeriod();
    const report=await request(mc,'POST',`/api/pages/${page.id}/weekly-reports`,{periodStart:period.start,metrics:{followersAtEnd:12,reach:0},notes:'Integration test only',screenshots:[],finalized:true});
    assert.equal(report.submitter_id,member.id);
    const aggregate=await request(oc,'GET',`/api/reports?pageId=${page.id}`);
    assert.equal(aggregate.weeklyTrends.length,1);
    assert.equal(aggregate.weeklyTrends[0].metrics.reach,0);
    const denied=await app.inject({url:`/api/reports?pageId=${page.id}`,headers:{cookie:mc}});
    assert.equal(denied.statusCode,403);
    const today=await request(mc,'GET','/api/today');assert.deepEqual(today.pageTrends,[]);
    const revisions=await query('SELECT * FROM content_revisions WHERE content_id=$1 ORDER BY revision',[content.id]);
    assert.equal(revisions.length,2);
  }finally{await app.close();await rm(root,{recursive:true,force:true});}
});
test.after(async()=>{await pool.end();});
