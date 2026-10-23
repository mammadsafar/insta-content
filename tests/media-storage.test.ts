import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import sharp from 'sharp';
import { safeFilename, parseRange, storeUpload, storagePath, removeStoredFiles } from '../server/core/storage.js';

const png = await sharp({create:{width:1,height:1,channels:3,background:'white'}}).png().toBuffer();

test('filenames cannot inject headers, path traversal, or shell filenames', () => {
  assert.equal(safeFilename('../../evil\r\nname.png'), 'evilname.png');
  assert.equal(safeFilename('سلام عکس.png'), 'سلام عکس.png');
  assert.equal(safeFilename('..'), 'file');
});

test('Range handles bounded, open, and suffix ranges while rejecting invalid ranges', () => {
  assert.deepEqual(parseRange('bytes=2-4', 10), { start: 2, end: 4 });
  assert.deepEqual(parseRange('bytes=2-', 10), { start: 2, end: 9 });
  assert.deepEqual(parseRange('bytes=-4', 10), { start: 6, end: 9 });
  assert.deepEqual(parseRange('bytes=0-999', 10), { start: 0, end: 9 });
  for (const value of ['bytes=10-', 'bytes=3-2', 'bytes=0-1,3-5', 'bytes=-0', 'items=0-2', 'bytes=1.5-4']) {
    assert.throws(() => parseRange(value, 10));
  }
  assert.equal(parseRange(undefined, 10), undefined);
});

test('private image uploads preserve exact originals and create bounded thumbnails', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rooz-media-'));
  try {
    const stored = await storeUpload(Readable.from(png), { root, maxBytes: 1024, purpose: 'content', claimedMime: 'image/png' });
    assert.equal(stored.mimeType, 'image/png');
    assert.equal(stored.size, png.length);
    assert.equal(stored.width, 1);
    assert.deepEqual(await readFile(storagePath(stored.storageKey, root)), png);
    assert.ok(stored.thumbnailKey);
    assert.ok((await readFile(storagePath(stored.thumbnailKey!, root))).length > 0);
    await removeStoredFiles(stored, root);
    assert.deepEqual(await readdir(root), []);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('unsupported, spoofed, oversized and failed uploads leave no files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rooz-media-'));
  try {
    for (const [body, options] of [
      [Buffer.from('<script>alert(1)</script>'), {}],
      [png, { claimedMime: 'video/mp4' }],
      [png, { maxBytes: 8 }],
      [png, { purpose: 'music' }],
    ] as const) {
      await assert.rejects(storeUpload(Readable.from(body), { root, maxBytes: 1024, purpose: 'content', claimedMime: 'image/png', ...options }));
      assert.deepEqual(await readdir(root), []);
    }
    async function* broken() { yield png.subarray(0, 10); throw new Error('connection lost'); }
    await assert.rejects(storeUpload(Readable.from(broken()), { root, maxBytes: 1024, purpose: 'content', claimedMime: 'image/png' }));
    assert.deepEqual(await readdir(root), []);
    assert.throws(() => storagePath('../../etc/passwd', root));
  } finally { await rm(root, { recursive: true, force: true }); }
});
