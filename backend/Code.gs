/**
 * MYKA QUAD — MINI ERP API  (Google Apps Script web app)
 * ---------------------------------------------------------------------------
 * Database: the "Myka Quad DB" Google Sheet in the "Myka Quad ERP" Drive folder.
 * Frontend: GitHub Pages site, talks to this script over HTTPS (POST, JSON).
 *
 * Posting rules mirror the Excel workbook's macros (RecordInvoice / RecordReceipt):
 *   Invoice : Dr 1100 A/R (total)        Cr 4000 Sales (subtotal)   Cr 2100 VAT (vat)
 *             + if paid at invoicing: Dr Cash/MoMo/Bank  Cr 1100 A/R
 *   Receipt : Dr Cash/MoMo/Bank          Cr 1100 A/R
 *   Purchase: Dr 5100 Purchases          Cr Cash/MoMo/Bank  (or 2000 A/P if on credit)
 *   Expense : Dr 6000 Operating Exp.     Cr Cash/MoMo/Bank
 *   Void inv: exact reversal of the invoice's journal lines
 *
 * ONE-TIME SETUP: see the README in the Drive folder (Deploy > New deployment >
 * Web app > Execute as: Me > Who has access: Anyone).
 */

// Filled in when the database sheet was created. If this script is bound to the
// sheet (Extensions > Apps Script) it falls back to the active spreadsheet.
var DB_ID = '__DB_ID__';
var ADMIN_TEMP_PASSWORD = '__ADMIN_TEMP__';   // only used to seed the first admin; forced change on first login
var APP_VERSION = '1.2.0';
var TOTP_ISSUER = 'Myka Quad';
var MFA_CHALLENGE_MIN = 10;
var MAX_EMAIL_BYTES = 8 * 1024 * 1024;
var SESSION_HOURS = 12;
var HASH_ROUNDS = 300;

var MODULES = ['dashboard', 'sales', 'purchases', 'customers', 'products', 'suppliers',
               'accounting', 'trends', 'forecast', 'hygiene', 'admin'];
var ROLES = ['admin', 'manager', 'staff', 'viewer'];
var PAY_ACCOUNTS = { 'Cash': '1000', 'MoMo': '1010', 'Bank Transfer': '1020', 'Cheque': '1020', 'Credit': '2000' };

// ---- schema: [field, type]  (s = text, n = number) --------------------------
var SCHEMA = {
  Settings:     [['key','s'],['value','s']],
  Users:        [['id','s'],['username','s'],['name','s'],['email','s'],['role','s'],['modules','s'],
                 ['passHash','s'],['salt','s'],['active','s'],['mustChange','s'],['createdAt','s'],['lastLogin','s'],
                 ['totpSecret','s'],['totpEnabled','s'],['totpLastStep','n'],['recoveryHashes','s']],
  Sessions:     [['token','s'],['userId','s'],['expires','s'],['mfa','s']],
  Customers:    [['id','s'],['name','s'],['contact','s'],['phone','s'],['email','s'],['address','s'],['type','s'],
                 ['vatStatus','s'],['tin','s'],['openingBalance','n'],['notes','s'],['createdAt','s'],['isDemo','s']],
  Suppliers:    [['id','s'],['name','s'],['products','s'],['contact','s'],['phone','s'],['email','s'],['address','s'],
                 ['terms','s'],['notes','s'],['isDemo','s']],
  Products:     [['code','s'],['category','s'],['name','s'],['unit','s'],['supplier','s'],['cost','n'],['price','n'],
                 ['vat','s'],['reorderLevel','n'],['active','s'],['notes','s']],
  Invoices:     [['invoiceNo','s'],['date','s'],['customerId','s'],['customerName','s'],['vatApplied','s'],
                 ['subtotal','n'],['vat','n'],['total','n'],['paidAtInvoice','n'],['payMethod','s'],['dueDate','s'],
                 ['nextStep','s'],['status','s'],['notes','s'],['createdBy','s'],['createdAt','s'],['isDemo','s'],
                 ['emailedAt','s'],['emailedTo','s']],
  InvoiceLines: [['invoiceNo','s'],['date','s'],['customerName','s'],['productCode','s'],['productName','s'],
                 ['unit','s'],['qty','n'],['unitPrice','n'],['lineTotal','n'],['unitCost','n'],['isDemo','s']],
  Receipts:     [['receiptNo','s'],['date','s'],['customerName','s'],['invoiceNo','s'],['amount','n'],['method','s'],
                 ['receivedBy','s'],['notes','s'],['status','s'],['createdBy','s'],['createdAt','s'],['isDemo','s'],
                 ['emailedAt','s'],['emailedTo','s']],
  Purchases:    [['purchaseNo','s'],['date','s'],['supplier','s'],['productCode','s'],['productName','s'],['qty','n'],
                 ['unitCost','n'],['total','n'],['method','s'],['notes','s'],['createdBy','s'],['createdAt','s'],['isDemo','s']],
  Expenses:     [['expenseNo','s'],['date','s'],['category','s'],['description','s'],['amount','n'],['method','s'],
                 ['createdBy','s'],['createdAt','s'],['isDemo','s']],
  Accounts:     [['code','s'],['name','s'],['type','s'],['normal','s'],['notes','s']],
  Journal:      [['entryNo','n'],['date','s'],['ref','s'],['acct','s'],['acctName','s'],['debit','n'],['credit','n'],
                 ['description','s'],['source','s'],['createdBy','s'],['isDemo','s']],
  Audit:        [['ts','s'],['user','s'],['action','s'],['detail','s']]
};

var DEFAULT_SETTINGS = {
  companyName: 'MYKA QUAD LIMITED', address: 'NO 377A, TULIP ROAD, LAKESIDE ESTATE',
  email: 'mykaquadent@gmail.com', phone: '0274051234', momo: '0543926042',
  bankName: 'Access Bank', bankAccount: '1020000010397', currency: 'GHS', vatRate: '0.03',
  defaultVatStatus: 'Non-VAT', invPrefix: 'INV', invYear: '2026', invNext: '1057',
  rctPrefix: 'RCT', rctYear: '2026', rctNext: '2019', purPrefix: 'PUR', purNext: '5001',
  expPrefix: 'EXP', expNext: '7001', jeNext: '1', custNext: '1', paymentTermsDays: '14',
  twoFactorPolicy: 'all', emailFrom: 'mykaquadent@gmail.com', emailReplyTo: 'mykaquadent@gmail.com', emailSenderName: 'MYKA QUAD LIMITED'
};

// =============================================================================
//  HTTP entry points
// =============================================================================
function doGet(e) {
  var p = PropertiesService.getScriptProperties();
  return json_({ ok: true, app: 'Myka Quad ERP API', version: APP_VERSION, time: new Date().toISOString() });
}

