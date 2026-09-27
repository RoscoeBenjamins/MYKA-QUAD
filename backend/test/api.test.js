// End-to-end tests for the Node/Vercel API (server/core.js) against the in-memory store.
const assert = require('assert');
const crypto = require('crypto');
const core = require('../../server/core');
const { makeMemStore } = require('../../server/store-mem');
// TEST_DATABASE_URL=postgres://... runs the same tests against a real Postgres (schema from db/schema.sql)
const store = process.env.TEST_DATABASE_URL ? require('../../server/store-pg').makePgStore(process.env.TEST_DATABASE_URL) : makeMemStore();
const env = { ADMIN_TEMP: 'TempPass123' };
const sent = [];
core.setMailerFetch(async (url, init) => { sent.push({ url, opt: { payload: init.body } }); return { status: 200, text: async () => '{"ok":true,"from":"mykaquadent@gmail.com"}' }; });
let __off = 0; const __now = Date.now; Date.now = () => __now() + __off;
const advance = (sec) => { __off += sec * 1000; };
const offset = () => __off;
// independent RFC 6238 implementation (not the one under test)
function b32(s) { const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let bits = ''; for (const c of s) bits += A.indexOf(c).toString(2).padStart(5, '0'); const out = []; for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2)); return Buffer.from(out); }
function totp(secret, t = Date.now()) { const step = Math.floor(t / 30000); const m = Buffer.alloc(8); m.writeBigUInt64BE(BigInt(step)); const h = crypto.createHmac('sha1', b32(secret)).update(m).digest(); const o = h[19] & 15; return String(((h.readUInt32BE(o) & 0x7fffffff) % 1e6)).padStart(6, '0'); }
async function call(action, payload, token) {
  return core.handle(JSON.parse(JSON.stringify({ action, payload, token })), { store, env });
}
async function ok(action, payload, token) { const r = await call(action, payload, token); if (!r.ok) throw new Error(action + ': ' + r.error); return r.data; }
function tb(journal) { let d = 0, c = 0; journal.forEach(j => { d += j.debit; c += j.credit; }); return [Math.round(d * 100) / 100, Math.round(c * 100) / 100]; }
const secrets = {};
async function signIn(username, password) {
  const r = await ok('login', { username, password });
  if (!r.mfa) return r;
  if (r.mfa === 'enroll') {
    assert.match(r.otpauth, /^otpauth:\/\/totp\/Myka%20Quad%3A/);
    assert.equal((await call('verify2fa', { challenge: r.challenge, code: '000000' })).ok, false);
    secrets[username] = r.secret;
    const s = await ok('verify2fa', { challenge: r.challenge, code: totp(r.secret) });
    assert.equal(s.recoveryCodes.length, 8);
    s.enrolled = true;
    advance(31);
    return s;
  }
  const s = await ok('verify2fa', { challenge: r.challenge, code: totp(secrets[username]) });
  advance(31);
  return s;
}

