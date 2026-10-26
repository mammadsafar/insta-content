import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { pool } from '../server/core/db.js';
import { registerMediaUploads, chunkBytes } from '../server/modules/media-uploads.js';
import { storagePath } from '../server/core/storage.js';

// The real PostgreSQL path is covered by media-routes.test.ts. This fixture also
// exercises binary parsing and on-disk assembly when Docker is unavailable.
test('bounded chunk requests reconstruct a 101 MiB original and safely handle retries', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rooz-chunks-'));
  const originalRoot = process.env.MEDIA_ROOT, originalConnect = pool.connect;
  process.env.MEDIA_ROOT = root;
  const sessions = new Map<string, any>(), assets = new Map<string, any>();
  (pool as any).connect = async () => ({ release() {}, async query(sql: string, values: any[] = []) {
    if (['BEGIN','COMMIT','ROLLBACK'].includes(sql)) return { rows: [] };
    if (sql.startsWith('INSERT INTO media_uploads')) {
      const [id,uploader_id,page_id,purpose,original_name,mime_type,size] = values;
      const row = {id,uploader_id,page_id,purpose,original_name,mime_type,size,received:0}; sessions.set(id,row); return {rows:[row]};
    }
    if (sql.startsWith('SELECT * FROM media_uploads')) { const row=sessions.get(values[0]); return {rows:row?.uploader_id===values[1]?[row]:[]}; }
    if (sql.startsWith('UPDATE media_uploads SET received')) { const row={...sessions.get(values[0]),received:values[1]}; sessions.set(row.id,row); return {rows:[row]}; }
    if (sql.startsWith('UPDATE media_uploads SET asset_id')) { const row={...sessions.get(values[0]),asset_id:values[1]}; sessions.set(row.id,row); return {rows:[row]}; }
    if (sql.startsWith('INSERT INTO assets')) {
      const [page_id,uploader_id,purpose,original_name,storage_key,mime_type,size] = values;
      const row={id:randomUUID(),page_id,uploader_id,purpose,original_name,storage_key,mime_type,size}; assets.set(row.id,row); return {rows:[row]};
    }
    if (sql.startsWith('SELECT * FROM assets')) return {rows:[assets.get(values[0])]};
    if (sql.startsWith('INSERT INTO audit_logs')) return {rows:[]};
    throw new Error(`Unexpected fixture query: ${sql}`);
  }});
  const app=Fastify();
  app.addHook('onRequest',async request=> { request.user=request.headers['x-user'] ? {id:String(request.headers['x-user']),name:'Tester',email:'',role:'member',active:true,theme:'system',permissions:[]} : null; });
  app.setErrorHandler((error:any,_request,reply)=>reply.code(error.statusCode||500).send({error:error.message}));
  await registerMediaUploads(app,{uploadQuery:z.object({purpose:z.literal('content'),pageId:z.string().uuid()}),authorizeMediaUpload:async()=>{},assetMetadata:asset=>({id:asset.id,size:asset.size,mime_type:asset.mime_type})});
  const user=randomUUID(),headers={'x-user':user},size=101*1024*1024;
  try {
    assert.equal((await app.inject({url:'/api/media/config'})).statusCode,401);
    const begin=await app.inject({method:'POST',url:'/api/media/uploads',headers,payload:{pageId:randomUUID(),purpose:'content',name:'large.mp4',mimeType:'video/mp4',size}});
    assert.equal(begin.statusCode,201,begin.body);
    const id=begin.json().data.id,path=`/api/media/uploads/${id}`;
    assert.equal((await app.inject({url:path,headers:{'x-user':randomUUID()}})).statusCode,404);
    assert.equal((await app.inject({method:'POST',url:`${path}/complete`,headers,payload:{}})).statusCode,409);
    const expected=createHash('sha256');
    for(let offset=0;offset<size;offset+=chunkBytes){
      const bytes=Buffer.alloc(Math.min(chunkBytes,size-offset),offset%251);
      if(!offset)Buffer.from('00000018667479706d703432000000006d70343269736f6d','hex').copy(bytes);
      expected.update(bytes);
      const put=()=>app.inject({method:'PUT',url:`${path}?offset=${offset}`,headers:{...headers,'content-type':'application/octet-stream'},payload:bytes});
      const response=await put(); assert.equal(response.statusCode,200,response.body);assert.equal(response.json().data.received,offset+bytes.length);
      if(!offset){assert.equal((await put()).json().data.received,bytes.length); const mismatch=await app.inject({method:'PUT',url:`${path}?offset=0`,headers:{...headers,'content-type':'application/octet-stream'},payload:Buffer.from('bad')});assert.equal(mismatch.statusCode,409);}
    }
    const oversized=await app.inject({method:'PUT',url:`${path}?offset=0`,headers:{...headers,'content-type':'application/octet-stream'},payload:Buffer.alloc(chunkBytes+1)});
    assert.equal(oversized.statusCode,413);
    const finish=()=>app.inject({method:'POST',url:`${path}/complete`,headers,payload:{}});
    const done=await finish(); assert.equal(done.statusCode,201,done.body);assert.equal(done.json().data.size,size);
    assert.equal((await finish()).json().data.id,done.json().data.id);
    assert.equal(assets.size,1);
    const actual=createHash('sha256');for await(const bytes of createReadStream(storagePath(assets.get(done.json().data.id).storage_key)))actual.update(bytes);
    assert.equal(actual.digest('hex'),expected.digest('hex'));
    await assert.rejects(readFile(storagePath(`${id}.pending`)),{code:'ENOENT'});
  }finally{ await app.close();pool.connect=originalConnect; if(originalRoot===undefined)delete process.env.MEDIA_ROOT;else process.env.MEDIA_ROOT=originalRoot;await rm(root,{recursive:true,force:true}); }
});