function doPost(e) {
  var req;
  try { req = JSON.parse(e.postData.contents || '{}'); }
  catch (err) { return json_({ ok: false, error: 'Bad request body' }); }
  try {
    var data = route_(req.action, req.payload || {}, req.token);
    return json_({ ok: true, data: data });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

// action -> [module needed, needs write access]
var ACTIONS = {
  bootstrap:        [null, false],
  changePassword:   [null, false],
  logout:           [null, false],
  saveCustomer:     ['customers', true],  deleteCustomer: ['customers', true],
  saveSupplier:     ['suppliers', true],  deleteSupplier: ['suppliers', true],
  saveProduct:      ['products', true],   deleteProduct:  ['products', true],
  recordInvoice:    ['sales', true],      voidInvoice:    ['sales', true],
  updateInvoiceNextStep: ['sales', true],
  recordReceipt:    ['sales', true],      voidReceipt:    ['sales', true],
  recordPurchase:   ['purchases', true],  recordExpense:  ['purchases', true],
  postJournal:      ['accounting', true], saveAccount:    ['accounting', true],
  saveSettings:     ['admin', true],      listUsers:      ['admin', false],
  saveUser:         ['admin', true],      resetPassword:  ['admin', true],
  deleteUser:       ['admin', true],      loadDemo:       ['admin', true],
  clearDemo:        ['admin', true],      auditLog:       ['admin', false],
  reset2fa:         ['admin', true],      regenerateRecovery: [null, false],
  emailDocument:    ['sales', true]
};

function route_(action, p, token) {
  ensureSchema_();
  if (action === 'ping') return { pong: true };
  if (action === 'login') return login_(p.username, p.password);
  if (action === 'verify2fa') return verify2fa_(p.challenge, p.code);
  var spec = ACTIONS[action];
  if (!spec) throw new Error('Unknown action: ' + action);
  var user = auth_(token);
  if (user.mustChange === 'Y' && action !== 'changePassword' && action !== 'logout' && action !== 'bootstrap')
    throw new Error('Please change your temporary password first.');
  if (spec[0] && !hasModule_(user, spec[0])) throw new Error('You do not have access to this area.');
  if (spec[1] && user.role === 'viewer') throw new Error('Your account is read-only.');
  var fn = HANDLERS[action];
  if (!spec[1]) return fn(p, user);
  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try { return fn(p, user); } finally { lock.releaseLock(); }
}

function hasModule_(user, mod) {
  if (user.role === 'admin') return true;
  if (mod === 'admin') return false;
  return (user.modules || '').split(',').indexOf(mod) >= 0;
}

// =============================================================================
//  Sheet data layer
// =============================================================================
var _ss = null, _cache = {};
function ss_() {
  if (_ss) return _ss;
  var id = PropertiesService.getScriptProperties().getProperty('DB_ID') || DB_ID;
  _ss = (id && id.indexOf('__') !== 0) ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  return _ss;
}

var _schemaChecked = false;
function ensureSchema_() {
  if (_schemaChecked) return;
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('schemaVersion') === '4') { _schemaChecked = true; return; }
  setup();
  props.setProperty('schemaVersion', '4');
  _schemaChecked = true;
}

/** Run once from the editor (or automatically on first request). Creates any missing tabs + seed data. */
function setup() {
  var ss = ss_();
  Object.keys(SCHEMA).forEach(function (name) {
    var cols = SCHEMA[name];
    var sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    var headers = cols.map(function (c) { return c[0]; });
    var existing = sh.getLastRow() > 0 ? sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0] : [];
    if (existing.join('|') !== headers.join('|')) {
      if (sh.getLastRow() <= 1) {
        sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
        sh.setFrozenRows(1);
      } else {
        // append any missing columns without disturbing data
        headers.forEach(function (h) {
          if (existing.indexOf(h) < 0) sh.getRange(1, sh.getLastColumn() + 1).setValue(h).setFontWeight('bold');
        });
      }
    }
    // text columns stay text (keeps leading zeros on phone numbers, ISO dates as typed)
    var hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    cols.forEach(function (c) {
      var idx = hdr.indexOf(c[0]);
      if (idx >= 0) sh.getRange(2, idx + 1, sh.getMaxRows() - 1, 1).setNumberFormat(c[1] === 'n' ? '0.00' : '@');
    });
  });
  var sheet1 = ss.getSheetByName('Sheet1');
  if (sheet1 && sheet1.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(sheet1);
  _cache = {};
  seed_();
}

function sheet_(name) {
  var sh = ss_().getSheetByName(name);
  if (!sh) throw new Error('Missing sheet ' + name);
  return sh;
}

function cellOut_(v, type) {
  if (type === 'n') { var n = Number(v); return isNaN(n) ? 0 : n; }
  if (v instanceof Date) {
    var tz = Session.getScriptTimeZone();
    return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  }
  return v === null || v === undefined ? '' : String(v);
}

function read_(name) {
  if (_cache[name]) return _cache[name];
  var sh = sheet_(name);
  var last = sh.getLastRow();
  var types = {};
  SCHEMA[name].forEach(function (c) { types[c[0]] = c[1]; });
  if (last < 2) { _cache[name] = []; return _cache[name]; }
  var values = sh.getRange(1, 1, last, sh.getLastColumn()).getValues();
  var hdr = values[0];
  var rows = [];
  for (var r = 1; r < values.length; r++) {
    var o = {}, empty = true;
    for (var c = 0; c < hdr.length; c++) {
      if (!hdr[c]) continue;
      var v = values[r][c];
      if (v !== '' && v !== null) empty = false;
      o[hdr[c]] = cellOut_(v, types[hdr[c]] || 's');
    }
    if (!empty) { o._row = r + 1; rows.push(o); }
  }
  _cache[name] = rows;
  return rows;
}

function toRow_(name, obj, hdr) {
  var types = {};
  SCHEMA[name].forEach(function (c) { types[c[0]] = c[1]; });
  return hdr.map(function (h) {
    var v = obj[h];
    if (v === undefined || v === null) return types[h] === 'n' ? 0 : '';
    if (types[h] === 'n') { var n = Number(v); return isNaN(n) ? 0 : Math.round(n * 100) / 100; }
    return String(v);
  });
}

function header_(name) {
  var sh = sheet_(name);
  return sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
}

function append_(name, objs) {
  if (!objs.length) return;
  var sh = sheet_(name), hdr = header_(name);
  var rows = objs.map(function (o) { return toRow_(name, o, hdr); });
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, hdr.length).setValues(rows);
  delete _cache[name];
}

function update_(name, row, obj) {
  var sh = sheet_(name), hdr = header_(name);
  sh.getRange(row, 1, 1, hdr.length).setValues([toRow_(name, obj, hdr)]);
  delete _cache[name];
}

function deleteWhere_(name, pred) {
  var rows = read_(name).filter(pred).map(function (r) { return r._row; }).sort(function (a, b) { return b - a; });
  var sh = sheet_(name);
  rows.forEach(function (r) { sh.deleteRow(r); });
  delete _cache[name];
  return rows.length;
}

function find_(name, field, val) {
  var rows = read_(name);
  for (var i = 0; i < rows.length; i++) if (String(rows[i][field]) === String(val)) return rows[i];
  return null;
}

function strip_(rows, drop) {
  return rows.map(function (r) {
    var o = {};
    Object.keys(r).forEach(function (k) { if (k !== '_row' && (!drop || drop.indexOf(k) < 0)) o[k] = r[k]; });
    return o;
  });
}

// ---- settings ---------------------------------------------------------------
function settings_() {
  var s = {};
  Object.keys(DEFAULT_SETTINGS).forEach(function (k) { s[k] = DEFAULT_SETTINGS[k]; });
  read_('Settings').forEach(function (r) { s[r.key] = r.value; });
  return s;
}
function setSetting_(key, value) {
  var row = find_('Settings', 'key', key);
  if (row) update_('Settings', row._row, { key: key, value: String(value) });
  else append_('Settings', [{ key: key, value: String(value) }]);
}
function nextNo_(prefixKey, yearKey, counterKey) {
  var s = settings_();
  var n = parseInt(s[counterKey], 10);
  var no = s[prefixKey] + '-' + (yearKey ? s[yearKey] + '-' : '') + n;
  setSetting_(counterKey, n + 1);
  return no;
}

