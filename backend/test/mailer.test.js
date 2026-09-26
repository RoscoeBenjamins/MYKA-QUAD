// Tests the mykaquadent mailer (Mailer.gs) with a fake MailApp.
const assert = require('assert'); const fs = require('fs'); const path = require('path'); const vm = require('vm');
const sent = []; let quota = 100;
const ctx = {
  MailApp: { sendEmail: (to, subject, text, opts) => { sent.push({ to, subject, text, opts }); quota -= to.split(',').length + (opts.cc ? opts.cc.split(',').length : 0); }, getRemainingDailyQuota: () => quota },
  Session: { getEffectiveUser: () => ({ getEmail: () => 'mykaquadent@gmail.com' }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k === 'MAILER_SECRET' ? 'K'.repeat(40) : null) }) },
  Utilities: { newBlob: (bytes, type, name) => ({ bytes, type, name }), base64Decode: s => Array.from(Buffer.from(s, 'base64')) },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: s => ({ s, setMimeType() { return this; } }) },
  Logger: { log() {} },
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', '..', 'mailer', 'Mailer.gs'), 'utf8'), ctx);
const post = b => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(b) } }).s);
const pdf = Buffer.from('%PDF fake').toString('base64');
const base = { secret: 'K'.repeat(40), to: ['a@b.com'], cc: [], subject: 'Invoice INV-1', text: 't', html: '<p>h</p>', pdfBase64: pdf, filename: 'INV-1.pdf', name: 'MYKA QUAD LIMITED', replyTo: 'mykaquadent@gmail.com' };
assert.deepEqual(post({ ...base, secret: 'wrong' }), { ok: false, error: 'unauthorized' });
assert.deepEqual(post({ ...base, secret: 'K'.repeat(39) }), { ok: false, error: 'unauthorized' });
assert.equal(sent.length, 0);
const r = post({ ...base, cc: ['c@d.com'] });
assert.equal(r.ok, true); assert.equal(r.from, 'mykaquadent@gmail.com');
assert.equal(sent[0].to, 'a@b.com'); assert.equal(sent[0].opts.cc, 'c@d.com'); assert.equal(sent[0].opts.replyTo, 'mykaquadent@gmail.com');
assert.equal(sent[0].opts.attachments[0].name, 'INV-1.pdf'); assert.equal(sent[0].opts.attachments[0].type, 'application/pdf');
assert.equal(post({ ...base, to: ['bad'] }).ok, false);
assert.equal(post({ ...base, pdfBase64: 'not base64!!' }).ok, false);
assert.equal(post({ ...base, to: Array(11).fill('x@y.com') }).ok, false);
quota = 0; assert.match(post(base).error, /limit/);
console.log('MAILER TESTS PASSED');
