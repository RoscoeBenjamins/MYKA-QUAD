const assert = require('assert');
const crypto = require('crypto');
const vm = require('vm');
const { makeContext } = require('./gas-harness');
const sent = [];
const UrlFetchApp = { fetch(url, opt) { sent.push({ url, opt }); return { getResponseCode: () => 200, getContentText: () => '{"ok":true,"from":"mykaquadent@gmail.com"}' }; } };
const ScriptApp = { getOAuthToken: () => 'tok' };
const ctx = makeContext({ UrlFetchApp, ScriptApp });
vm.runInContext('Date.__off = 0; (function(){ var n = Date.now; Date.now = function(){ return n() + Date.__off; }; })();', ctx);
const advance = (sec) => vm.runInContext('Date.__off += ' + sec * 1000, ctx);
const offset = () => vm.runInContext('Date.__off', ctx);
// independent RFC 6238 implementation (not the one under test)
function b32(s) { const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let bits = ''; for (const c of s) bits += A.indexOf(c).toString(2).padStart(5, '0'); const out = []; for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2)); return Buffer.from(out); }
function totp(secret, t = Date.now() + offset()) { const step = Math.floor(t / 30000); const m = Buffer.alloc(8); m.writeBigUInt64BE(BigInt(step)); const h = crypto.createHmac('sha1', b32(secret)).update(m).digest(); const o = h[19] & 15; return String(((h.readUInt32BE(o) & 0x7fffffff) % 1e6)).padStart(6, '0'); }
function call(action, payload, token) {
  const r = JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify({ action, payload, token }) } }).getContent());
  return r;
}
function ok(action, payload, token) { const r = call(action, payload, token); if (!r.ok) throw new Error(action + ': ' + r.error); return r.data; }
function tb(journal) { let d = 0, c = 0; journal.forEach(j => { d += j.debit; c += j.credit; }); return [Math.round(d * 100) / 100, Math.round(c * 100) / 100]; }
const secrets = {};
function signIn(username, password) {
  const r = ok('login', { username, password });
  if (!r.mfa) return r;
  if (r.mfa === 'enroll') {
    assert.match(r.otpauth, /^otpauth:\/\/totp\/Myka%20Quad%3A/);
    assert.equal(call('verify2fa', { challenge: r.challenge, code: '000000' }).ok, false);
    secrets[username] = r.secret;
    const s = ok('verify2fa', { challenge: r.challenge, code: totp(r.secret) });
    assert.equal(s.recoveryCodes.length, 8);
    s.enrolled = true;
    advance(31);
    return s;
  }
  const s = ok('verify2fa', { challenge: r.challenge, code: totp(secrets[username]) });
  advance(31);
  return s;
}

// RFC 6238 test vector (SHA1, T=59s -> 94287082)
assert.equal(ctx.totpAt_('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 1), '287082');

// login + forced 2FA enrolment + forced password change
assert.equal(call('login', { username: 'admin', password: 'wrong' }).ok, false);
let s = signIn('admin', 'TempPass123');
assert.ok(s.enrolled);
const recovery = s.recoveryCodes;
assert.equal(s.user.mustChange, 'Y');
assert.match(call('saveCustomer', { name: 'X' }, s.token).error, /change your temporary/);
ok('changePassword', { current: 'TempPass123', next: 'NewPass2026' }, s.token);
const T = s.token;
// second login needs a code; same code can't be replayed
let ch = ok('login', { username: 'admin', password: 'NewPass2026' });
assert.equal(ch.mfa, 'verify');
const code = totp(secrets.admin);
ok('verify2fa', { challenge: ch.challenge, code });
ch = ok('login', { username: 'admin', password: 'NewPass2026' });
assert.equal(call('verify2fa', { challenge: ch.challenge, code }).ok, false, 'replay rejected');
// recovery code works once (any case / without dash)
ok('verify2fa', { challenge: ch.challenge, code: recovery[0].replace('-', '').toLowerCase() });
ch = ok('login', { username: 'admin', password: 'NewPass2026' });
assert.equal(call('verify2fa', { challenge: ch.challenge, code: recovery[0] }).ok, false, 'recovery code single-use');
// 5 wrong codes kill the challenge
for (let i = 0; i < 5; i++) call('verify2fa', { challenge: ch.challenge, code: '123456' });
assert.match(call('verify2fa', { challenge: ch.challenge, code: totp(secrets.admin) }).error, /Too many|expired/);
advance(31);
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
let s2 = signIn('ama', 'StaffPass1');
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

// ---- 2FA admin + policy ----
const users = ok('listUsers', {}, T).users;
assert.equal(users.find(x => x.username === 'admin').twoFactor, 'on');
const kofi = ok('saveUser', { username: 'kofi', role: 'staff', modules: ['sales'], password: 'KofiPass1' }, T).user;
const k1 = signIn('kofi', 'KofiPass1');
ok('reset2fa', { id: kofi.id }, T);
assert.equal(call('bootstrap', {}, k1.token).ok, false, 'reset revokes sessions');
const k2 = ok('login', { username: 'kofi', password: 'KofiPass1' });
assert.equal(k2.mfa, 'enroll', 're-enrol after reset');
// optional policy: sessions without 2FA allowed for users who have not enabled it
ok('saveSettings', { twoFactorPolicy: 'optional' }, T);
const k3 = ok('login', { username: 'kofi', password: 'KofiPass1' });
assert.ok(k3.token && !k3.mfa);
ok('saveSettings', { twoFactorPolicy: 'all' }, T);
assert.match(call('bootstrap', {}, k3.token).error, /2-step/, 'policy tightening kicks non-2FA sessions');
// regenerate recovery codes needs a fresh code
assert.equal(call('regenerateRecovery', { code: '000000' }, T).ok, false);
assert.equal(ok('regenerateRecovery', { code: totp(secrets.admin) }, T).recoveryCodes.length, 8);
advance(31);

// ---- email (via the mykaquadent mailer) ----
const pdf = Buffer.from('%PDF-1.3 fake pdf content '.repeat(10)).toString('base64');
assert.match(call('emailDocument', { kind: 'invoice', no: inv.invoiceNo, to: 'a@b.com', pdfBase64: pdf }, T).error, /isn't set up/);
ctx.__props.set('MAILER_URL', 'https://script.google.com/macros/s/MAILER/exec');
ctx.__props.set('MAILER_SECRET', 'S'.repeat(40));
assert.match(call('emailDocument', { kind: 'invoice', no: inv.invoiceNo, to: 'not-an-email', pdfBase64: pdf }, T).error, /not a valid/);
assert.match(call('emailDocument', { kind: 'invoice', no: inv.invoiceNo, to: 'a@b.com', pdfBase64: '' }, T).error, /PDF/);
sent.length = 0;
const em = ok('emailDocument', { kind: 'invoice', no: inv.invoiceNo, to: 'hallmark@example.com', cc: 'roscoe@example.com', message: 'Hello Ama — attached.', pdfBase64: 'data:application/pdf;base64,' + pdf }, T);
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
const bb = ok('bootstrap', {}, T);
assert.ok(bb.invoices.find(i => i.invoiceNo === inv.invoiceNo).emailedAt);
ok('emailDocument', { kind: 'receipt', no: r.receiptNo, to: 'hallmark@example.com', pdfBase64: pdf }, T);
assert.match(call('emailDocument', { kind: 'receipt', no: r.receiptNo, to: 'a@b.com', pdfBase64: pdf }, s2.token).error || '', /access|disabled|sign/i);
console.log('2FA + EMAIL TESTS PASSED');