// =============================================================================
//  Seed data (taken from Myka_Quad_Master_Workbook.xlsx)
// =============================================================================
function seed_() {
  if (!read_('Settings').length) {
    append_('Settings', Object.keys(DEFAULT_SETTINGS).map(function (k) { return { key: k, value: DEFAULT_SETTINGS[k] }; }));
  }
  if (!read_('Accounts').length) {
    append_('Accounts', [
      ['1000','Cash','Asset','Debit','Physical cash in hand / till'],
      ['1010','Mobile Money (MoMo)','Asset','Debit',''],
      ['1020','Bank — Access Bank','Asset','Debit','Acct 1020000010397'],
      ['1100','Accounts Receivable','Asset','Debit','What customers owe on unpaid/partly-paid invoices'],
      ['1200','Inventory','Asset','Debit','Stock of palm oil, gari, eggs on hand'],
      ['2000','Accounts Payable','Liability','Credit','What Myka Quad owes suppliers'],
      ['2100','VAT Payable (Output VAT)','Liability','Credit','VAT collected on sales, owed to GRA'],
      ['3000',"Owner's Equity / Capital",'Equity','Credit',''],
      ['3900','Retained Earnings','Equity','Credit',''],
      ['4000','Sales Revenue','Income','Credit','Posted automatically by Record Invoice'],
      ['5000','Cost of Goods Sold','Expense','Debit','Post manually when you reconcile stock'],
      ['5100','Purchases','Expense','Debit','From the Purchases module'],
      ['6000','Operating Expenses','Expense','Debit','Rent, transport, airtime, salaries, etc.']
    ].map(function (a) { return { code: a[0], name: a[1], type: a[2], normal: a[3], notes: a[4] }; }));
  }
  if (!read_('Suppliers').length) {
    append_('Suppliers', [
      { id: 'SUP-01', name: 'DANLECT', products: 'Palm Oil (25L bulk, decanted into 1L/4L/5L), Gari', terms: '', notes: 'Palm oil bought as 25L @ GHS 495' },
      { id: 'SUP-02', name: 'THEODORA FARMS', products: 'Eggs (by the crate)', terms: '', notes: '' }
    ]);
  }
  if (!read_('Products').length) {
    var c25 = 495;
    append_('Products', [
      { code: 'PO-25L', category: 'Palm Oil', name: 'Palm Oil — 25L (bulk)', unit: '25L', supplier: 'DANLECT', cost: c25, price: 750, vat: 'Y', reorderLevel: 2, active: 'Y', notes: 'Bulk container — source for decanting' },
      { code: 'PO-1L', category: 'Palm Oil', name: 'Palm Oil — 1L bottle', unit: '1L', supplier: 'DANLECT', cost: c25 / 25, price: 45, vat: 'Y', reorderLevel: 10, active: 'Y', notes: 'Decanted from the 25L bulk container' },
      { code: 'PO-4L', category: 'Palm Oil', name: 'Palm Oil — 4L bottle', unit: '4L', supplier: 'DANLECT', cost: c25 / 25 * 4, price: 160, vat: 'Y', reorderLevel: 5, active: 'Y', notes: 'Decanted from the 25L bulk container' },
      { code: 'PO-5L', category: 'Palm Oil', name: 'Palm Oil — 5L bottle', unit: '5L', supplier: 'DANLECT', cost: c25 / 25 * 5, price: 200, vat: 'Y', reorderLevel: 5, active: 'Y', notes: 'Decanted from the 25L bulk container' },
      { code: 'GARI-2KG', category: 'Gari', name: 'Gari — 2kg bag', unit: '2kg', supplier: 'DANLECT', cost: 0, price: 55, vat: 'Y', reorderLevel: 10, active: 'Y', notes: 'Cost price not supplied yet — enter Danlect cost' },
      { code: 'GARI-3KG', category: 'Gari', name: 'Gari — 3kg bag', unit: '3kg', supplier: 'DANLECT', cost: 0, price: 65, vat: 'Y', reorderLevel: 10, active: 'Y', notes: 'Cost price not supplied yet — enter Danlect cost' },
      { code: 'EGG-CRT', category: 'Eggs', name: 'Eggs — 1 crate', unit: 'Crate', supplier: 'THEODORA FARMS', cost: 45, price: 50, vat: 'Y', reorderLevel: 10, active: 'Y', notes: '' }
    ]);
  }
  if (!read_('Users').length) {
    var salt = Utilities.getUuid();
    append_('Users', [{
      id: 'U-' + Utilities.getUuid().slice(0, 8), username: 'admin', name: 'Roscoe (Administrator)',
      email: 'fafale17@gmail.com', role: 'admin', modules: MODULES.join(','),
      passHash: hash_(PropertiesService.getScriptProperties().getProperty('ADMIN_TEMP') || ADMIN_TEMP_PASSWORD, salt), salt: salt, active: 'Y', mustChange: 'Y',
      createdAt: new Date().toISOString(), lastLogin: ''
    }]);
  }
}

// =============================================================================
//  Auth
// =============================================================================
function hash_(password, salt) {
  var h = salt + ':' + password;
  for (var i = 0; i < HASH_ROUNDS; i++) {
    var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, h, Utilities.Charset.UTF_8);
    h = bytes.map(function (b) { var v = (b < 0 ? b + 256 : b).toString(16); return v.length === 1 ? '0' + v : v; }).join('');
  }
  return h;
}

function publicUser_(u) {
  return { id: u.id, username: u.username, name: u.name, email: u.email, role: u.role,
           modules: u.role === 'admin' ? MODULES.slice() : (u.modules ? u.modules.split(',') : []),
           active: u.active, mustChange: u.mustChange, createdAt: u.createdAt, lastLogin: u.lastLogin,
           twoFactor: u.totpEnabled === 'Y' ? 'on' : 'off' };
}

function login_(username, password) {
  username = String(username || '').trim().toLowerCase();
  if (!username || !password) throw new Error('Enter your username and password.');
  var cache = CacheService.getScriptCache();
  var failKey = 'fail_' + username;
  var fails = parseInt(cache.get(failKey) || '0', 10);
  if (fails >= 5) throw new Error('Too many failed attempts. Try again in 15 minutes.');
  var u = find_('Users', 'username', username);
  if (!u || u.active !== 'Y' || hash_(password, u.salt) !== u.passHash) {
    cache.put(failKey, String(fails + 1), 900);
    throw new Error('Wrong username or password.');
  }
  cache.remove(failKey);
  if (u.totpEnabled === 'Y') {
    return { mfa: 'verify', challenge: newChallenge_({ userId: u.id, mode: 'verify' }) };
  }
  if (mfaRequired_(u)) {
    var secret = newTotpSecret_();
    return { mfa: 'enroll', challenge: newChallenge_({ userId: u.id, mode: 'enroll', secret: secret }),
             secret: secret, otpauth: otpauthUri_(u.username, secret) };
  }
  return createSession_(u, false);
}

function createSession_(u, mfa) {
  var cache = CacheService.getScriptCache();
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  var token, expires;
  try {
    token = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, '');
    expires = new Date(Date.now() + SESSION_HOURS * 3600 * 1000).toISOString();
    var now = new Date().toISOString();
    deleteWhere_('Sessions', function (s) { return s.expires < now; });
    append_('Sessions', [{ token: token, userId: u.id, expires: expires, mfa: mfa ? 'Y' : '' }]);
    u.lastLogin = now;
    update_('Users', u._row, u);
    audit_(u.username, 'login', mfa ? 'with 2-step verification' : '');
  } finally { lock.releaseLock(); }
  cache.put('sess_' + token, JSON.stringify({ userId: u.id, expires: expires, mfa: mfa ? 'Y' : '' }), 21600);
  return { token: token, expires: expires, user: publicUser_(u) };
}

function mfaRequired_(u) {
  var policy = settings_().twoFactorPolicy || 'all';
  if (policy === 'all') return true;
  if (policy === 'admins') return u.role === 'admin';
  return false;
}

// ---- 2-step verification (TOTP, RFC 6238 — Google / Microsoft Authenticator) ----
function newChallenge_(data) {
  var id = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  data.tries = 0;
  CacheService.getScriptCache().put('mfa_' + id, JSON.stringify(data), MFA_CHALLENGE_MIN * 60);
  return id;
}

function verify2fa_(challenge, code) {
  var cache = CacheService.getScriptCache();
  var key = 'mfa_' + String(challenge || '');
  var raw = cache.get(key);
  if (!raw) throw new Error('This sign-in has expired. Please enter your password again.');
  var ch = JSON.parse(raw);
  if (ch.tries >= 5) { cache.remove(key); throw new Error('Too many wrong codes. Please sign in again.'); }
  var u = find_('Users', 'id', ch.userId);
  if (!u || u.active !== 'Y') throw new Error('Account disabled.');
  code = String(code || '').replace(/\s/g, '');
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    if (ch.mode === 'enroll') {
      var st = totpMatch_(ch.secret, code, 0);
      if (st < 0) { ch.tries++; cache.put(key, JSON.stringify(ch), MFA_CHALLENGE_MIN * 60); throw new Error('That code did not match. Check the time on your phone and try the newest code.'); }
      var codes = makeRecoveryCodes_();
      u.totpSecret = ch.secret; u.totpEnabled = 'Y'; u.totpLastStep = st;
      u.recoveryHashes = JSON.stringify(codes.map(function (c) { return hash_(c, 'rc:' + u.id); }));
      update_('Users', u._row, u);
      audit_(u.username, 'enable2fa', '');
      cache.remove(key);
      var out = createSession_(u, true);
      out.recoveryCodes = codes;
      return out;
    }
    var step = totpMatch_(u.totpSecret, code, Number(u.totpLastStep) || 0);
    if (step >= 0) {
      u.totpLastStep = step;
      update_('Users', u._row, u);
      cache.remove(key);
      return createSession_(u, true);
    }
    // recovery code?
    var norm = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (norm.length === 10) {
      var hashes = JSON.parse(u.recoveryHashes || '[]');
      var h = hash_(norm.slice(0, 5) + '-' + norm.slice(5), 'rc:' + u.id);
      var idx = hashes.indexOf(h);
      if (idx >= 0) {
        hashes.splice(idx, 1);
        u.recoveryHashes = JSON.stringify(hashes);
        update_('Users', u._row, u);
        audit_(u.username, 'recoveryCodeUsed', hashes.length + ' left');
        cache.remove(key);
        var res = createSession_(u, true);
        res.recoveryLeft = hashes.length;
        return res;
      }
    }
    ch.tries++;
    cache.put(key, JSON.stringify(ch), MFA_CHALLENGE_MIN * 60);
    throw new Error('Wrong code. Use the newest 6-digit code from your authenticator app.');
  } finally { lock.releaseLock(); }
}

