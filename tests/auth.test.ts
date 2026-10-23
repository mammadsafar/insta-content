import test from 'node:test';
import assert from 'node:assert/strict';
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
    const reset=await app.inject({method:'PATCH',url:`/api/users/${member.id}`,headers:{cookie},payload:{password:'Reset-test-password-2026!'}});assert.equal(reset.statusCode,200,reset.body);
    assert.equal((await app.inject({url:'/api/auth/me',headers:{cookie:mc}})).statusCode,401);
    const fresh=await login(email,'Reset-test-password-2026!');
    assert.equal((await app.inject({method:'POST',url:'/api/auth/logout',headers:{cookie:fresh},payload:{}})).statusCode,200);
    assert.equal((await app.inject({url:'/api/auth/me',headers:{cookie:fresh}})).statusCode,401);
  }finally{await app.close();}
});
test.after(async()=>{await pool.end();});
