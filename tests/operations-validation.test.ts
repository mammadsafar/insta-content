import test from 'node:test';
import assert from 'node:assert/strict';
import {fieldsFor,validateMetrics} from '../server/modules/analytics.js';
import {isPublicPushEndpoint} from '../server/modules/notifications.js';

test('analytics distinguish zero, missing, and unavailable with type-specific requirements',()=>{
  assert.doesNotThrow(()=>validateMetrics('image','first_hour',{firstHourViews:0,reach:0},[],true));
  assert.throws(()=>validateMetrics('image','first_hour',{firstHourViews:0},[],true));
  assert.doesNotThrow(()=>validateMetrics('image','first_hour',{firstHourViews:0},['reach'],true));
  assert.throws(()=>validateMetrics('image','first_hour',{firstHourViews:0,reach:0},['reach'],true));
  assert.throws(()=>validateMetrics('reel','next_day',{views:2,reach:2},[],true));
  assert.doesNotThrow(()=>validateMetrics('reel','next_day',{views:2,reach:2},['averageWatchTimeSeconds'],true));
  assert.throws(()=>validateMetrics('image','later',{storyExits:2},[],false));
  assert.throws(()=>validateMetrics('reel','later',{skipRatePercentage:101},[],false));
  assert.ok(fieldsFor('video_story').some(f=>f.key==='storyLinkTaps'));
});
test('push cannot target local or arbitrary network endpoints',()=>{
  assert.equal(isPublicPushEndpoint('https://fcm.googleapis.com/fcm/send/test'),true);
  for(const value of ['https://127.0.0.1/x','https://[::1]/x','https://169.254.169.254/x','http://fcm.googleapis.com/x','https://fcm.googleapis.com.evil.example/x','https://user:pass@fcm.googleapis.com/x','https://fcm.googleapis.com:444/x','https://example.com/x'])assert.equal(isPublicPushEndpoint(value),false,value);
});