var B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function newTotpSecret_() {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_1, Utilities.getUuid() + Utilities.getUuid() + Date.now() + Math.random());
  var bits = '', out = '';
  bytes.forEach(function (b) { var v = (b < 0 ? b + 256 : b).toString(2); bits += ('00000000' + v).slice(-8); });
  for (var i = 0; i + 5 <= bits.length; i += 5) out += B32[parseInt(bits.substr(i, 5), 2)];
  return out; // 32 chars = 160 bits
}
function base32Bytes_(s) {
  s = String(s).toUpperCase().replace(/[^A-Z2-7]/g, '');
  var bits = '', out = [];
  for (var i = 0; i < s.length; i++) bits += ('00000' + B32.indexOf(s[i]).toString(2)).slice(-5);
  for (var j = 0; j + 8 <= bits.length; j += 8) { var v = parseInt(bits.substr(j, 8), 2); out.push(v > 127 ? v - 256 : v); }
  return out;
}
function totpAt_(secret, step) {
  var msg = [], c = step;
  for (var i = 7; i >= 0; i--) { var b = c % 256; msg[i] = b > 127 ? b - 256 : b; c = Math.floor(c / 256); }
  var h = Utilities.computeHmacSignature(Utilities.MacAlgorithm.HMAC_SHA_1, msg, base32Bytes_(secret)).map(function (b) { return b < 0 ? b + 256 : b; });
  var o = h[19] & 15;
  var bin = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return ('000000' + (bin % 1000000)).slice(-6);
}
/** Returns the matched time step, or -1. Accepts one step of clock drift; rejects replays. */
function totpMatch_(secret, code, lastStep) {
  if (!secret || !/^\d{6}$/.test(code)) return -1;
  var now = Math.floor(Date.now() / 30000);
  for (var d = -1; d <= 1; d++) {
    var st = now + d;
    if (st > lastStep && totpAt_(secret, st) === code) return st;
  }
  return -1;
}
function otpauthUri_(username, secret) {
  var label = encodeURIComponent(TOTP_ISSUER + ':' + username);
  return 'otpauth://totp/' + label + '?secret=' + secret + '&issuer=' + encodeURIComponent(TOTP_ISSUER) + '&algorithm=SHA1&digits=6&period=30';
}
function makeRecoveryCodes_() {
  var a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', out = [];
  for (var i = 0; i < 8; i++) {
    var hex = Utilities.getUuid().replace(/-/g, ''), c = '';
    for (var j = 0; j < 10; j++) c += a[parseInt(hex.substr(j * 3, 3), 16) % a.length];
    out.push(c.slice(0, 5) + '-' + c.slice(5));
  }
  return out;
}

function auth_(token) {
  if (!token) throw new Error('AUTH: Please sign in.');
  var cache = CacheService.getScriptCache();
  var hit = cache.get('sess_' + token), sess;
  if (hit) sess = JSON.parse(hit);
  else {
    var row = find_('Sessions', 'token', token);
    if (row) sess = { userId: row.userId, expires: row.expires, mfa: row.mfa };
  }
  if (!sess || sess.expires < new Date().toISOString()) throw new Error('AUTH: Your session has expired. Please sign in again.');
  var u = find_('Users', 'id', sess.userId);
  if (!u || u.active !== 'Y') throw new Error('AUTH: Account disabled.');
  if (sess.mfa !== 'Y' && (u.totpEnabled === 'Y' || mfaRequired_(u)))
    throw new Error('AUTH: Please sign in again with 2-step verification.');
  u._token = token;
  return u;
}

function audit_(user, action, detail) {
  append_('Audit', [{ ts: new Date().toISOString(), user: user, action: action, detail: detail }]);
}

// =============================================================================
//  Handlers
// =============================================================================
var HANDLERS = {};

HANDLERS.logout = function (p, u) {
  CacheService.getScriptCache().remove('sess_' + u._token);
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try { deleteWhere_('Sessions', function (s) { return s.token === u._token; }); } finally { lock.releaseLock(); }
  return { ok: true };
};

HANDLERS.changePassword = function (p, u) {
  if (hash_(p.current || '', u.salt) !== u.passHash) throw new Error('Current password is wrong.');
  validatePassword_(p.next);
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    u.salt = Utilities.getUuid();
    u.passHash = hash_(p.next, u.salt);
    u.mustChange = 'N';
    update_('Users', u._row, u);
    audit_(u.username, 'changePassword', '');
  } finally { lock.releaseLock(); }
  return { user: publicUser_(u) };
};

function validatePassword_(pw) {
  if (!pw || String(pw).length < 8) throw new Error('Password must be at least 8 characters.');
  if (!/[0-9]/.test(pw) || !/[A-Za-z]/.test(pw)) throw new Error('Password needs letters and at least one number.');
}

HANDLERS.bootstrap = function (p, u) {
  var can = function (mods) { return mods.some(function (m) { return hasModule_(u, m); }); };
  var out = { user: publicUser_(u), settings: settings_(), modules: MODULES, roles: ROLES, serverTime: new Date().toISOString() };
  if (u.mustChange === 'Y') return out;
  var salesData = ['sales', 'dashboard', 'trends', 'forecast', 'hygiene', 'accounting'];
  if (can(salesData)) {
    out.invoices = strip_(read_('Invoices'));
    out.invoiceLines = strip_(read_('InvoiceLines'));
    out.receipts = strip_(read_('Receipts'));
  }
  if (can(['purchases', 'dashboard', 'trends', 'forecast', 'accounting'])) {
    out.purchases = strip_(read_('Purchases'));
    out.expenses = strip_(read_('Expenses'));
  }
  if (can(['customers', 'sales', 'hygiene', 'dashboard', 'trends'])) out.customers = strip_(read_('Customers'));
  if (can(['products', 'sales', 'purchases', 'trends', 'forecast', 'hygiene', 'dashboard'])) out.products = strip_(read_('Products'));
  if (can(['suppliers', 'purchases', 'hygiene'])) out.suppliers = strip_(read_('Suppliers'));
  if (can(['accounting', 'dashboard'])) {
    out.accounts = strip_(read_('Accounts'));
    out.journal = strip_(read_('Journal'));
  }
  return out;
};

// ---- master data -------------------------------------------------------------
function req_(v, label) { if (v === undefined || v === null || String(v).trim() === '') throw new Error(label + ' is required.'); return String(v).trim(); }

HANDLERS.saveCustomer = function (p, u) {
  var name = req_(p.name, 'Customer name');
  var existing = p.id ? find_('Customers', 'id', p.id) : null;
  var dup = read_('Customers').filter(function (c) { return c.name.toLowerCase() === name.toLowerCase() && c.id !== p.id; });
  if (dup.length) throw new Error('A customer called "' + name + '" already exists.');
  var rec = {
    id: existing ? existing.id : nextCustomerId_(), name: name, contact: p.contact || '', phone: p.phone || '',
    email: p.email || '', address: p.address || '', type: p.type || 'Retail',
    vatStatus: p.vatStatus === 'VAT' ? 'VAT' : 'Non-VAT', tin: p.tin || '', openingBalance: Number(p.openingBalance) || 0,
    notes: p.notes || '', createdAt: existing ? existing.createdAt : new Date().toISOString(), isDemo: existing ? existing.isDemo : ''
  };
  if (existing) update_('Customers', existing._row, rec); else append_('Customers', [rec]);
  audit_(u.username, existing ? 'updateCustomer' : 'createCustomer', rec.id + ' ' + rec.name);
  return { customer: strip_([rec])[0] };
};
function nextCustomerId_() {
  var n = parseInt(settings_().custNext || '1', 10);
  var ids = read_('Customers').map(function (c) { return c.id; });
  var id;
  do { id = 'CUST-' + ('000' + n).slice(-3); n++; } while (ids.indexOf(id) >= 0);
  setSetting_('custNext', n);
  return id;
}
HANDLERS.deleteCustomer = function (p, u) {
  var c = find_('Customers', 'id', p.id);
  if (!c) throw new Error('Customer not found.');
  if (read_('Invoices').some(function (i) { return i.customerName === c.name; }))
    throw new Error('This customer has invoices and cannot be deleted.');
  deleteWhere_('Customers', function (r) { return r.id === p.id; });
  audit_(u.username, 'deleteCustomer', c.id + ' ' + c.name);
  return { ok: true };
};

