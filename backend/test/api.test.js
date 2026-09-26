const assert = require('assert');
const { makeContext } = require('./gas-harness');
const ctx = makeContext();
function call(action, payload, token) {
  const r = JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify({ action, payload, token }) } }).getContent());
  return r;
}
function ok(action, payload, token) { const r = call(action, payload, token); if (!r.ok) throw new Error(action + ': ' + r.error); return r.data; }
function tb(journal) { let d = 0, c = 0; journal.forEach(j => { d += j.debit; c += j.credit; }); return [Math.round(d * 100) / 100, Math.round(c * 100) / 100]; }

// login + forced change
assert.equal(call('login', { username: 'admin', password: 'wrong' }).ok, false);
let s = ok('login', { username: 'admin', password: 'TempPass123' });
assert.equal(s.user.mustChange, 'Y');
assert.match(call('saveCustomer', { name: 'X' }, s.token).error, /change your temporary/);
ok('changePassword', { current: 'TempPass123', next: 'NewPass2026' }, s.token);
const T = s.token;

let b = ok('bootstrap', {}, T);
assert.equal(b.products.length, 7);
assert.equal(b.accounts.length, 13);
assert.equal(b.settings.invNext, '1057');

// customer (phone keeps leading zero)
const c = ok('saveCustomer', { name: 'Hallmark Café', phone: '0244123456', vatStatus: 'VAT' }, T).customer;
assert.equal(c.id, 'CUST-001');

// invoice with VAT + part paid
const inv = ok('recordInvoice', { customerId: c.id, date: '2026-09-10', vatApplied: 'Y', paidAtInvoice: 100, payMethod: 'MoMo',
  lines: [{ productCode: 'EGG-CRT', qty: 10 }, { productCode: 'PO-5L', qty: 2 }] }, T).invoice;
assert.equal(inv.invoiceNo, 'INV-2026-1057');
assert.equal(inv.subtotal, 900); assert.equal(inv.vat, 27); assert.equal(inv.total, 927);

// receipt over outstanding rejected, exact ok
assert.equal(call('recordReceipt', { invoiceNo: inv.invoiceNo, amount: 900 }, T).ok, false);
const r = ok('recordReceipt', { invoiceNo: inv.invoiceNo, amount: 827, method: 'Bank Transfer' }, T).receipt;
assert.equal(r.receiptNo, 'RCT-2026-2019');

ok('recordPurchase', { supplier: 'DANLECT', productCode: 'PO-25L', qty: 2, unitCost: 495, method: 'Credit' }, T);
ok('recordExpense', { category: 'Transport', description: 'Delivery', amount: 50, method: 'Cash' }, T);
assert.equal(call('postJournal', { description: 'bad', lines: [{ acct: '1000', debit: 10 }, { acct: '3000', credit: 9 }] }, T).ok, false);
ok('postJournal', { description: 'Owner capital', lines: [{ acct: '1000', debit: 1000 }, { acct: '3000', credit: 1000 }] }, T);

b = ok('bootstrap', {}, T);
let [d, cr] = tb(b.journal); assert.equal(d, cr, 'trial balance');
const ar = b.journal.filter(j => j.acct === '1100').reduce((a, j) => a + j.debit - j.credit, 0);
assert.equal(Math.round(ar * 100) / 100, 0, 'A/R cleared');

// second invoice then void
const inv2 = ok('recordInvoice', { customerId: c.id, lines: [{ productCode: 'GARI-2KG', qty: 3 }] }, T).invoice;
assert.equal(inv2.invoiceNo, 'INV-2026-1058');
ok('voidInvoice', { invoiceNo: inv2.invoiceNo, reason: 'test' }, T);
b = ok('bootstrap', {}, T); [d, cr] = tb(b.journal); assert.equal(d, cr);

// users & permissions
const u = ok('saveUser', { username: 'ama', name: 'Ama', role: 'staff', modules: ['sales', 'customers'], password: 'StaffPass1' }, T).user;
let s2 = ok('login', { username: 'ama', password: 'StaffPass1' });
ok('changePassword', { current: 'StaffPass1', next: 'StaffPass2' }, s2.token);
const b2 = ok('bootstrap', {}, s2.token);
assert.ok(b2.invoices && !b2.journal && !b2.users, 'module filtering');
assert.match(call('recordPurchase', { supplier: 'DANLECT', qty: 1, unitCost: 1 }, s2.token).error, /access/);
assert.match(call('listUsers', {}, s2.token).error, /access/);
ok('saveUser', { id: u.id, username: 'ama', role: 'viewer', modules: ['sales'], active: 'Y' }, T);
assert.match(call('recordReceipt', { invoiceNo: inv.invoiceNo, amount: 1 }, s2.token).error, /read-only/);
ok('saveUser', { id: u.id, username: 'ama', role: 'viewer', modules: ['sales'], active: 'N' }, T);
assert.equal(call('bootstrap', {}, s2.token).ok, false, 'disabled user kicked');

// demo load / clear keeps books balanced and real data intact
const demo = ok('loadDemo', {}, T);
assert.ok(demo.invoices > 20, 'demo invoices ' + demo.invoices);
b = ok('bootstrap', {}, T); [d, cr] = tb(b.journal); assert.equal(d, cr, 'balanced with demo');
ok('clearDemo', {}, T);
b = ok('bootstrap', {}, T);
assert.equal(b.invoices.length, 2); assert.equal(b.customers.length, 1);
[d, cr] = tb(b.journal); assert.equal(d, cr);
assert.equal(b.settings.invNext, '1059');
console.log('ALL API TESTS PASSED', { demo, journalLines: b.journal.length });
