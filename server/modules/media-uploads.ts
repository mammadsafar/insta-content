import type { FastifyInstance } from 'fastify';
import type { PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, open, unlink } from 'node:fs/promises';
import { z } from 'zod';
import { transaction } from '../core/db.js';
import { requireUser, audit, HttpError, type User } from '../core/security.js';
import { fileMaxBytes, storagePath, storageRoot, storeUpload, safeFilename, removeStoredFiles, type AssetPurpose, type StoredFile } from '../core/storage.js';

export const chunkBytes = 8 * 1024 * 1024;
type UploadInput = { pageId?: string; purpose: AssetPurpose };
type Dependencies = {
  uploadQuery: z.ZodType<UploadInput>;
  authorizeMediaUpload(user: User, input: UploadInput): Promise<void>;
  assetMetadata(asset: any): any;
};
function maxSize(purpose: AssetPurpose): number { return purpose === 'profile_avatar' ? Math.min(fileMaxBytes(), 5 * 1024 * 1024) : fileMaxBytes(); }
function progress(row: any) { return { id: row.id, received: Number(row.received), size: Number(row.size), chunkBytes }; }
function sessionId(params: unknown): string { return z.object({ id: z.string().uuid() }).parse(params).id; }
async function session(client: PoolClient, id: string, user: User) {
  const { rows: [row] } = await client.query('SELECT * FROM media_uploads WHERE id=$1 AND uploader_id=$2 FOR UPDATE', [id, user.id]);
  if (!row) throw new HttpError(404, 'آپلود پیدا نشد یا منقضی شده است');
  return row;
}
async function removePending(id: string) {
  try { await unlink(storagePath(`${id}.pending`)); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
}

/** Each request is small; database row locks serialize writers across app replicas. */
export async function registerMediaUploads(app: FastifyInstance, deps: Dependencies): Promise<void> {
  app.get('/api/media/config', async request => {
    requireUser(request);
    return { data: { maxBytes: fileMaxBytes(), chunkBytes, chunked: true } };
  });
  app.post('/api/media/uploads', async (request, reply) => {
    const user = requireUser(request);
    const input = z.object({ pageId: z.string().uuid().optional(), purpose: z.string(), name: z.string().min(1).max(512), mimeType: z.string().min(1).max(150), size: z.number().int().positive().safe() }).strict().parse(request.body);
    const scope = deps.uploadQuery.parse({ pageId: input.pageId, purpose: input.purpose });
    await deps.authorizeMediaUpload(user, scope);
    if (input.size > maxSize(scope.purpose)) throw new HttpError(413, 'اندازه فایل بیش از حد مجاز است');
    const id = randomUUID();
    await mkdir(storageRoot(), { recursive: true, mode: 0o700 });
    const handle = await open(storagePath(`${id}.pending`), 'wx', 0o600);
    await handle.close();
    try {
      const row = await transaction(async client => (await client.query(`INSERT INTO media_uploads(id,uploader_id,page_id,purpose,original_name,mime_type,size)
        VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [id, user.id, scope.pageId, scope.purpose, safeFilename(input.name), input.mimeType, input.size])).rows[0]);
      return reply.code(201).send({ data: progress(row) });
    } catch (error) { await removePending(id); throw error; }
  });
  app.get('/api/media/uploads/:id', async request => {
    const user = requireUser(request);
    return { data: await transaction(async client => progress(await session(client, sessionId(request.params), user))) };
  });
  // Encapsulate the binary parser: other API routes must retain their existing parsers.
  await app.register(async binary => {
    binary.addContentTypeParser('application/octet-stream', { parseAs: 'buffer', bodyLimit: chunkBytes }, (_request, body, done) => done(null, body));
    binary.put('/api/media/uploads/:id', { bodyLimit: chunkBytes }, async request => {
      const user = requireUser(request);
      const offset = z.object({ offset: z.coerce.number().int().nonnegative().safe() }).strict().parse(request.query).offset;
      const bytes = request.body as Buffer;
      if (!Buffer.isBuffer(bytes) || !bytes.length) throw new HttpError(400, 'بخش فایل خالی است');
      const row = await transaction(async client => {
        const row = await session(client, sessionId(request.params), user);
        await deps.authorizeMediaUpload(user, { purpose: row.purpose, pageId: row.page_id || undefined });
        if (row.asset_id) throw new HttpError(409, 'آپلود قبلاً تکمیل شده است');
        const received = Number(row.received), size = Number(row.size);
        if (size > maxSize(row.purpose)) throw new HttpError(413, 'اندازه فایل بیش از حد مجاز است');
        if (offset > received || offset + bytes.length > size) throw new HttpError(409, 'موقعیت بخش فایل با آپلود مطابقت ندارد');
        const file = await open(storagePath(`${row.id}.pending`), 'r+');
        try {
          if (offset < received) {
            if (offset + bytes.length > received) throw new HttpError(409, 'بخش فایل با آپلود مطابقت ندارد');
            const previous = Buffer.alloc(bytes.length);
            const read = await file.read(previous, 0, previous.length, offset);
            if (read.bytesRead !== bytes.length || !previous.equals(bytes)) throw new HttpError(409, 'محتوای بخش تکراری متفاوت است');
            return row;
          }
          // Recover a process crash after disk write but before transaction commit.
          const info = await file.stat();
          if (info.size < received) throw new HttpError(409, 'فایل موقت ناقص است؛ آپلود را دوباره شروع کنید');
          await file.truncate(received);
          let written = 0;
          while (written < bytes.length) written += (await file.write(bytes, written, bytes.length - written, received + written)).bytesWritten;
          await file.sync();
        } finally { await file.close(); }
        return (await client.query('UPDATE media_uploads SET received=$2,updated_at=now() WHERE id=$1 RETURNING *', [row.id, received + bytes.length])).rows[0];
      });
      return { data: progress(row) };
    });
  });
  app.post('/api/media/uploads/:id/complete', async (request, reply) => {
    const user = requireUser(request), id = sessionId(request.params);
    let stored: StoredFile | undefined;
    let committed = false;
    try {
      const asset = await transaction(async client => {
        const row = await session(client, id, user);
        await deps.authorizeMediaUpload(user, { purpose: row.purpose, pageId: row.page_id || undefined });
        if (row.asset_id) return (await client.query('SELECT * FROM assets WHERE id=$1', [row.asset_id])).rows[0];
        if (Number(row.received) !== Number(row.size)) throw new HttpError(409, 'همه بخش‌های فایل دریافت نشده‌اند');
        stored = await storeUpload(createReadStream(storagePath(`${id}.pending`)), { maxBytes: maxSize(row.purpose), purpose: row.purpose, claimedMime: row.mime_type });
        if (stored.size !== Number(row.size)) throw new HttpError(409, 'اندازه فایل با آپلود مطابقت ندارد');
        const { rows: [asset] } = await client.query(`INSERT INTO assets(page_id,uploader_id,purpose,original_name,storage_key,mime_type,size,thumbnail_key,width,height,completed)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true) RETURNING *`, [row.page_id, user.id, row.purpose, row.original_name, stored.storageKey, stored.mimeType, stored.size, stored.thumbnailKey || null, stored.width || null, stored.height || null]);
        await client.query('UPDATE media_uploads SET asset_id=$2,updated_at=now() WHERE id=$1', [id, asset.id]);
        await audit(client, user.id, 'media.upload', 'asset', asset.id, { purpose: row.purpose, size: stored.size, mimeType: stored.mimeType });
        return asset;
      });
      committed = true;
      await removePending(id);
      return reply.code(201).send({ data: deps.assetMetadata(asset) });
    } catch (error) { if (stored && !committed) await removeStoredFiles(stored); throw error; }
  });
  app.delete('/api/media/uploads/:id', async request => {
    const user = requireUser(request), id = sessionId(request.params);
    await transaction(async client => {
      await session(client, id, user);
      await removePending(id);
      await client.query('DELETE FROM media_uploads WHERE id=$1', [id]);
    });
    return { data: { deleted: true } };
  });
}

export async function cleanupMediaUploads(olderThanHours: number): Promise<void> {
  await transaction(async client => {
    const { rows } = await client.query("SELECT id FROM media_uploads WHERE updated_at < now()-($1 * interval '1 hour') FOR UPDATE SKIP LOCKED", [olderThanHours]);
    for (const row of rows) {
      await removePending(row.id);
      await client.query('DELETE FROM media_uploads WHERE id=$1', [row.id]);
    }
  });
}