HANDLERS.saveSupplier = function (p, u) {
  var name = req_(p.name, 'Supplier name');
  var existing = p.id ? find_('Suppliers', 'id', p.id) : null;
  var id = existing ? existing.id : 'SUP-' + ('0' + (read_('Suppliers').length + 1)).slice(-2);
  while (!existing && find_('Suppliers', 'id', id)) id = 'SUP-' + Math.floor(Math.random() * 900 + 100);
  var rec = { id: id, name: name.toUpperCase(), products: p.products || '', contact: p.contact || '', phone: p.phone || '',
              email: p.email || '', address: p.address || '', terms: p.terms || '', notes: p.notes || '', isDemo: '' };
  if (existing) update_('Suppliers', existing._row, rec); else append_('Suppliers', [rec]);
  audit_(u.username, existing ? 'updateSupplier' : 'createSupplier', rec.id + ' ' + rec.name);
  return { supplier: rec };
};
HANDLERS.deleteSupplier = function (p, u) {
  var s = find_('Suppliers', 'id', p.id);
  if (!s) throw new Error('Supplier not found.');
  if (read_('Purchases').some(function (x) { return x.supplier === s.name; })) throw new Error('This supplier has purchases and cannot be deleted.');
  deleteWhere_('Suppliers', function (r) { return r.id === p.id; });
  audit_(u.username, 'deleteSupplier', s.id);
  return { ok: true };
};

HANDLERS.saveProduct = function (p, u) {
  var code = req_(p.code, 'Product code').toUpperCase();
  var existing = find_('Products', 'code', p.originalCode || code);
  if (!existing && find_('Products', 'code', code)) throw new Error('Product code already exists.');
  var rec = { code: code, category: p.category || '', name: req_(p.name, 'Product name'), unit: p.unit || '',
              supplier: p.supplier || '', cost: Number(p.cost) || 0, price: Number(req_(p.price, 'Selling price')) || 0,
              vat: p.vat === 'N' ? 'N' : 'Y', reorderLevel: Number(p.reorderLevel) || 0, active: p.active === 'N' ? 'N' : 'Y',
              notes: p.notes || '' };
  if (existing) update_('Products', existing._row, rec); else append_('Products', [rec]);
  audit_(u.username, existing ? 'updateProduct' : 'createProduct', code);
  return { product: rec };
};
HANDLERS.deleteProduct = function (p, u) {
  if (read_('InvoiceLines').some(function (l) { return l.productCode === p.code; }))
    throw new Error('This product has sales history — set it to inactive instead.');
  deleteWhere_('Products', function (r) { return r.code === p.code; });
  audit_(u.username, 'deleteProduct', p.code);
  return { ok: true };
};

// ---- journal ----------------------------------------------------------------
function acctName_(code) { var a = find_('Accounts', 'code', code); return a ? a.name : code; }

function postLines_(date, ref, lines, description, source, user, isDemo) {
  var dr = 0, cr = 0;
  lines.forEach(function (l) { dr += Number(l.debit) || 0; cr += Number(l.credit) || 0; });
  if (Math.abs(dr - cr) > 0.005) throw new Error('Journal does not balance (Dr ' + dr.toFixed(2) + ' vs Cr ' + cr.toFixed(2) + ').');
  var entryNo = parseInt(settings_().jeNext || '1', 10);
  append_('Journal', lines.filter(function (l) { return (Number(l.debit) || 0) > 0 || (Number(l.credit) || 0) > 0; }).map(function (l) {
    return { entryNo: entryNo, date: date, ref: ref, acct: l.acct, acctName: acctName_(l.acct),
             debit: Number(l.debit) || 0, credit: Number(l.credit) || 0, description: l.description || description,
             source: source, createdBy: user, isDemo: isDemo ? 'Y' : '' };
  }));
  setSetting_('jeNext', entryNo + 1);
  return entryNo;
}

function round2_(n) { return Math.round((Number(n) || 0) * 100) / 100; }
function today_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'); }
function addDays_(iso, d) { var t = new Date(iso + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + d); return t.toISOString().slice(0, 10); }
function validDate_(d) { d = String(d || '').slice(0, 10); if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return today_(); return d; }

// ---- invoices ------------------------------------------------------------------
function recordInvoiceCore_(p, username, isDemo, forcedNo) {
  var cust = find_('Customers', 'id', p.customerId) || find_('Customers', 'name', p.customerName);
  if (!cust) throw new Error('Please choose a customer.');
  var lines = (p.lines || []).filter(function (l) { return l && l.productCode && Number(l.qty) > 0; });
  if (!lines.length) throw new Error('Add at least one product line with a quantity.');
  var s = settings_();
  var vatRate = Number(s.vatRate) || 0;
  var date = validDate_(p.date);
  var built = lines.map(function (l) {
    var prod = find_('Products', 'code', l.productCode);
    if (!prod) throw new Error('Unknown product ' + l.productCode);
    var price = l.unitPrice !== undefined && l.unitPrice !== '' ? Number(l.unitPrice) : prod.price;
    var qty = Number(l.qty);
    return { productCode: prod.code, productName: prod.name, unit: prod.unit, qty: qty, unitPrice: round2_(price),
             lineTotal: round2_(qty * price), unitCost: prod.cost, vatable: prod.vat !== 'N' };
  });
  var subtotal = round2_(built.reduce(function (a, l) { return a + l.lineTotal; }, 0));
  var applyVat = p.vatApplied === 'Y';
  var vatBase = built.reduce(function (a, l) { return a + (l.vatable ? l.lineTotal : 0); }, 0);
  var vat = applyVat ? round2_(vatBase * vatRate) : 0;
  var total = round2_(subtotal + vat);
  var paid = Math.min(round2_(p.paidAtInvoice), total);
  if (paid < 0) paid = 0;
  var method = p.payMethod && PAY_ACCOUNTS[p.payMethod] && p.payMethod !== 'Credit' ? p.payMethod : 'Cash';
  var invNo = forcedNo || nextNo_('invPrefix', 'invYear', 'invNext');
  var inv = {
    invoiceNo: invNo, date: date, customerId: cust.id, customerName: cust.name, vatApplied: applyVat ? 'Y' : 'N',
    subtotal: subtotal, vat: vat, total: total, paidAtInvoice: paid, payMethod: paid > 0 ? method : '',
    dueDate: validDate_(p.dueDate || addDays_(date, parseInt(s.paymentTermsDays || '14', 10))),
    nextStep: p.nextStep || '', status: 'ACTIVE', notes: p.notes || '', createdBy: username,
    createdAt: new Date().toISOString(), isDemo: isDemo ? 'Y' : ''
  };
  append_('Invoices', [inv]);
  append_('InvoiceLines', built.map(function (l) {
    return { invoiceNo: invNo, date: date, customerName: cust.name, productCode: l.productCode, productName: l.productName,
             unit: l.unit, qty: l.qty, unitPrice: l.unitPrice, lineTotal: l.lineTotal, unitCost: l.unitCost, isDemo: inv.isDemo };
  }));
  var desc = 'Invoice ' + invNo + ' - ' + cust.name;
  var jl = [{ acct: '1100', debit: total }, { acct: '4000', credit: subtotal }];
  if (vat > 0) jl.push({ acct: '2100', credit: vat });
  if (paid > 0) {
    jl.push({ acct: PAY_ACCOUNTS[method], debit: paid, description: desc + ' (paid at invoicing)' });
    jl.push({ acct: '1100', credit: paid, description: desc + ' (paid at invoicing)' });
  }
  postLines_(date, invNo, jl, desc, 'Invoice', username, isDemo);
  return inv;
}

HANDLERS.recordInvoice = function (p, u) {
  var inv = recordInvoiceCore_(p, u.username, false);
  audit_(u.username, 'recordInvoice', inv.invoiceNo + ' GHS ' + inv.total);
  return { invoice: inv, lines: strip_(read_('InvoiceLines').filter(function (l) { return l.invoiceNo === inv.invoiceNo; })) };
};

HANDLERS.updateInvoiceNextStep = function (p, u) {
  var inv = find_('Invoices', 'invoiceNo', p.invoiceNo);
  if (!inv) throw new Error('Invoice not found.');
  inv.nextStep = p.nextStep || '';
  if (p.dueDate) inv.dueDate = validDate_(p.dueDate);
  update_('Invoices', inv._row, inv);
  audit_(u.username, 'updateInvoiceNextStep', inv.invoiceNo);
  return { invoice: strip_([inv])[0] };
};

