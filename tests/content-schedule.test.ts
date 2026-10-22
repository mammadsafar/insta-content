import test from 'node:test';
import assert from 'node:assert/strict';

test('sparse insert shifts through occupied assignments and extends only the tail', async () => {
  const { planSchedule } = await import('../server/modules/schedule-plan.ts');
  const before = [
    { contentId: 'a', date: '2026-10-23', position: 1, time: null },
    { contentId: 'b', date: '2026-10-25', position: 2, time: '18:00' },
    { contentId: 'c', date: '2026-10-29', position: 1, time: null },
  ];
  const result = planSchedule(before, {operation: 'insert', contentId: 'new', targetId: 'b'}, []);
  assert.deepEqual(result.map(x => [x.contentId,x.date,x.position]), [
    ['a','2026-10-23',1], ['new','2026-10-25',2], ['b','2026-10-29',1], ['c','2026-10-29',2],
  ]);
});

test('swap touches only two assignments and delete compacts occupied sparse assignments', async () => {
  const { planSchedule } = await import('../server/modules/schedule-plan.ts');
  const before = [
    { contentId:'a', date:'2026-10-23',position:1,time:null },
    { contentId:'b', date:'2026-10-25',position:2,time:null },
    { contentId:'c', date:'2026-10-29',position:1,time:null },
  ];
  assert.deepEqual(planSchedule(before,{operation:'swap',contentId:'a',targetId:'c'},[]).map(x=>x.contentId),['c','b','a']);
  assert.deepEqual(planSchedule(before,{operation:'delete',contentId:'b'},[]).map(x=>[x.contentId,x.date]),[['a','2026-10-23'],['c','2026-10-25']]);
});

test('tail extension obeys effective future rules and explicit custom dates remain intact', async () => {
  const { planSchedule } = await import('../server/modules/schedule-plan.ts');
  const rows = [{contentId:'a',date:'2026-10-23',position:2,time:null}];
  const result=planSchedule(rows,{operation:'insert',contentId:'new',targetId:'a'},[
    {effective_date:'2026-10-24',posts_per_day:1,times:['12:00']},
  ]);
  assert.deepEqual(result[1],{contentId:'a',date:'2026-10-24',position:1,time:'12:00'});
});
