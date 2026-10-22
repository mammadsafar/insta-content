import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, unlink, chmod } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { basename, resolve, join } from 'node:path';
import { Transform, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileTypeFromFile } from 'file-type';
import sharp from 'sharp';
import { HttpError } from './security.js';

export type AssetPurpose = 'content' | 'feedback' | 'music' | 'insights' | 'avatar';
export type StoredFile = { storageKey: string; thumbnailKey?: string; mimeType: string; size: number; width?: number; height?: number };
const imageTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);
const videoTypes = new Set(['video/mp4', 'video/webm', 'video/quicktime']);
const audioTypes = new Set(['audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/wav', 'audio/x-wav', 'audio/webm', 'audio/aac', 'audio/flac', 'audio/x-flac']);
const keyPattern = /^[a-f0-9-]{36}\.(?:original|thumb\.webp|pending)$/;

export function storageRoot(): string { return resolve(process.env.MEDIA_DIR || './var/media'); }
export function fileMaxBytes(): number {
  const value = Number(process.env.FILE_MAX_BYTES || 524288000);
  if (!Number.isSafeInteger(value) || value < 1) throw new Error('FILE_MAX_BYTES must be a positive safe integer');
  return value;
}
export function storagePath(key: string, root = storageRoot()): string {
  if (!keyPattern.test(key)) throw new HttpError(400, 'شناسه فایل نامعتبر است');
  return join(resolve(root), key);
}
export function safeFilename(input: string): string {
  const name = basename(input.replaceAll('\\', '/')).replace(/[\x00-\x1f\x7f]/g, '').replace(/[<>:"|?*]/g, '_').trim().replace(/^\.+/, '').slice(0, 180);
  return name || 'file';
}
export function contentDisposition(name: string, download: boolean): string {
  const safe = safeFilename(name);
  const fallback = safe.replace(/[^\x20-\x7e]/g, '_').replaceAll('"', '_');
  return `${download ? 'attachment' : 'inline'}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(safe).replace(/['()*]/g, c => `%${c.charCodeAt(0).toString(16)}`)}`;
}
export function parseRange(value: string | undefined, size: number): { start: number; end: number } | undefined {
  if (!value) return;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2])) throw new HttpError(416, 'محدوده فایل نامعتبر است');
  const first = match[1] ? Number(match[1]) : undefined;
  const last = match[2] ? Number(match[2]) : undefined;
  if ((first !== undefined && !Number.isSafeInteger(first)) || (last !== undefined && !Number.isSafeInteger(last))) throw new HttpError(416, 'محدوده فایل نامعتبر است');
  const start = first ?? Math.max(0, size - (last || 0));
  const end = first === undefined ? size - 1 : Math.min(last ?? size - 1, size - 1);
  if (size <= 0 || start >= size || start > end || (first === undefined && last === 0)) throw new HttpError(416, 'محدوده فایل نامعتبر است');
  return { start, end };
}
function allowedPurpose(mime: string, purpose: AssetPurpose): boolean {
  if (purpose === 'avatar' || purpose === 'insights') return imageTypes.has(mime);
  if (purpose === 'feedback' || purpose === 'music') return audioTypes.has(mime);
  return imageTypes.has(mime) || videoTypes.has(mime);
}
function normalizedMime(mime: string): string {
  if (mime === 'audio/x-wav') return 'audio/wav';
  if (mime === 'audio/x-flac') return 'audio/flac';
  return mime.split(';')[0]!.trim().toLowerCase();
}
export async function removeStoredFiles(file: { storageKey: string; thumbnailKey?: string | null }, root = storageRoot()): Promise<void> {
  await Promise.all([file.storageKey, file.thumbnailKey].filter((key): key is string => !!key).map(async key => {
    try { await unlink(storagePath(key, root)); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }));
}

/** Stage completely, inspect magic bytes, and never transform publication originals. */
export async function storeUpload(stream: Readable, options: { root?: string; maxBytes?: number; purpose: AssetPurpose; claimedMime: string }): Promise<StoredFile> {
  const root = options.root || storageRoot();
  await mkdir(root, { recursive: true, mode: 0o700 });
  const id = randomUUID();
  const storageKey = `${id}.original`;
  const originalPath = storagePath(storageKey, root);
  const thumbnailKey = `${id}.thumb.webp`;
  let size = 0;
  try {
    await pipeline(stream, new Transform({ transform(chunk: Buffer, _encoding, callback) {
      size += chunk.length;
      if (size > (options.maxBytes ?? fileMaxBytes())) callback(new HttpError(413, 'اندازه فایل بیش از حد مجاز است'));
      else callback(null, chunk);
    } }), createWriteStream(originalPath, { flags: 'wx', mode: 0o600 }));
    if (!size) throw new HttpError(400, 'فایل خالی است');
    const type = await fileTypeFromFile(originalPath);
    let mime = normalizedMime(type?.mime || '');
    const claimed = normalizedMime(options.claimedMime);
    // WebM's container signature is shared by recorded audio and video. Only the audio
    // recording purposes accept an audio declaration; content retains video MIME.
    if (mime === 'video/webm' && claimed === 'audio/webm' && ['music', 'feedback'].includes(options.purpose)) mime = 'audio/webm';
    if (mime === 'video/ogg' && claimed === 'audio/ogg') mime = 'audio/ogg';
    if (!allowedPurpose(mime, options.purpose) || (claimed !== mime && claimed !== 'application/octet-stream')) throw new HttpError(415, 'نوع واقعی فایل با فرمت مجاز مطابقت ندارد');
    let dimensions: { width?: number; height?: number } = {};
    if (imageTypes.has(mime)) {
      const image = sharp(originalPath, { limitInputPixels: 80_000_000, animated: false, failOn: 'error' });
      const metadata = await image.metadata();
      if (!metadata.width || !metadata.height) throw new HttpError(415, 'تصویر معتبر نیست');
      dimensions = { width: metadata.width, height: metadata.height };
      await image.rotate().resize(640, 640, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toFile(storagePath(thumbnailKey, root));
      await chmod(storagePath(thumbnailKey, root), 0o400);
    }
    await chmod(originalPath, 0o400);
    return { storageKey, thumbnailKey: imageTypes.has(mime) ? thumbnailKey : undefined, mimeType: mime, size, ...dimensions };
  } catch (error) {
    await removeStoredFiles({ storageKey, thumbnailKey }, root);
    if (error instanceof HttpError) throw error;
    if ((error as NodeJS.ErrnoException).code === 'ENOSPC') throw new HttpError(507, 'فضای ذخیره‌سازی کافی نیست');
    throw error;
  }
}
export { createReadStream };
