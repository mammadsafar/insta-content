import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import sharp from 'sharp';
import {cleanupOrphans} from '../server/modules/media.js';
import {randomUUID} from 'node:crypto';
import {createApp} from '../server/app.js';
import {pool,one,query} from '../server/core/db.js';
import {hashPassword} from '../server/core/security.js';

test('real sessions reject unauthenticated writes, enforce Origin and revoke disabled users', {skip:!process.env.DATABASE_URL}, async()=>{
  const app=await createApp({logger:false,staticFiles:false});
  const email=`auth-${randomUUID()}@test.invalid`;
  const password='Test-password-2026!';
  const member=await one('INSERT INTO users(name,email,password_hash) VALUES($1,$2,$3) RETURNING id',['Auth test',email,await hashPassword(password)]);
  try{
    assert.equal((await app.inject({url:'/api/pages'})).statusCode,401);
    const bad=await app.inject({method:'POST',url:'/api/auth/login',payload:{email,password:'wrong'}});
    assert.equal(bad.statusCode,401);
    const cross=await app.inject({method:'POST',url:'/api/auth/login',headers:{origin:'https://attacker.invalid'},payload:{email,password}});
    assert.equal(cross.statusCode,403);
    const logged=await app.inject({method:'POST',url:'/api/auth/login',payload:{email,password}});
    assert.equal(logged.statusCode,200,logged.body);
    assert.equal(logged.json().data.password_hash,undefined);
    const cookie=String(logged.headers['set-cookie']).split(';')[0];
    assert.match(String(logged.headers['set-cookie']),/HttpOnly/i);
    assert.match(String(logged.headers['set-cookie']),/SameSite=Strict/i);
    assert.equal((await app.inject({url:'/api/auth/me',headers:{cookie}})).statusCode,200);
    assert.equal((await app.inject({url:'/api/users',headers:{cookie}})).statusCode,403);
    const reports=await app.inject({url:'/api/reports',headers:{cookie}});
    assert.deepEqual(reports.json().data.content,[]);
    const today=await app.inject({url:'/api/today',headers:{cookie}});
    assert.deepEqual(today.json().data.pageTrends,[]);
    assert.equal((await app.inject({method:'PATCH',url:'/api/auth/me',headers:{cookie,origin:'https://attacker.invalid'},payload:{name:'stolen'}})).statusCode,403);
    await query('UPDATE users SET active=false WHERE id=$1',[member.id]);
    assert.equal((await app.inject({url:'/api/auth/me',headers:{cookie}})).statusCode,401);
  }finally{
    await app.close();
  }
});
test('owner administration persists granular permissions, themes and safe password resets',{skip:!process.env.DATABASE_URL},async()=>{
  const app=await createApp({logger:false,staticFiles:false});
  const password='Admin-test-password-2026!';
  const existing=await one("SELECT * FROM users WHERE role='owner'");
  const owner=existing?await one('UPDATE users SET password_hash=$2 WHERE id=$1 RETURNING *',[existing.id,await hashPassword(password)]):await one("INSERT INTO users(name,email,password_hash,role) VALUES('Admin',$1,$2,'owner') RETURNING *",[`admin-${randomUUID()}@test.invalid`,await hashPassword(password)]);
  const page=await one("INSERT INTO pages(name) VALUES('Admin test') RETURNING *");
  async function login(email:string,pw=password){const r=await app.inject({method:'POST',url:'/api/auth/login',payload:{email,password:pw}});assert.equal(r.statusCode,200,r.body);return String(r.headers['set-cookie']).split(';')[0];}
  try{
    const cookie=await login(owner.email);
    const email=`admin-member-${randomUUID()}@test.invalid`;
    const payload={name:'Member',email,password,permissions:[{pageId:page.id,canEdit:false,canSuggest:true,canReport:false}]};
    const result=await app.inject({method:'POST',url:'/api/users',headers:{cookie},payload});
    assert.equal(result.statusCode,201,result.body);const member=result.json().data;
    assert.equal((await app.inject({method:'POST',url:'/api/users',headers:{cookie},payload})).statusCode,409);
    const mc=await login(email);
    assert.equal((await app.inject({method:'PATCH',url:`/api/users/${owner.id}`,headers:{cookie},payload:{active:false}})).statusCode,400);
    assert.equal((await app.inject({method:'POST',url:`/api/pages/${page.id}/topics`,headers:{cookie:mc},payload:{name:'test'}})).statusCode,403);
    const permissions=[{pageId:page.id,canEdit:true,canSuggest:false,canReport:true}];
    assert.equal((await app.inject({method:'PATCH',url:`/api/users/${member.id}`,headers:{cookie},payload:{permissions}})).statusCode,200);
    const me=await app.inject({url:'/api/auth/me',headers:{cookie:mc}});assert.equal(me.json().data.permissions[0].can_edit,true);assert.equal(me.json().data.permissions[0].can_suggest,false);
    const topic=await app.inject({method:'POST',url:`/api/pages/${page.id}/topics`,headers:{cookie:mc},payload:{name:'  آموزش  '}});assert.equal(topic.statusCode,200,topic.body);
    const again=await app.inject({method:'POST',url:`/api/pages/${page.id}/topics`,headers:{cookie:mc},payload:{name:'آموزش'}});assert.equal(again.json().data.id,topic.json().data.id);
    const theme=await app.inject({method:'PATCH',url:'/api/auth/me',headers:{cookie:mc},payload:{theme:'dark'}});assert.equal(theme.json().data.theme,'dark');
    assert.equal((await app.inject({method:'PATCH',url:'/api/auth/me',headers:{cookie:mc},payload:{password:'A-new-test-password-2026',currentPassword:'bad'}})).statusCode,400);
    const settings=await app.inject({method:'PATCH',url:`/api/pages/${page.id}`,headers:{cookie},payload:{name:'پیکربندی',username:'test_page',reminderUserId:member.id,settings:{nextDayReminderTime:'10:20'}}});assert.equal(settings.statusCode,200,settings.body);assert.equal(settings.json().data.settings.weeklyReminderTime,'09:00');
    assert.equal((await app.inject({method:'PATCH',url:`/api/pages/${page.id}`,headers:{cookie:mc},payload:{name:'denied'}})).statusCode,403);
    assert.equal((await app.inject({method:'PATCH',url:`/api/pages/${page.id}`,headers:{cookie},payload:{settings:{weeklyReminderTime:'27:00'}}})).statusCode,422);
    assert.equal((await app.inject({method:'PATCH',url:`/api/users/${owner.id}`,headers:{cookie:mc},payload:{password:'Unauthorized-reset-2026!'}})).statusCode,403);
    const secondSession=await login(email);
    const reset=await app.inject({method:'PATCH',url:`/api/users/${member.id}`,headers:{cookie},payload:{password:'Reset-test-password-2026!'}});assert.equal(reset.statusCode,200,reset.body);
    assert.equal((await app.inject({url:'/api/auth/me',headers:{cookie:mc}})).statusCode,401);
    assert.equal((await app.inject({url:'/api/auth/me',headers:{cookie:secondSession}})).statusCode,401);
    assert.equal((await app.inject({method:'POST',url:'/api/auth/login',payload:{email,password}})).statusCode,401);
    const fresh=await login(email,'Reset-test-password-2026!');
    assert.equal((await app.inject({method:'POST',url:'/api/auth/logout',headers:{cookie:fresh},payload:{}})).statusCode,200);
    assert.equal((await app.inject({url:'/api/auth/me',headers:{cookie:fresh}})).statusCode,401);
  }finally{await app.close();}
});
test('members upload only their own profile photos, persist across login and keep referenced files',{skip:!process.env.DATABASE_URL},async()=>{
  const previousRoot=process.env.MEDIA_ROOT,root=await mkdtemp(join(tmpdir(),'rooz-profile-'));
  process.env.MEDIA_ROOT=root;
  const app=await createApp({logger:false,staticFiles:false});
  const password='Profile-test-password-2026!',email=`profile-${randomUUID()}@test.invalid`;
  const member=await one('INSERT INTO users(name,email,password_hash) VALUES($1,$2,$3) RETURNING id',['Profile member',email,await hashPassword(password)]);
  const other=await one('INSERT INTO users(name,email,password_hash) VALUES($1,$2,$3) RETURNING id',['Other member',`other-${email}`,await hashPassword(password)]);
  async function login(address:string){const r=await app.inject({method:'POST',url:'/api/auth/login',payload:{email:address,password}});assert.equal(r.statusCode,200,r.body);return String(r.headers['set-cookie']).split(';')[0];}
  try{
    const cookie=await login(email),otherCookie=await login(`other-${email}`);
    const png=await sharp({create:{width:2,height:2,channels:3,background:'white'}}).png().toBuffer();
    const payload=Buffer.concat([Buffer.from('--profile-boundary\r\nContent-Disposition: form-data; name="file"; filename="avatar.png"\r\nContent-Type: image/png\r\n\r\n'),png,Buffer.from('\r\n--profile-boundary--\r\n')]);
    const headers={cookie,'content-type':'multipart/form-data; boundary=profile-boundary'};
    const uploaded=await app.inject({method:'POST',url:'/api/media?purpose=profile_avatar',headers,payload});
    assert.equal(uploaded.statusCode,201,uploaded.body);
    const id=uploaded.json().data.id;
    assert.equal(uploaded.json().data.page_id,null);
    assert.equal((await app.inject({url:`/api/media/${id}`,headers:{cookie:otherCookie}})).statusCode,403);
    assert.equal((await app.inject({method:'PATCH',url:'/api/auth/me',headers:{cookie:otherCookie},payload:{avatarId:id}})).statusCode,400);
    const attached=await app.inject({method:'PATCH',url:'/api/auth/me',headers:{cookie},payload:{avatarId:id}});
    assert.equal(attached.statusCode,200,attached.body);assert.equal(attached.json().data.avatar_id,id);
    assert.equal((await app.inject({url:`/api/media/${id}`,headers:{cookie:otherCookie}})).statusCode,200);
    assert.equal((await app.inject({url:`/api/media/${id}`})).statusCode,401);
    assert.equal((await app.inject({method:'PATCH',url:`/api/users/${member.id}`,headers:{cookie:otherCookie},payload:{password:'Denied-password-2026!'}})).statusCode,403);
    assert.equal((await app.inject({url:'/api/auth/me',headers:{cookie:await login(email)}})).json().data.avatar_id,id);
    await query("UPDATE assets SET created_at=now()-interval '2 days' WHERE id=$1",[id]);
    await cleanupOrphans();assert.ok(await one('SELECT id FROM assets WHERE id=$1',[id]));
    assert.equal((await app.inject({method:'PATCH',url:'/api/auth/me',headers:{cookie},payload:{avatarId:null}})).json().data.avatar_id,null);
    assert.equal((await app.inject({url:`/api/media/${id}`,headers:{cookie:otherCookie}})).statusCode,403);
    await cleanupOrphans();assert.equal(await one('SELECT id FROM assets WHERE id=$1',[id]),undefined);
    assert.equal((await app.inject({method:'POST',url:'/api/media?purpose=content',headers,payload})).statusCode,422);
    const badPayload=Buffer.from('--profile-boundary\r\nContent-Disposition: form-data; name="file"; filename="avatar.png"\r\nContent-Type: image/png\r\n\r\nnot-an-image\r\n--profile-boundary--\r\n');
    assert.equal((await app.inject({method:'POST',url:'/api/media?purpose=profile_avatar',headers,payload:badPayload})).statusCode,415);
    assert.equal((await one('SELECT avatar_id FROM users WHERE id=$1',[other.id])).avatar_id,null);
  }finally{await app.close();if(previousRoot===undefined)delete process.env.MEDIA_ROOT;else process.env.MEDIA_ROOT=previousRoot;await rm(root,{recursive:true,force:true});}
});
test.after(async()=>{await pool.end();});