HANDLERS.voidInvoice = function (p, u) {
  if (u.role !== 'admin' && u.role !== 'manager') throw new Error('Only an admin or manager can void invoices.');
  var inv = find_('Invoices', 'invoiceNo', p.invoiceNo);
  if (!inv) throw new Error('Invoice not found.');
  if (inv.status === 'VOID') throw new Error('Already void.');
  if (read_('Receipts').some(function (r) { return r.invoiceNo === inv.invoiceNo && r.status !== 'VOID'; }))
    throw new Error('Void the receipts against this invoice first.');
  var lines = read_('Journal').filter(function (j) { return j.ref === inv.invoiceNo && j.source === 'Invoice'; });
  postLines_(today_(), inv.invoiceNo, lines.map(function (j) { return { acct: j.acct, debit: j.credit, credit: j.debit }; }),
             'VOID of ' + inv.invoiceNo + (p.reason ? ' — ' + p.reason : ''), 'Void', u.username, inv.isDemo === 'Y');
  inv.status = 'VOID';
  inv.notes = (inv.notes ? inv.notes + ' | ' : '') + 'VOID: ' + (p.reason || '');
  update_('Invoices', inv._row, inv);
  audit_(u.username, 'voidInvoice', inv.invoiceNo + ' ' + (p.reason || ''));
  return { invoice: strip_([inv])[0] };
};

function outstanding_(invNo) {
  var inv = find_('Invoices', 'invoiceNo', invNo);
  if (!inv) return 0;
  var rec = read_('Receipts').filter(function (r) { return r.invoiceNo === invNo && r.status !== 'VOID'; })
    .reduce(function (a, r) { return a + r.amount; }, 0);
  return round2_(inv.total - inv.paidAtInvoice - rec);
}

// ---- receipts ------------------------------------------------------------------
function recordReceiptCore_(p, username, isDemo, forcedNo) {
  var inv = find_('Invoices', 'invoiceNo', p.invoiceNo);
  if (!inv) throw new Error('Choose the invoice this payment is for.');
  if (inv.status === 'VOID') throw new Error('That invoice is void.');
  var amt = round2_(p.amount);
  if (!(amt > 0)) throw new Error('Enter the amount received.');
  var out = outstanding_(inv.invoiceNo);
  if (amt > out + 0.005) throw new Error('Amount is more than the GHS ' + out.toFixed(2) + ' outstanding on ' + inv.invoiceNo + '.');
  var method = PAY_ACCOUNTS[p.method] && p.method !== 'Credit' ? p.method : 'Cash';
  var date = validDate_(p.date);
  var no = forcedNo || nextNo_('rctPrefix', 'rctYear', 'rctNext');
  var r = { receiptNo: no, date: date, customerName: inv.customerName, invoiceNo: inv.invoiceNo, amount: amt, method: method,
            receivedBy: p.receivedBy || '', notes: p.notes || '', status: 'ACTIVE', createdBy: username,
            createdAt: new Date().toISOString(), isDemo: isDemo ? 'Y' : '' };
  append_('Receipts', [r]);
  postLines_(date, no, [{ acct: PAY_ACCOUNTS[method], debit: amt }, { acct: '1100', credit: amt }],
             'Receipt ' + no + ' - ' + inv.customerName + ' (for ' + inv.invoiceNo + ')', 'Receipt', username, isDemo);
  return r;
}
HANDLERS.recordReceipt = function (p, u) {
  var r = recordReceiptCore_(p, u.username, false);
  audit_(u.username, 'recordReceipt', r.receiptNo + ' GHS ' + r.amount);
  return { receipt: r };
};
HANDLERS.voidReceipt = function (p, u) {
  if (u.role !== 'admin' && u.role !== 'manager') throw new Error('Only an admin or manager can void receipts.');
  var r = find_('Receipts', 'receiptNo', p.receiptNo);
  if (!r || r.status === 'VOID') throw new Error('Receipt not found or already void.');
  postLines_(today_(), r.receiptNo, [{ acct: '1100', debit: r.amount }, { acct: PAY_ACCOUNTS[r.method] || '1000', credit: r.amount }],
             'VOID of ' + r.receiptNo, 'Void', u.username, r.isDemo === 'Y');
  r.status = 'VOID';
  update_('Receipts', r._row, r);
  audit_(u.username, 'voidReceipt', r.receiptNo);
  return { receipt: strip_([r])[0] };
};

// ---- purchases & expenses --------------------------------------------------------
function recordPurchaseCore_(p, username, isDemo, forcedNo) {
  var supplier = req_(p.supplier, 'Supplier');
  var prod = p.productCode ? find_('Products', 'code', p.productCode) : null;
  var qty = Number(p.qty) || 0, unitCost = Number(p.unitCost) || 0;
  if (!(qty > 0) || !(unitCost > 0)) throw new Error('Enter quantity and unit cost.');
  var method = PAY_ACCOUNTS[p.method] ? p.method : 'Cash';
  var date = validDate_(p.date);
  var no = forcedNo || nextNo_('purPrefix', null, 'purNext');
  var rec = { purchaseNo: no, date: date, supplier: supplier, productCode: prod ? prod.code : '',
              productName: prod ? prod.name : (p.productName || ''), qty: qty, unitCost: unitCost,
              total: round2_(qty * unitCost), method: method, notes: p.notes || '', createdBy: username,
              createdAt: new Date().toISOString(), isDemo: isDemo ? 'Y' : '' };
  append_('Purchases', [rec]);
  postLines_(date, no, [{ acct: '5100', debit: rec.total }, { acct: PAY_ACCOUNTS[method], credit: rec.total }],
             'Purchase ' + no + ' - ' + supplier + ' - ' + rec.productName, 'Purchase', username, isDemo);
  if (prod && p.updateCost && !isDemo) { prod.cost = unitCost; update_('Products', prod._row, prod); }
  return rec;
}
HANDLERS.recordPurchase = function (p, u) {
  var r = recordPurchaseCore_(p, u.username, false);
  audit_(u.username, 'recordPurchase', r.purchaseNo + ' GHS ' + r.total);
  return { purchase: r };
};

function recordExpenseCore_(p, username, isDemo) {
  var amt = round2_(p.amount);
  if (!(amt > 0)) throw new Error('Enter the amount.');
  var method = PAY_ACCOUNTS[p.method] && p.method !== 'Credit' ? p.method : 'Cash';
  var date = validDate_(p.date);
  var no = nextNo_('expPrefix', null, 'expNext');
  var rec = { expenseNo: no, date: date, category: p.category || 'General', description: p.description || '', amount: amt,
              method: method, createdBy: username, createdAt: new Date().toISOString(), isDemo: isDemo ? 'Y' : '' };
  append_('Expenses', [rec]);
  postLines_(date, no, [{ acct: '6000', debit: amt }, { acct: PAY_ACCOUNTS[method], credit: amt }],
             'Expense ' + no + ' - ' + rec.category + ': ' + rec.description, 'Expense', username, isDemo);
  return rec;
}
HANDLERS.recordExpense = function (p, u) {
  var r = recordExpenseCore_(p, u.username, false);
  audit_(u.username, 'recordExpense', r.expenseNo + ' GHS ' + r.amount);
  return { expense: r };
};

// ---- accounting ----------------------------------------------------------------
HANDLERS.postJournal = function (p, u) {
  var lines = (p.lines || []).map(function (l) {
    if (!find_('Accounts', 'code', l.acct)) throw new Error('Unknown account ' + l.acct);
    return { acct: String(l.acct), debit: round2_(l.debit), credit: round2_(l.credit), description: l.description || '' };
  });
  if (lines.length < 2) throw new Error('A journal needs at least two lines.');
  var entryNo = postLines_(validDate_(p.date), p.ref || 'MANUAL', lines, req_(p.description, 'Description'), 'Manual', u.username, false);
  audit_(u.username, 'postJournal', 'JE ' + entryNo);
  return { entryNo: entryNo };
};
HANDLERS.saveAccount = function (p, u) {
  var code = req_(p.code, 'Account code');
  var existing = find_('Accounts', 'code', code);
  var rec = { code: code, name: req_(p.name, 'Account name'), type: p.type || 'Expense',
              normal: p.normal || (['Asset', 'Expense'].indexOf(p.type) >= 0 ? 'Debit' : 'Credit'), notes: p.notes || '' };
  if (existing) update_('Accounts', existing._row, rec); else append_('Accounts', [rec]);
  audit_(u.username, 'saveAccount', code);
  return { account: rec };
};

// ---- admin ------------------------------------------------------------------------
var SETTING_KEYS = ['companyName', 'address', 'email', 'phone', 'momo', 'bankName', 'bankAccount', 'currency', 'vatRate',
  'defaultVatStatus', 'invPrefix', 'invYear', 'invNext', 'rctPrefix', 'rctYear', 'rctNext', 'purPrefix', 'purNext',
  'expPrefix', 'expNext', 'paymentTermsDays', 'twoFactorPolicy', 'emailFrom', 'emailReplyTo', 'emailSenderName'];
