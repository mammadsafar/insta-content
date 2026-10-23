import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { open, stat, readdir, unlink } from 'node:fs/promises';
import { PassThrough } from 'node:stream';
import archiver from 'archiver';
import { z } from 'zod';
import { query, one, transaction } from '../core/db.js';
import { requireUser, requireOwner, authorize, can, audit, HttpError, type User } from '../core/security.js';
import { contentDisposition, fileMaxBytes, parseRange, safeFilename, storagePath, storageRoot, storeUpload, removeStoredFiles, type StoredFile } from '../core/storage.js';

const uuid = z.string().uuid();
const uploadQuery = z.object({ pageId: uuid, purpose: z.enum(['content', 'feedback', 'music', 'insights', 'avatar']).default('content') }).strict();
function assetId(request: FastifyRequest): string { return z.object({ id: uuid }).parse(request.params).id; }
/** Never expose storage paths/keys, which remain an internal implementation detail. */
export function assetMetadata(asset: any) {
  return { id: asset.id, page_id: asset.page_id, uploader_id: asset.uploader_id, purpose: asset.purpose,
    original_name: asset.original_name, mime_type: asset.mime_type, size: Number(asset.size),
    width: asset.width, height: asset.height, completed: asset.completed, created_at: asset.created_at,
    thumbnail_available: !!asset.thumbnail_key, url: `/api/media/${asset.id}`,
    thumbnail_url: asset.thumbnail_key ? `/api/media/${asset.id}?thumbnail=1` : null };
}
function dataReferences(alias: string): string {
  return `(COALESCE(${alias}.data->'assets','[]'::jsonb) ? a.id::text OR ${alias}.data->>'coverId'=a.id::text OR ${alias}.data#>>'{music,audioId}'=a.id::text)`;
}
function referencedSql(): string {
  return `(EXISTS(SELECT 1 FROM content c WHERE ${dataReferences('c')})
    OR EXISTS(SELECT 1 FROM content_revisions r WHERE ${dataReferences('r')})
    OR EXISTS(SELECT 1 FROM feedback f WHERE f.audio_id=a.id OR f.asset_id=a.id)
    OR EXISTS(SELECT 1 FROM pages p WHERE p.avatar_id=a.id)
    OR EXISTS(SELECT 1 FROM weekly_reports w WHERE w.screenshots ? a.id::text))`;
}
async function accessibleAsset(id: string, user: User, download: boolean): Promise<any> {
  const asset = await one('SELECT * FROM assets WHERE id=$1 AND completed', [id]);
  if (!asset) throw new HttpError(404, 'فایل پیدا نشد');
  const content = await query(`SELECT c.id,c.page_id,c.state,c.revision,c.approved_revision
    FROM content c, assets a WHERE a.id=$1 AND c.trashed_at IS NULL AND ${dataReferences('c')}`, [id]);
  const approved = content.some(c => ['approved', 'published'].includes(c.state) && c.approved_revision === c.revision);
  const isUploader = asset.uploader_id === user.id;
  if (user.role === 'owner') return asset;
  if (asset.purpose === 'insights') {
    // Entry access does not grant report/screenshot visibility to other members.
    if (!isUploader && !can(user, asset.page_id, 'report')) throw new HttpError(403, 'دسترسی به این فایل مجاز نیست');
  } else if (asset.purpose === 'avatar') {
    if (!await one('SELECT id FROM pages WHERE avatar_id=$1', [id])) throw new HttpError(403, 'دسترسی به این فایل مجاز نیست');
  } else if (asset.purpose === 'feedback') {
    const attached = await one('SELECT f.id FROM feedback f JOIN content c ON c.id=f.content_id WHERE f.audio_id=$1 AND c.trashed_at IS NULL', [id]);
    if (!attached && !isUploader) throw new HttpError(403, 'دسترسی به این فایل مجاز نیست');
  } else {
    const historical = content.length ? true : !!await one(`SELECT r.content_id FROM content_revisions r JOIN content c ON c.id=r.content_id, assets a WHERE a.id=$1 AND c.trashed_at IS NULL AND ${dataReferences('r')} LIMIT 1`, [id]);
    if (!historical && !isUploader) throw new HttpError(403, 'دسترسی به این فایل مجاز نیست');
    if (download && !approved && !can(user, asset.page_id, 'edit')) throw new HttpError(403, 'دانلود فایل منتشرنشده فقط برای ویرایشگر مجاز است');
  }
  return asset;
}
async function streamAsset(request: FastifyRequest, reply: FastifyReply, download: boolean) {
  const user = requireUser(request);
  const asset = await accessibleAsset(assetId(request), user, download);
  let thumbnail = z.object({ thumbnail: z.enum(['1']).optional() }).parse(request.query).thumbnail === '1';
  // Hosts whose CPU cannot run sharp store no thumbnails; images then fall back to the original file.
  if (thumbnail && !asset.thumbnail_key && String(asset.mime_type).startsWith('image/')) thumbnail = false;
  if (thumbnail && !asset.thumbnail_key) throw new HttpError(404, 'این فایل تصویر بندانگشتی ندارد؛ از کاور انتخابی استفاده کنید');
  const key = thumbnail ? asset.thumbnail_key : asset.storage_key;
  let handle;
  try { handle = await open(storagePath(key), 'r'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new HttpError(404, 'فایل در دسترس نیست'); throw error; }
  try {
    const info = await handle.stat();
    reply.header('Accept-Ranges', 'bytes').header('Cache-Control', 'private, no-store').header('X-Content-Type-Options', 'nosniff');
    let range;
    try { range = parseRange(request.headers.range, info.size); }
    catch (error) { reply.header('Content-Range', `bytes */${info.size}`); throw error; }
    const filename = thumbnail ? `${safeFilename(asset.original_name)}.webp` : asset.original_name;
    reply.type(thumbnail ? 'image/webp' : asset.mime_type).header('Content-Disposition', contentDisposition(filename, download));
    if (range) reply.code(206).header('Content-Range', `bytes ${range.start}-${range.end}/${info.size}`);
    reply.header('Content-Length', range ? range.end - range.start + 1 : info.size);
    return reply.send(handle.createReadStream(range || {}));
  } catch (error) { await handle.close(); throw error; }
}

export async function registerMedia(app: FastifyInstance): Promise<void> {
  app.post('/api/media', async (request, reply) => {
    const user = requireUser(request);
    const input = uploadQuery.parse(request.query);
    if (!await one('SELECT id FROM pages WHERE id=$1', [input.pageId])) throw new HttpError(404, 'صفحه پیدا نشد');
    if (input.purpose === 'content' || input.purpose === 'music') authorize(user, input.pageId, 'edit');
    if (input.purpose === 'feedback') authorize(user, input.pageId, 'suggest');
    if (input.purpose === 'avatar') requireOwner(user);
    let stored: StoredFile | undefined;
    let originalName = '';
    try {
      const parts = request.parts({ limits: { fileSize: fileMaxBytes(), files: 1, fields: 0, parts: 1 } });
      for await (const part of parts) {
        if (part.type !== 'file' || part.fieldname !== 'file' || stored) throw new HttpError(400, 'یک فایل در فیلد file لازم است');
        originalName = safeFilename(part.filename);
        stored = await storeUpload(part.file, { purpose: input.purpose, claimedMime: part.mimetype });
        if (part.file.truncated) throw new HttpError(413, 'اندازه فایل بیش از حد مجاز است');
      }
      if (!stored) throw new HttpError(400, 'فایل انتخاب نشده است');
      const file = stored;
      const asset = await transaction(async client => {
        const result = await client.query(`INSERT INTO assets(page_id,uploader_id,purpose,original_name,storage_key,mime_type,size,thumbnail_key,width,height,completed)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true) RETURNING *`, [input.pageId, user.id, input.purpose, originalName, file.storageKey, file.mimeType, file.size, file.thumbnailKey || null, file.width || null, file.height || null]);
        await audit(client, user.id, 'media.upload', 'asset', result.rows[0].id, { purpose: input.purpose, size: file.size, mimeType: file.mimeType });
        return result.rows[0];
      });
      return reply.code(201).send({ data: assetMetadata(asset) });
    } catch (error) {
      if (stored) await removeStoredFiles(stored);
      if (['FST_REQ_FILE_TOO_LARGE', 'FST_FILES_LIMIT', 'FST_PARTS_LIMIT', 'FST_FIELDS_LIMIT'].includes((error as any).code)) throw new HttpError(413, 'تعداد یا اندازه فایل بیش از حد مجاز است');
      throw error;
    }
  });
  app.get('/api/media/:id', async (request, reply) => streamAsset(request, reply, false));
  app.get('/api/media/:id/download', async (request, reply) => streamAsset(request, reply, true));
  app.get('/api/content/:id/download.zip', async (request, reply) => {
    const user = requireUser(request);
    const id = assetId(request);
    const bundle = await transaction(async client => {
      const { rows: [content] } = await client.query('SELECT * FROM content WHERE id=$1 AND trashed_at IS NULL FOR SHARE', [id]);
      if (!content) throw new HttpError(404, 'محتوا پیدا نشد');
      if (!['approved', 'published'].includes(content.state) || content.approved_revision !== content.revision) throw new HttpError(409, 'فقط نسخه تأییدشده قابل دانلود است');
      const assets = z.array(uuid).min(1).parse(content.data.assets);
      const ids = [...assets, ...(content.data.coverId && !assets.includes(content.data.coverId) ? [uuid.parse(content.data.coverId)] : []), ...(content.data.music?.audioId && !assets.includes(content.data.music.audioId) && content.data.music.audioId !== content.data.coverId ? [uuid.parse(content.data.music.audioId)] : [])];
      const { rows } = await client.query('SELECT * FROM assets WHERE id=ANY($1::uuid[]) AND page_id=$2 AND completed AND purpose IN (\'content\',\'music\') FOR SHARE', [ids, content.page_id]);
      const ordered = ids.map((assetId, i) => {
        const file = rows.find(a => a.id === assetId);
        if (!file) throw new HttpError(409, 'فایل‌های محتوا کامل نیست');
        return { ...file, archiveName: `${String(i + 1).padStart(2, '0')}-${safeFilename(file.original_name)}` };
      });
      await audit(client, user.id, 'media.bundle_download', 'content', id, { revision: content.revision, assetIds: ids });
      return ordered;
    });
    for (const file of bundle) {
      try { await stat(storagePath(file.storage_key)); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new HttpError(409, 'یکی از فایل‌ها در دسترس نیست'); throw error; }
    }
    const archive = archiver('zip', { zlib: { level: 0 } });
    const output = new PassThrough();
    archive.on('error', error => { app.log.error({ code: (error as any).code }, 'ZIP stream failed'); output.destroy(error); });
    archive.on('warning', error => { app.log.error({ code: (error as any).code }, 'ZIP file unavailable'); output.destroy(error); archive.abort(); });
    reply.raw.on('close', () => { if (!reply.raw.writableFinished) { archive.abort(); output.destroy(); } });
    archive.pipe(output);
    for (const file of bundle) archive.file(storagePath(file.storage_key), { name: file.archiveName });
    void archive.finalize().catch(error => output.destroy(error));
    return reply.type('application/zip').header('Cache-Control', 'private, no-store').header('Content-Disposition', contentDisposition(`content-${id}.zip`, true)).send(output);
  });
}

/** Keep every referenced revision indefinitely; only unattached files older than the grace period expire. */
export async function cleanupOrphans(olderThanHours = 24): Promise<number> {
  if (!Number.isFinite(olderThanHours) || olderThanHours < 1) throw new Error('Orphan grace period must be at least one hour');
  const removed = await transaction(async client => {
    const { rows } = await client.query(`SELECT a.* FROM assets a WHERE a.created_at < now()-($1 * interval '1 hour') AND NOT ${referencedSql()} FOR UPDATE SKIP LOCKED`, [olderThanHours]);
    for (const asset of rows) {
      await removeStoredFiles({ storageKey: asset.storage_key, thumbnailKey: asset.thumbnail_key });
      await client.query('DELETE FROM assets WHERE id=$1', [asset.id]);
    }
    return rows.length;
  });
  // A process can die between disk persistence and the database INSERT. Reap those too.
  const known = new Set((await query('SELECT storage_key,thumbnail_key FROM assets')).flatMap(row => [row.storage_key, row.thumbnail_key]).filter(Boolean));
  let files: string[];
  try { files = await readdir(storageRoot()); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return removed; throw error; }
  for (const key of files) {
    if (known.has(key) || !/^[a-f0-9-]{36}\.(?:original|thumb\.webp|pending)$/.test(key)) continue;
    const path = storagePath(key);
    try { if ((await stat(path)).mtimeMs < Date.now() - olderThanHours * 3_600_000) await unlink(path); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  return removed;
}
