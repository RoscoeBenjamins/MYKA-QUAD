// Concurrent writes on D1 must not duplicate document numbers or lose journal entries.
const assert = require('assert');
const core = require('../../server/core');
const { makeD1Store } = require('../../server/store-d1');
const { localD1 } = require('./d1-local');
(async () => {
  const { db, dispose } = await localD1();
  const store = makeD1Store(db);
  await core.handle({ action: 'ping' }, { store, env: {} }); // seeds an empty database
  const admin = (await db.prepare('SELECT id FROM "Users" WHERE username = ?').bind('admin').first()).id;
  await db.prepare('INSERT INTO "Sessions"(token, "userId", expires, mfa) VALUES (?, ?, ?, ?)').bind('T1', admin, '2099-01-01', 'Y').run();
  await db.prepare('UPDATE "Users" SET "mustChange" = ? WHERE id = ?').bind('N', admin).run();
  const N = 15;
  const res = await Promise.all(Array.from({ length: N }, (_, i) =>
    core.handle({ action: 'recordExpense', token: 'T1', payload: { amount: 10 + i, description: 'c' + i } }, { store, env: {} })));
  res.forEach((r) => assert.ok(r.ok, r.error));
  const nos = res.map((r) => r.data.expense.expenseNo);
  assert.equal(new Set(nos).size, N, 'unique numbers ' + nos.join(' '));
  const b = await core.handle({ action: 'bootstrap', token: 'T1' }, { store, env: {} });
  assert.equal(b.data.expenses.length, N);
  assert.equal(new Set(b.data.journal.map((j) => j.entryNo)).size, N, 'one journal entry each');
  assert.equal(b.data.settings.expNext, String(7001 + N));
  console.log('D1 CONCURRENCY TEST PASSED', nos[0], '…', nos[N - 1]);
  await dispose();
})().catch((e) => { console.error(e); process.exit(1); });