HANDLERS.saveSettings = function (p, u) {
  SETTING_KEYS.forEach(function (k) { if (p[k] !== undefined) setSetting_(k, p[k]); });
  audit_(u.username, 'saveSettings', '');
  return { settings: settings_() };
};
HANDLERS.listUsers = function (p, u) {
  return { users: read_('Users').map(publicUser_) };
};
HANDLERS.saveUser = function (p, u) {
  var username = req_(p.username, 'Username').toLowerCase();
  if (!/^[a-z0-9._-]{3,30}$/.test(username)) throw new Error('Username: 3-30 letters, numbers, dot, dash or underscore.');
  var role = ROLES.indexOf(p.role) >= 0 ? p.role : 'staff';
  var modules = (p.modules || []).filter(function (m) { return MODULES.indexOf(m) >= 0 && m !== 'admin'; });
  var existing = p.id ? find_('Users', 'id', p.id) : null;
  var clash = find_('Users', 'username', username);
  if (clash && (!existing || clash.id !== existing.id)) throw new Error('That username is taken.');
  if (existing && existing.id === u.id && (role !== 'admin' || p.active === 'N')) throw new Error("You can't remove your own admin access.");
  var rec;
  if (existing) {
    rec = existing;
    rec.username = username; rec.name = p.name || username; rec.email = p.email || ''; rec.role = role;
    rec.modules = modules.join(','); rec.active = p.active === 'N' ? 'N' : 'Y';
    update_('Users', rec._row, rec);
  } else {
    validatePassword_(p.password);
    var salt = Utilities.getUuid();
    rec = { id: 'U-' + Utilities.getUuid().slice(0, 8), username: username, name: p.name || username, email: p.email || '',
            role: role, modules: modules.join(','), passHash: hash_(p.password, salt), salt: salt,
            active: p.active === 'N' ? 'N' : 'Y', mustChange: 'Y', createdAt: new Date().toISOString(), lastLogin: '' };
    append_('Users', [rec]);
  }
  if (rec.active === 'N') revokeSessions_(rec.id);
  audit_(u.username, existing ? 'updateUser' : 'createUser', username + ' role=' + role + ' modules=' + rec.modules);
  return { user: publicUser_(rec) };
};
HANDLERS.resetPassword = function (p, u) {
  var rec = find_('Users', 'id', p.id);
  if (!rec) throw new Error('User not found.');
  validatePassword_(p.password);
  rec.salt = Utilities.getUuid(); rec.passHash = hash_(p.password, rec.salt); rec.mustChange = 'Y';
  update_('Users', rec._row, rec);
  revokeSessions_(rec.id);
  audit_(u.username, 'resetPassword', rec.username);
  return { ok: true };
};
HANDLERS.deleteUser = function (p, u) {
  if (p.id === u.id) throw new Error("You can't delete yourself.");
  var rec = find_('Users', 'id', p.id);
  if (!rec) throw new Error('User not found.');
  revokeSessions_(rec.id);
  deleteWhere_('Users', function (r) { return r.id === p.id; });
  audit_(u.username, 'deleteUser', rec.username);
  return { ok: true };
};
function revokeSessions_(userId) {
  var cache = CacheService.getScriptCache();
  read_('Sessions').filter(function (s) { return s.userId === userId; }).forEach(function (s) { cache.remove('sess_' + s.token); });
  deleteWhere_('Sessions', function (s) { return s.userId === userId; });
}
HANDLERS.auditLog = function (p, u) {
  var rows = strip_(read_('Audit'));
  return { audit: rows.slice(-500).reverse() };
};

// ---- demo data (clearly tagged, removable) -----------------------------------------
HANDLERS.loadDemo = function (p, u) {
  if (read_('Invoices').some(function (i) { return i.isDemo === 'Y'; })) throw new Error('Demo data is already loaded.');
  var names = ['DEMO Hallmark Café', 'DEMO Auntie Esi Chop Bar', 'DEMO Lakeside Mart', 'DEMO Kofi Provisions', 'DEMO Spintex Foods'];
  var custs = names.map(function (n, i) {
    var rec = { id: 'DEMO-C' + (i + 1), name: n, contact: i === 3 ? '' : 'Contact ' + (i + 1), phone: i === 4 ? '' : '02440000' + (10 + i),
                email: '', address: 'Accra', type: i < 2 ? 'Restaurant' : 'Retail', vatStatus: i % 2 ? 'VAT' : 'Non-VAT',
                tin: '', openingBalance: 0, notes: 'Demo record', createdAt: new Date().toISOString(), isDemo: 'Y' };
    return rec;
  });
  append_('Customers', custs);
  var prods = read_('Products').filter(function (x) { return x.active === 'Y'; });
  var seed = 7; function rnd() { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }
  var today = new Date(); var start = new Date(today.getFullYear(), today.getMonth() - 6, 1);
  var n = 0, rn = 0, pn = 0;
  for (var d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
    var iso = Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    var monthIdx = (d.getFullYear() - start.getFullYear()) * 12 + d.getMonth() - start.getMonth();
    var perDay = rnd() < 0.35 + monthIdx * 0.05 ? 1 : 0;
    for (var k = 0; k < perDay; k++) {
      var c = custs[Math.floor(rnd() * custs.length)];
      var lc = 1 + Math.floor(rnd() * 3), lines = [];
      for (var li = 0; li < lc; li++) {
        var pr = prods[Math.floor(rnd() * prods.length)];
        lines.push({ productCode: pr.code, qty: 1 + Math.floor(rnd() * (pr.code === 'EGG-CRT' ? 12 : 5)) });
      }
      n++;
      var ageDays = (today - d) / 86400000;
      var paidNow = rnd() < 0.4;
      var inv = recordInvoiceCore_({ customerId: c.id, date: iso, lines: lines, vatApplied: c.vatStatus === 'VAT' ? 'Y' : 'N',
        paidAtInvoice: 0, nextStep: rnd() < 0.5 ? 'Call ' + c.contact + ' re payment' : '' }, u.username, true, 'DEMO-INV-' + (1000 + n));
      if (paidNow || ageDays > 45 || (ageDays > 10 && rnd() < 0.6)) {
        var amt = rnd() < 0.85 ? inv.total : round2_(inv.total / 2);
        rn++;
        recordReceiptCore_({ invoiceNo: inv.invoiceNo, date: addDays_(iso, paidNow ? 0 : Math.floor(rnd() * 10) + 1 > ageDays ? 0 : Math.floor(rnd() * 10) + 1),
          amount: amt, method: ['Cash', 'MoMo', 'Bank Transfer'][Math.floor(rnd() * 3)], receivedBy: 'Demo' }, u.username, true, 'DEMO-RCT-' + (2000 + rn));
      }
    }
    if (d.getDay() === 1) {
      pn++;
      recordPurchaseCore_({ supplier: 'DANLECT', productCode: 'PO-25L', qty: 2 + Math.floor(rnd() * 3), unitCost: 495, method: 'Cash', date: iso }, u.username, true, 'DEMO-PUR-' + (5000 + pn));
      pn++;
      recordPurchaseCore_({ supplier: 'THEODORA FARMS', productCode: 'EGG-CRT', qty: 10 + Math.floor(rnd() * 10), unitCost: 45, method: rnd() < 0.3 ? 'Credit' : 'MoMo', date: iso }, u.username, true, 'DEMO-PUR-' + (5000 + pn));
    }
    if (d.getDate() === 28) recordExpenseCore_({ category: 'Transport', description: 'Deliveries (demo)', amount: 300 + Math.floor(rnd() * 200), method: 'Cash', date: iso }, u.username, true);
  }
  audit_(u.username, 'loadDemo', n + ' invoices');
  return { invoices: n, receipts: rn, purchases: pn };
};
HANDLERS.clearDemo = function (p, u) {
  var total = 0;
  ['InvoiceLines', 'Invoices', 'Receipts', 'Purchases', 'Expenses', 'Journal', 'Customers'].forEach(function (t) {
    total += bulkDeleteDemo_(t);
  });
  audit_(u.username, 'clearDemo', total + ' rows');
  return { removed: total };
};
function bulkDeleteDemo_(name) {
  var sh = sheet_(name), hdr = header_(name);
  var rows = read_(name);
  var keep = rows.filter(function (r) { return r.isDemo !== 'Y'; });
  if (keep.length === rows.length) return 0;
  var last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, hdr.length).clearContent();
  if (keep.length) sh.getRange(2, 1, keep.length, hdr.length).setValues(keep.map(function (o) { return toRow_(name, o, hdr); }));
  delete _cache[name];
  return rows.length - keep.length;
}

