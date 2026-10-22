import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import { randomUUID } from 'node:crypto';
import { pool, query } from '../server/core/db.js';
import { registerMedia, cleanupOrphans } from '../server/modules/media.js';
import { storagePath } from '../server/core/storage.js';
import type { User } from '../server/core/security.js';

const enabled = !!process.env.DATABASE_URL;
let app: ReturnType<typeof Fastify>, root: string;
const ids = { owner: randomUUID(), editor: randomUUID(), viewer: randomUUID(), page: randomUUID(), content: randomUUID() };
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j1ioAAAAASUVORK5CYII=', 'base64');
function body(bytes = png, filename = 'عکس.png', mime = 'image/png') {
  return Buffer.concat([Buffer.from(`--test-boundary\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`), bytes, Buffer.from('\r\n--test-boundary--\r\n')]);
}
function headers(user = 'editor') { return { 'x-test-user': user, 'content-type': 'multipart/form-data; boundary=test-boundary' }; }
before(async () => {
  if (!enabled) return;
  root = await mkdtemp(join(tmpdir(), 'rooz-media-routes-'));
  process.env.MEDIA_DIR = root;
  await query("INSERT INTO users(id,name,email,password_hash,role) VALUES ($1,'media owner',$2,'test','owner') ON CONFLICT(role) WHERE role='owner' DO NOTHING", [ids.owner, `${ids.owner}@test.invalid`]);
  const owners = await query("SELECT id FROM users WHERE role='owner'"); ids.owner = owners[0].id;
  for (const name of ['editor', 'viewer'] as const) await query("INSERT INTO users(id,name,email,password_hash) VALUES ($1,$2,$3,'test')", [ids[name], name, `${ids[name]}@test.invalid`]);
  await query("INSERT INTO pages(id,name) VALUES ($1,'media tests')", [ids.page]);
  app = Fastify();
  await app.register(multipart);
  app.addHook('onRequest', async req => {
    const name = req.headers['x-test-user'] as 'owner' | 'editor' | 'viewer';
    req.user = name && ids[name] ? { id: ids[name], name, email: '', role: name === 'owner' ? 'owner' : 'member', active: true, theme: 'system', permissions: [{ page_id: ids.page, can_edit: name === 'editor', can_suggest: name === 'editor', can_report: false }] } satisfies User : null;
  });
  app.setErrorHandler((err: any, _req, reply) => reply.code(err.statusCode || 500).send({ error: err.message }));
  await registerMedia(app);
});
after(async () => {
  if (!enabled) return;
  await app?.close();
  await query('DELETE FROM content_revisions WHERE content_id=$1', [ids.content]);
  await query('DELETE FROM content WHERE id=$1', [ids.content]);
  await query('DELETE FROM assets WHERE page_id=$1', [ids.page]);
  await query('DELETE FROM audit_logs WHERE actor_id=ANY($1::uuid[])', [[ids.editor, ids.viewer]]);
  await query('DELETE FROM pages WHERE id=$1', [ids.page]);
  await query('DELETE FROM users WHERE id=ANY($1::uuid[])', [[ids.editor, ids.viewer]]);
  await rm(root, { recursive: true, force: true });
  await pool.end();
});
test('uploads enforce permissions, valid signatures and exact original bytes', { skip: !enabled }, async () => {
  const path = `/api/media?purpose=content&pageId=${ids.page}`;
  assert.equal((await app.inject({ method: 'POST', url: path, headers: headers('viewer'), payload: body() })).statusCode, 403);
  assert.equal((await app.inject({ method: 'POST', url: path, headers: headers(), payload: body(Buffer.from('fake'), 'fake.png') })).statusCode, 415);
  const res = await app.inject({ method: 'POST', url: path, headers: headers(), payload: body() });
  assert.equal(res.statusCode, 201, res.body);
  const asset = res.json().data;
  assert.equal(asset.storage_key, undefined);
  const saved = (await query('SELECT * FROM assets WHERE id=$1', [asset.id]))[0];
  assert.deepEqual(await readFile(storagePath(saved.storage_key, root)), png);
  // A different member cannot discover unattached draft upload URLs.
  assert.equal((await app.inject({ url: `/api/media/${asset.id}`, headers: headers('viewer') })).statusCode, 403);
  await query("INSERT INTO content(id,page_id,type,data,creator_id,followup_user_id) VALUES($1,$2,'image',$3,$4,$4)", [ids.content, ids.page, JSON.stringify({ assets: [asset.id] }), ids.editor]);
  const preview = await app.inject({ url: `/api/media/${asset.id}`, headers: { ...headers('viewer'), range: 'bytes=2-7' } });
  assert.equal(preview.statusCode, 206);
  assert.deepEqual(preview.rawPayload, png.subarray(2, 8));
  assert.equal(preview.headers['content-range'], `bytes 2-7/${png.length}`);
  const invalid = await app.inject({ url: `/api/media/${asset.id}`, headers: { ...headers('viewer'), range: 'bytes=999-' } });
  assert.equal(invalid.statusCode, 416);
  assert.equal((await app.inject({ url: `/api/media/${asset.id}/download`, headers: headers('viewer') })).statusCode, 403);
  assert.equal((await app.inject({ url: `/api/content/${ids.content}/download.zip`, headers: headers('viewer') })).statusCode, 409);
  await query("UPDATE content SET state='approved',approved_revision=revision WHERE id=$1", [ids.content]);
  const download = await app.inject({ url: `/api/media/${asset.id}/download`, headers: headers('viewer') });
  assert.equal(download.statusCode, 200);
  assert.deepEqual(download.rawPayload, png);
  assert.match(String(download.headers['content-disposition']), /^attachment;/);
  const zip = await app.inject({ url: `/api/content/${ids.content}/download.zip`, headers: headers('viewer') });
  assert.equal(zip.statusCode, 200);
  assert.equal(zip.rawPayload.subarray(0, 4).toString('hex'), '504b0304');
  assert.ok(zip.rawPayload.includes(Buffer.from('01-')));
});
test('orphan cleanup removes only old unreferenced rows and private files', { skip: !enabled }, async () => {
  const upload = await app.inject({ method: 'POST', url: `/api/media?purpose=content&pageId=${ids.page}`, headers: headers(), payload: body() });
  assert.equal(upload.statusCode, 201, upload.body);
  const id = upload.json().data.id;
  await query("UPDATE assets SET created_at=now()-interval '2 days' WHERE page_id=$1", [ids.page]);
  assert.equal(await cleanupOrphans(24), 1);
  assert.equal((await query('SELECT id FROM assets WHERE id=$1', [id])).length, 0);
  assert.equal((await readdir(root)).length, 2); // retained approved original + thumbnail
});
