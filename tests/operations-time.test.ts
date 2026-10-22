import test from 'node:test';
import assert from 'node:assert/strict';
import {localDate, weeklyPeriod, nextDayReminder} from '../server/core/time.js';

test('Tehran midnight and previous Saturday exclusive period', () => {
  assert.equal(localDate(new Date('2026-10-23T21:00:00Z')), '2026-10-24');
  assert.deepEqual(weeklyPeriod(new Date('2026-10-24T05:30:00Z')), {start:'2026-10-17',end:'2026-10-24'});
  assert.deepEqual(weeklyPeriod(new Date('2026-10-23T20:29:59Z')), {start:'2026-10-10',end:'2026-10-17'});
});
test('next day is Tehran calendar day rather than exact 24 hours', () => {
  assert.equal(nextDayReminder(new Date('2026-10-22T19:30:00Z')).toISOString(),'2026-10-23T05:30:00.000Z');
});