// =============================================================================
//  2-step verification admin / self-service
// =============================================================================
HANDLERS.reset2fa = function (p, u) {
  var rec = find_('Users', 'id', p.id);
  if (!rec) throw new Error('User not found.');
  rec.totpSecret = ''; rec.totpEnabled = ''; rec.totpLastStep = 0; rec.recoveryHashes = '';
  update_('Users', rec._row, rec);
  revokeSessions_(rec.id);
  audit_(u.username, 'reset2fa', rec.username);
  return { ok: true };
};

HANDLERS.regenerateRecovery = function (p, u) {
  if (u.totpEnabled !== 'Y') throw new Error('2-step verification is not set up on this account.');
  if (totpMatch_(u.totpSecret, String(p.code || '').replace(/\s/g, ''), Number(u.totpLastStep) || 0) < 0)
    throw new Error('Wrong code. Use the newest 6-digit code from your authenticator app.');
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var codes = makeRecoveryCodes_();
    u.totpLastStep = Math.floor(Date.now() / 30000);
    u.recoveryHashes = JSON.stringify(codes.map(function (c) { return hash_(c, 'rc:' + u.id); }));
    update_('Users', u._row, u);
    audit_(u.username, 'regenerateRecovery', '');
    return { recoveryCodes: codes };
  } finally { lock.releaseLock(); }
};

// =============================================================================
//  Email invoices / receipts (Gmail API, gmail.send scope only)
// =============================================================================
function validEmails_(list, label) {
  var arr = String(list || '').split(/[,;\s]+/).filter(function (x) { return x; });
  arr.forEach(function (e) { if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw new Error(label + ': "' + e + '" is not a valid email address.'); });
  return arr;
}
function mimeWord_(s) { return '=?UTF-8?B?' + Utilities.base64Encode(s, Utilities.Charset.UTF_8) + '?='; }
function wrap76_(b64) { return b64.replace(/(.{76})/g, '$1\r\n'); }
function escHtml_(s) { return String(s || '').replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

function sendGmail_(o) {
  var boundary = 'myka_' + Utilities.getUuid().replace(/-/g, '');
  var alt = 'alt_' + Utilities.getUuid().replace(/-/g, '');
  var headers = [
    'From: ' + mimeWord_(o.fromName) + ' <' + o.from + '>',
    'To: ' + o.to.join(', ')
  ];
  if (o.cc.length) headers.push('Cc: ' + o.cc.join(', '));
  if (o.replyTo) headers.push('Reply-To: ' + o.replyTo);
  headers.push('Subject: ' + mimeWord_(o.subject), 'MIME-Version: 1.0', 'Content-Type: multipart/mixed; boundary="' + boundary + '"');
  var body = headers.join('\r\n') + '\r\n\r\n' +
    '--' + boundary + '\r\nContent-Type: multipart/alternative; boundary="' + alt + '"\r\n\r\n' +
    '--' + alt + '\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n' + wrap76_(Utilities.base64Encode(o.text, Utilities.Charset.UTF_8)) + '\r\n' +
    '--' + alt + '\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n' + wrap76_(Utilities.base64Encode(o.html, Utilities.Charset.UTF_8)) + '\r\n' +
    '--' + alt + '--\r\n' +
    '--' + boundary + '\r\nContent-Type: application/pdf; name="' + o.filename + '"\r\nContent-Disposition: attachment; filename="' + o.filename + '"\r\nContent-Transfer-Encoding: base64\r\n\r\n' + wrap76_(o.pdfBase64) + '\r\n' +
    '--' + boundary + '--';
  var raw = Utilities.base64EncodeWebSafe(body, Utilities.Charset.UTF_8).replace(/=+$/, '');
  var r = UrlFetchApp.fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    payload: JSON.stringify({ raw: raw })
  });
  if (r.getResponseCode() >= 300) throw new Error('Gmail could not send the email (' + r.getResponseCode() + '): ' + r.getContentText().slice(0, 200));
  return JSON.parse(r.getContentText()).id;
}

HANDLERS.emailDocument = function (p, u) {
  var s = settings_();
  var kind = p.kind === 'receipt' ? 'receipt' : 'invoice';
  var doc = kind === 'invoice' ? find_('Invoices', 'invoiceNo', p.no) : find_('Receipts', 'receiptNo', p.no);
  if (!doc) throw new Error('Document not found.');
  var to = validEmails_(p.to, 'To');
  if (!to.length) throw new Error('Enter at least one recipient email.');
  var cc = validEmails_(p.cc, 'CC');
  if (to.length + cc.length > 10) throw new Error('Up to 10 recipients per email.');
  var pdf = String(p.pdfBase64 || '').replace(/^data:[^,]*,/, '').replace(/\s/g, '');
  if (!/^[A-Za-z0-9+/]+=*$/.test(pdf) || pdf.length < 100) throw new Error('The PDF attachment is missing.');
  if (pdf.length * 0.75 > MAX_EMAIL_BYTES) throw new Error('The PDF is too large to email.');
  var no = kind === 'invoice' ? doc.invoiceNo : doc.receiptNo;
  var subject = String(p.subject || '').trim() || ((kind === 'invoice' ? 'Invoice ' : 'Receipt ') + no + ' from ' + s.companyName);
  var msg = String(p.message || '').trim();
  var cur = s.currency || 'GHS';
  var money = function (n) { return cur + ' ' + Number(n || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','); };
  var facts = kind === 'invoice'
    ? [['Invoice', no], ['Date', doc.date], ['Amount', money(doc.total)], ['Due date', doc.dueDate]]
    : [['Receipt', no], ['Date', doc.date], ['Amount received', money(doc.amount)], ['For invoice', doc.invoiceNo]];
  var pay = 'MoMo ' + s.momo + ' · ' + s.bankName + ' ' + s.bankAccount;
  var text = (msg ? msg + '\n\n' : '') + facts.map(function (f) { return f[0] + ': ' + f[1]; }).join('\n') +
    (kind === 'invoice' ? '\n\nPayment: ' + pay + '\nPlease quote ' + no + ' as the reference.' : '\n\nThank you for your payment.') +
    '\n\nThe ' + kind + ' is attached as a PDF.\n\n' + s.companyName + '\n' + s.address + '\n' + s.phone + ' · ' + s.email;
  var html = '<div style="font-family:Arial,sans-serif;font-size:14px;color:#1a1a1a;max-width:560px">' +
    (msg ? '<p>' + escHtml_(msg).replace(/\n/g, '<br>') + '</p>' : '') +
    '<table style="border-collapse:collapse;margin:12px 0">' + facts.map(function (f) {
      return '<tr><td style="padding:4px 16px 4px 0;color:#666">' + escHtml_(f[0]) + '</td><td style="padding:4px 0;font-weight:bold">' + escHtml_(f[1]) + '</td></tr>';
    }).join('') + '</table>' +
    (kind === 'invoice' ? '<p style="background:#f3f7f1;border-left:3px solid #0b5d0b;padding:8px 12px">Payment: ' + escHtml_(pay) + '<br>Please quote <b>' + escHtml_(no) + '</b> as the reference.</p>' : '<p>Thank you for your payment.</p>') +
    '<p>The ' + kind + ' is attached as a PDF.</p>' +
    '<p style="color:#666;font-size:12px;border-top:1px solid #ddd;padding-top:8px">' + escHtml_(s.companyName) + '<br>' + escHtml_(s.address) + '<br>' + escHtml_(s.phone) + ' · ' + escHtml_(s.email) + '</p></div>';
  var id = sendGmail_({ from: s.emailFrom || s.email, fromName: s.emailSenderName || s.companyName, replyTo: s.emailReplyTo || '',
    to: to, cc: cc, subject: subject, text: text, html: html, pdfBase64: pdf, filename: no + '.pdf' });
  doc.emailedAt = new Date().toISOString();
  doc.emailedTo = to.concat(cc).join(', ');
  update_(kind === 'invoice' ? 'Invoices' : 'Receipts', doc._row, doc);
  audit_(u.username, 'emailDocument', no + ' → ' + doc.emailedTo);
  return { ok: true, id: id, emailedAt: doc.emailedAt, emailedTo: doc.emailedTo };
};

/** Run once from the editor after adding the Gmail permission, to approve it. */
function authorizeEmail() {
  Logger.log('Token ok: ' + !!ScriptApp.getOAuthToken() + ' — email sending is authorised.');
}
