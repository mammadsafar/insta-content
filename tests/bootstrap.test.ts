import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {migrate} from '../scripts/migrate.js';
import {bootstrapOwner} from '../scripts/bootstrap.js';

test('fresh migrations are repeatable and bootstrap safely creates exactly one owner and two empty pages',async()=>{
  assert.ok(process.env.DATABASE_URL);
  const original=process.env.DATABASE_URL!,schema=`fixture_${randomUUID().replaceAll('-','')}`;
  const control=new pg.Client({connectionString:original});await control.connect();
  await control.query(`CREATE SCHEMA "${schema}"`);
  const url=new URL(original);url.searchParams.set('options',`-c search_path=${schema}`);
  process.env.DATABASE_URL=url.href;
  let isolated:pg.Client|undefined;
  try{
    assert.deepEqual(await migrate(),['001_initial.sql','002_content.sql']);
    assert.deepEqual(await migrate(),[]);
    await assert.rejects(bootstrapOwner({name:'Invalid',email:'not-email',password:'Valid-long-password'}),/valid owner email/);
    await assert.rejects(bootstrapOwner({name:'Owner',email:'owner@test.invalid',password:'short'}),/12/);
    await bootstrapOwner({name:'Owner',email:'owner@test.invalid',password:'Bootstrap-test-password-2026!'});
    await assert.rejects(bootstrapOwner({name:'Another',email:'another@test.invalid',password:'Bootstrap-test-password-2026!'}),/already exists/);
    isolated=new pg.Client({connectionString:url.href});await isolated.connect();
    assert.equal((await isolated.query("SELECT count(*)::int n FROM users WHERE role='owner'")).rows[0].n,1);
    assert.equal((await isolated.query('SELECT count(*)::int n FROM pages')).rows[0].n,2);
    assert.equal((await isolated.query('SELECT count(*)::int n FROM content')).rows[0].n,0);
    assert.equal((await isolated.query('SELECT count(*)::int n FROM schedule_rules WHERE posts_per_day=2')).rows[0].n,2);
  }finally{
    process.env.DATABASE_URL=original;
    await isolated?.end();
    await control.query(`DROP SCHEMA "${schema}" CASCADE`);
    await control.end();
  }
});
