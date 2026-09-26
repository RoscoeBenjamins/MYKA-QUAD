/**
 * MYKA QUAD — MAILER  (Google Apps Script, owned by mykaquadent@gmail.com)
 * ---------------------------------------------------------------------------
 * Sends invoice / receipt emails FROM mykaquadent@gmail.com on behalf of the
 * Myka Quad ERP API. The ERP never gets Gmail access; it POSTs the message and
 * PDF here with a shared secret. Only permission this script needs:
 * "Send email as you" (script.send_mail).
 *
 * Script Properties: MAILER_SECRET (same value as in the ERP API project).
 * Deploy: Web app · Execute as: Me (mykaquadent@gmail.com) · Who has access: Anyone
 */
var MAX_RECIPIENTS = 10;
var MAX_PDF_BYTES = 8 * 1024 * 1024;

function doGet() {
  return out_({ ok: true, app: 'Myka Quad Mailer', from: Session.getEffectiveUser().getEmail(), quotaLeft: MailApp.getRemainingDailyQuota() });
}

function doPost(e) {
  try {
    var req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var secret = PropertiesService.getScriptProperties().getProperty('MAILER_SECRET');
    if (!secret || secret.length < 32 || !safeEqual_(String(req.secret || ''), secret)) return out_({ ok: false, error: 'unauthorized' });
    var to = emails_(req.to), cc = emails_(req.cc);
    if (!to.length) throw new Error('no recipient');
    if (to.length + cc.length > MAX_RECIPIENTS) throw new Error('too many recipients');
    var pdf = String(req.pdfBase64 || '');
    if (!/^[A-Za-z0-9+/]+=*$/.test(pdf) || pdf.length * 0.75 > MAX_PDF_BYTES) throw new Error('bad attachment');
    var filename = String(req.filename || 'document.pdf').replace(/[^A-Za-z0-9._-]/g, '_');
    if (MailApp.getRemainingDailyQuota() < to.length + cc.length) throw new Error("Today's Gmail sending limit is used up — try again tomorrow.");
    var blob = Utilities.newBlob(Utilities.base64Decode(pdf), 'application/pdf', filename);
    var opts = { htmlBody: String(req.html || ''), attachments: [blob], name: String(req.name || 'MYKA QUAD LIMITED').slice(0, 80) };
    if (cc.length) opts.cc = cc.join(',');
    if (req.replyTo && emails_(req.replyTo).length) opts.replyTo = emails_(req.replyTo)[0];
    MailApp.sendEmail(to.join(','), String(req.subject || '').slice(0, 250), String(req.text || ''), opts);
    return out_({ ok: true, from: Session.getEffectiveUser().getEmail(), quotaLeft: MailApp.getRemainingDailyQuota() });
  } catch (err) {
    return out_({ ok: false, error: String(err && err.message || err) });
  }
}

function emails_(v) {
  var arr = (Array.isArray(v) ? v : String(v || '').split(/[,;\s]+/)).map(function (x) { return String(x).trim(); }).filter(function (x) { return x; });
  arr.forEach(function (x) { if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x)) throw new Error('invalid email ' + x); });
  return arr;
}
function safeEqual_(a, b) {
  if (a.length !== b.length) return false;
  var d = 0;
  for (var i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

/** Run once from the editor to approve the "Send email as you" permission. */
function authorize() {
  Logger.log('Mailer ready. Sending as ' + Session.getEffectiveUser().getEmail() + ', quota left today: ' + MailApp.getRemainingDailyQuota());
}