(async () => {
// RFC 6238 test vector (SHA1, T=59s -> 94287082)
assert.equal(core.totpAt_('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 1), '287082');

// login + forced 2FA enrolment + forced password change
assert.equal((await call('login', { username: 'admin', password: 'wrong' })).ok, false);
let s = await signIn('admin', 'TempPass123');
assert.ok(s.enrolled);
const recovery = s.recoveryCodes;
assert.equal(s.user.mustChange, 'Y');
assert.match((await call('saveCustomer', { name: 'X' }, s.token)).error, /change your temporary/);
await ok('changePassword', { current: 'TempPass123', next: 'NewPass2026' }, s.token);
const T = s.token;
// second login needs a code; same code can't be replayed
let ch = await ok('login', { username: 'admin', password: 'NewPass2026' });
assert.equal(ch.mfa, 'verify');
const code = totp(secrets.admin);
await ok('verify2fa', { challenge: ch.challenge, code });
ch = await ok('login', { username: 'admin', password: 'NewPass2026' });
assert.equal((await call('verify2fa', { challenge: ch.challenge, code })).ok, false, 'replay rejected');
// recovery code works once (any case / without dash)
await ok('verify2fa', { challenge: ch.challenge, code: recovery[0].replace('-', '').toLowerCase() });
ch = await ok('login', { username: 'admin', password: 'NewPass2026' });
assert.equal((await call('verify2fa', { challenge: ch.challenge, code: recovery[0] })).ok, false, 'recovery code single-use');
// 5 wrong codes kill the challenge
for (let i = 0; i < 5; i++) await call('verify2fa', { challenge: ch.challenge, code: '123456' });
assert.match((await call('verify2fa', { challenge: ch.challenge, code: totp(secrets.admin) })).error, /Too many|expired/);
advance(31);
let b = await ok('bootstrap', {}, T);
assert.equal(b.products.length, 7);
assert.equal(b.accounts.length, 13);
assert.equal(b.settings.invNext, '1057');

// customer (phone keeps leading zero)
const c = (await ok('saveCustomer', { name: 'Hallmark Café', phone: '0244123456', vatStatus: 'VAT' }, T)).customer;
assert.equal(c.id, 'CUST-001');

// invoice with VAT + part paid
const inv = (await ok('recordInvoice', { customerId: c.id, date: '2026-09-10', vatApplied: 'Y', paidAtInvoice: 100, payMethod: 'MoMo',
  lines: [{ productCode: 'EGG-CRT', qty: 10 }, { productCode: 'PO-5L', qty: 2 }] }, T)).invoice;
assert.equal(inv.invoiceNo, 'INV-2026-1057');
assert.equal(inv.subtotal, 900); assert.equal(inv.vat, 27); assert.equal(inv.total, 927);

// receipt over outstanding rejected, exact ok
assert.equal((await call('recordReceipt', { invoiceNo: inv.invoiceNo, amount: 900 }, T)).ok, false);
const r = (await ok('recordReceipt', { invoiceNo: inv.invoiceNo, amount: 827, method: 'Bank Transfer' }, T)).receipt;
assert.equal(r.receiptNo, 'RCT-2026-2019');

await ok('recordPurchase', { supplier: 'DANLECT', productCode: 'PO-25L', qty: 2, unitCost: 495, method: 'Credit' }, T);
await ok('recordExpense', { category: 'Transport', description: 'Delivery', amount: 50, method: 'Cash' }, T);
assert.equal((await call('postJournal', { description: 'bad', lines: [{ acct: '1000', debit: 10 }, { acct: '3000', credit: 9 }] }, T)).ok, false);
await ok('postJournal', { description: 'Owner capital', lines: [{ acct: '1000', debit: 1000 }, { acct: '3000', credit: 1000 }] }, T);

b = await ok('bootstrap', {}, T);
let [d, cr] = tb(b.journal); assert.equal(d, cr, 'trial balance');
const ar = b.journal.filter(j => j.acct === '1100').reduce((a, j) => a + j.debit - j.credit, 0);
assert.equal(Math.round(ar * 100) / 100, 0, 'A/R cleared');

// second invoice then void
const inv2 = (await ok('recordInvoice', { customerId: c.id, lines: [{ productCode: 'GARI-2KG', qty: 3 }] }, T)).invoice;
assert.equal(inv2.invoiceNo, 'INV-2026-1058');
await ok('voidInvoice', { invoiceNo: inv2.invoiceNo, reason: 'test' }, T);
b = await ok('bootstrap', {}, T); [d, cr] = tb(b.journal); assert.equal(d, cr);

// users & permissions
const u = (await ok('saveUser', { username: 'ama', name: 'Ama', role: 'staff', modules: ['sales', 'customers'], password: 'StaffPass1' }, T)).user;
let s2 = await signIn('ama', 'StaffPass1');
await ok('changePassword', { current: 'StaffPass1', next: 'StaffPass2' }, s2.token);
const b2 = await ok('bootstrap', {}, s2.token);
assert.ok(b2.invoices && !b2.journal && !b2.users, 'module filtering');
assert.match((await call('recordPurchase', { supplier: 'DANLECT', qty: 1, unitCost: 1 }, s2.token)).error, /access/);
assert.match((await call('listUsers', {}, s2.token)).error, /access/);
await ok('saveUser', { id: u.id, username: 'ama', role: 'viewer', modules: ['sales'], active: 'Y' }, T);
assert.match((await call('recordReceipt', { invoiceNo: inv.invoiceNo, amount: 1 }, s2.token)).error, /read-only/);
await ok('saveUser', { id: u.id, username: 'ama', role: 'viewer', modules: ['sales'], active: 'N' }, T);
assert.equal((await call('bootstrap', {}, s2.token)).ok, false, 'disabled user kicked');

// demo load / clear keeps books balanced and real data intact
const demo = await ok('loadDemo', {}, T);
assert.ok(demo.invoices > 20, 'demo invoices ' + demo.invoices);
b = await ok('bootstrap', {}, T); [d, cr] = tb(b.journal); assert.equal(d, cr, 'balanced with demo');
await ok('clearDemo', {}, T);
b = await ok('bootstrap', {}, T);
assert.equal(b.invoices.length, 2); assert.equal(b.customers.length, 1);
[d, cr] = tb(b.journal); assert.equal(d, cr);
assert.equal(b.settings.invNext, '1059');
console.log('ALL API TESTS PASSED', { demo, journalLines: b.journal.length });

// ---- 2FA admin + policy ----
const users = (await ok('listUsers', {}, T)).users;
assert.equal(users.find(x => x.username === 'admin').twoFactor, 'on');
const kofi = (await ok('saveUser', { username: 'kofi', role: 'staff', modules: ['sales'], password: 'KofiPass1' }, T)).user;
const k1 = await signIn('kofi', 'KofiPass1');
await ok('reset2fa', { id: kofi.id }, T);
assert.equal((await call('bootstrap', {}, k1.token)).ok, false, 'reset revokes sessions');
const k2 = await ok('login', { username: 'kofi', password: 'KofiPass1' });
assert.equal(k2.mfa, 'enroll', 're-enrol after reset');
// optional policy: sessions without 2FA allowed for users who have not enabled it
await ok('saveSettings', { twoFactorPolicy: 'optional' }, T);
const k3 = await ok('login', { username: 'kofi', password: 'KofiPass1' });
assert.ok(k3.token && !k3.mfa);
await ok('saveSettings', { twoFactorPolicy: 'all' }, T);
assert.match((await call('bootstrap', {}, k3.token)).error, /2-step/, 'policy tightening kicks non-2FA sessions');
// regenerate recovery codes needs a fresh code
assert.equal((await call('regenerateRecovery', { code: '000000' }, T)).ok, false);
assert.equal((await ok('regenerateRecovery', { code: totp(secrets.admin) }, T)).recoveryCodes.length, 8);
advance(31);

// ---- email (via the mykaquadent mailer) ----
const pdf = Buffer.from('%PDF-1.3 fake pdf content '.repeat(10)).toString('base64');
assert.match((await call('emailDocument', { kind: 'invoice', no: inv.invoiceNo, to: 'a@b.com', pdfBase64: pdf }, T)).error, /isn't set up/);
env.MAILER_URL = ('https://script.google.com/macros/s/MAILER/exec');
env.MAILER_SECRET = ('S'.repeat(40));
assert.match((await call('emailDocument', { kind: 'invoice', no: inv.invoiceNo, to: 'not-an-email', pdfBase64: pdf }, T)).error, /not a valid/);
assert.match((await call('emailDocument', { kind: 'invoice', no: inv.invoiceNo, to: 'a@b.com', pdfBase64: '' }, T)).error, /PDF/);
sent.length = 0;
const em = await ok('emailDocument', { kind: 'invoice', no: inv.invoiceNo, to: 'hallmark@example.com', cc: 'roscoe@example.com', message: 'Hello Ama — attached.', pdfBase64: 'data:application/pdf;base64,' + pdf }, T);
assert.equal(em.emailedTo, 'hallmark@example.com, roscoe@example.com');
assert.equal(sent.length, 1);
assert.equal(sent[0].url, 'https://script.google.com/macros/s/MAILER/exec');
const mp = JSON.parse(sent[0].opt.payload);
assert.equal(mp.secret, 'S'.repeat(40));
assert.deepEqual(mp.to, ['hallmark@example.com']); assert.deepEqual(mp.cc, ['roscoe@example.com']);
assert.equal(mp.subject, 'Invoice INV-2026-1057 from MYKA QUAD LIMITED');
assert.equal(mp.name, 'MYKA QUAD LIMITED'); assert.equal(mp.replyTo, 'mykaquadent@gmail.com');
assert.equal(mp.filename, 'INV-2026-1057.pdf'); assert.equal(mp.pdfBase64, pdf);
assert.match(mp.html, /Hello Ama/); assert.match(mp.text, /Please quote INV-2026-1057/);
const bb = await ok('bootstrap', {}, T);
assert.ok(bb.invoices.find(i => i.invoiceNo === inv.invoiceNo).emailedAt);
await ok('emailDocument', { kind: 'receipt', no: r.receiptNo, to: 'hallmark@example.com', pdfBase64: pdf }, T);
assert.match((await call('emailDocument', { kind: 'receipt', no: r.receiptNo, to: 'a@b.com', pdfBase64: pdf }, s2.token)).error || '', /access|disabled|sign/i);
console.log('2FA + EMAIL TESTS PASSED');
if (store.pool) await store.pool.end();

})().catch((e) => { console.error(e); process.exit(1); });
