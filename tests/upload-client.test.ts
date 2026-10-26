import test from 'node:test';
import assert from 'node:assert/strict';
import {uploadError,CHUNK_BYTES} from '../web/src/upload-client.js';
test('upload errors explain proxy caps and interrupted uploads without parsing HTML',()=>{
 assert.match(uploadError(413),/پراکسی/);
 for(const status of [408,504,524])assert.match(uploadError(status),/ادامه/);
 assert.equal(uploadError(403,'دسترسی ندارید'),'دسترسی ندارید');
 assert.ok(CHUNK_BYTES<100*1024*1024);
});
