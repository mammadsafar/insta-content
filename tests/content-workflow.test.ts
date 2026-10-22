import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import {randomUUID} from 'node:crypto';
import {pool,query,one} from '../server/core/db.js';
import {registerContent} from '../server/modules/content.js';
import {registerScheduling} from '../server/modules/scheduling.js';
import {registerStories} from '../server/modules/stories.js';

test('real database content permissions, revision approval, claims, schedule conflicts and partial stories', async t=>{
  const owner=await one("INSERT INTO users(name,email,password_hash,role) VALUES ('Owner',$1,'test','member') RETURNING *",[`owner-${randomUUID()}@test.invalid`]);
  const editor=await one("INSERT INTO users(name,email,password_hash) VALUES ('Editor',$1,'test') RETURNING *",[`editor-${randomUUID()}@test.invalid`]);
  const suggester=await one("INSERT INTO users(name,email,password_hash) VALUES ('Suggest',$1,'test') RETURNING *",[`suggest-${randomUUID()}@test.invalid`]);
  const page=await one("INSERT INTO pages(name) VALUES ('Content test') RETURNING *");
  const app=Fastify();
  const users:any={owner:{...owner,role:'owner',permissions:[]},editor:{...editor,permissions:[{page_id:page.id,can_edit:true,can_suggest:true,can_report:false}]},suggest:{...suggester,permissions:[{page_id:page.id,can_edit:false,can_suggest:true,can_report:false}]}};
  app.addHook('preHandler',async req=>{(req as any).user=users[String(req.headers['x-test-user']??'owner')];});
  app.setErrorHandler((e:any,_req,reply)=>{reply.code(e.statusCode??500).send({error:e.message});});
  await registerContent(app); await registerScheduling(app); await registerStories(app);
  const call=async(method:any,url:string,payload?:any,user='owner')=>app.inject({method,url,payload,headers:{'x-test-user':user}});
  const create=async(type='image',extra:any={})=>{
    const asset=await one("INSERT INTO assets(page_id,uploader_id,purpose,original_name,storage_key,mime_type,size,completed) VALUES ($1,$2,'content','x.png',$3,'image/png',12,true) RETURNING *",[page.id,owner.id,randomUUID()]);
    const r=await call('POST',`/api/pages/${page.id}/content`,{type,assets:[asset.id],...extra},'editor');
    assert.equal(r.statusCode,200,r.body);return r.json().data;
  };
  try {
    const a=await create();
    assert.equal((await call('PATCH',`/api/content/${a.id}`,{expectedRevision:1,caption:'denied'},'suggest')).statusCode,403);
    assert.equal((await call('POST',`/api/content/${a.id}/submit`,{expectedRevision:1},'editor')).statusCode,200);
    assert.equal((await call('POST',`/api/content/${a.id}/approve`,{expectedRevision:1})).statusCode,200);
    assert.equal((await call('POST',`/api/content/${a.id}/feedback`,{text:'suggestion'},'suggest')).statusCode,200);
    assert.equal((await one('SELECT state FROM content WHERE id=$1',[a.id])).state,'approved');
    assert.equal((await call('PATCH',`/api/content/${a.id}`,{expectedRevision:1,caption:'new'},'editor')).statusCode,200);
    assert.equal((await call('POST',`/api/content/${a.id}/publish`,{expectedRevision:1})).statusCode,409);
    assert.equal((await call('POST',`/api/content/${a.id}/approve`,{expectedRevision:2})).statusCode,409);
    await call('POST',`/api/content/${a.id}/submit`,{expectedRevision:2},'editor');
    await call('POST',`/api/content/${a.id}/approve`,{expectedRevision:2});
    const claims=await Promise.all([call('POST',`/api/content/${a.id}/claim`,{expectedRevision:2},'editor'),call('POST',`/api/content/${a.id}/claim`,{expectedRevision:2},'suggest')]);
    assert.deepEqual(claims.map(r=>r.statusCode).sort(),[200,409]);
    const claimant=claims[0]!.statusCode===200?'editor':'suggest';
    const first=await call('POST',`/api/content/${a.id}/publish`,{expectedRevision:2},claimant);
    assert.equal(first.statusCode,200,first.body);
    const second=await call('POST',`/api/content/${a.id}/publish`,{expectedRevision:2},claimant);
    assert.equal(second.json().data.published_at,first.json().data.published_at);
    assert.equal(Number((await one('SELECT count(*) FROM jobs WHERE payload->>\'contentId\'=$1',[a.id])).count),2);
    assert.equal((await call('PATCH',`/api/content/${a.id}`,{expectedRevision:2,caption:'locked'},'editor')).statusCode,409);
    const b=await create(),c=await create();
    const preview=await call('POST',`/api/pages/${page.id}/schedule/preview`,{operation:'insert',contentId:b.id,slot:{date:'2027-01-01',position:1}},'editor');
    assert.equal(preview.statusCode,200,preview.body);
    const p=preview.json().data;
    const apply=await call('POST',`/api/pages/${page.id}/schedule/apply`,{operation:'insert',contentId:b.id,slot:{date:'2027-01-01',position:1},expectedVersion:p.version,previewHash:p.previewHash},'editor');
    assert.equal(apply.statusCode,200,apply.body);
    assert.equal((await call('POST',`/api/pages/${page.id}/schedule/apply`,{operation:'insert',contentId:c.id,slot:{date:'2027-01-01',position:1},expectedVersion:p.version,previewHash:p.previewHash},'editor')).statusCode,409);
    const pkgR=await call('POST',`/api/pages/${page.id}/packages`,{date:'2027-01-03',name:'Stories'},'editor');
    const pkg=pkgR.json().data;
    const s1=await create('image_story',{packageId:pkg.id,packagePosition:1});
    const s2=await create('image_story',{packageId:pkg.id,packagePosition:2});
    const pack=await one('SELECT version FROM story_packages WHERE id=$1',[pkg.id]);
    assert.equal((await call('POST',`/api/packages/${pkg.id}/approve`,{expectedVersion:pack.version})).statusCode,200);
    const published=await call('POST',`/api/packages/${pkg.id}/publish`,{items:[{id:s1.id,revision:1}]},'editor');
    assert.equal(published.statusCode,200,published.body);
    const s1Before=await one('SELECT published_at FROM content WHERE id=$1',[s1.id]);
    await call('PATCH',`/api/content/${s2.id}`,{expectedRevision:1,caption:'updated'},'editor');
    assert.equal((await call('POST',`/api/packages/${pkg.id}/publish`,{items:[{id:s2.id,revision:2}]},'editor')).statusCode,409);
    const updated=await one('SELECT version FROM story_packages WHERE id=$1',[pkg.id]);
    assert.equal((await call('POST',`/api/packages/${pkg.id}/approve`,{expectedVersion:updated.version})).statusCode,200);
    assert.equal((await call('POST',`/api/packages/${pkg.id}/publish`,{items:[{id:s2.id,revision:2}]},'editor')).statusCode,200);
    assert.deepEqual((await one('SELECT published_at FROM content WHERE id=$1',[s1.id])).published_at,s1Before.published_at);
    assert.equal((await query('SELECT revision FROM content_revisions WHERE content_id=$1 ORDER BY revision',[s2.id])).length,2);
  } finally {
    await app.close();
    // Isolated test fixtures intentionally retain audit/history until the test DB is recreated.
  }
});

test.after(async()=>{await pool.end();});
