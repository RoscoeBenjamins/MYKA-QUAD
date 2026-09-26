// Runs Code.gs inside Node with in-memory fakes of the Apps Script services.
// Used for local end-to-end testing only.
const fs = require('fs');
const vm = require('vm');
const crypto = require('crypto');
const path = require('path');

function makeSheet(name) {
  const data = []; // array of rows (arrays)
  const sh = {
    name, data,
    getName: () => name,
    getLastRow: () => { let l = data.length; while (l > 0 && data[l - 1].every(v => v === '' || v == null)) l--; return l; },
    getLastColumn: () => data.reduce((m, r) => { let l = r.length; while (l > 0 && (r[l - 1] === '' || r[l - 1] == null)) l--; return Math.max(m, l); }, 0),
    getMaxRows: () => Math.max(1000, data.length),
    setFrozenRows: () => sh,
    deleteRow: (r) => { data.splice(r - 1, 1); },
    getRange: (row, col, nr = 1, nc = 1) => {
      const rg = {
        getValues: () => { const out = []; for (let r = 0; r < nr; r++) { const rr = []; for (let c = 0; c < nc; c++) { const v = (data[row - 1 + r] || [])[col - 1 + c]; rr.push(v === undefined ? '' : v); } out.push(rr); } return out; },
        setValues: (vals) => { for (let r = 0; r < vals.length; r++) { while (data.length < row + r) data.push([]); for (let c = 0; c < vals[r].length; c++) data[row - 1 + r][col - 1 + c] = vals[r][c]; } return rg; },
        setValue: (v) => rg.setValues([[v]]),
        clearContent: () => { for (let r = 0; r < nr; r++) { const rr = data[row - 1 + r]; if (rr) for (let c = 0; c < nc; c++) rr[col - 1 + c] = ''; } return rg; },
        setFontWeight: () => rg, setNumberFormat: () => rg,
      };
      return rg;
    },
  };
  return sh;
}

function makeContext(extra = {}) {
  const sheets = {};
  const ss = {
    getId: () => 'FAKE_DB',
    getSheetByName: (n) => sheets[n] || null,
    insertSheet: (n) => (sheets[n] = makeSheet(n)),
    getSheets: () => Object.values(sheets),
    deleteSheet: (s) => { delete sheets[s.name]; },
  };
  const cache = new Map();
  const props = new Map();
  const ctx = {
    console,
    SpreadsheetApp: { openById: () => ss, getActiveSpreadsheet: () => ss },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256', SHA_1: 'sha1' }, Charset: { UTF_8: 'utf8' }, MacAlgorithm: { HMAC_SHA_1: 'sha1' },
      computeDigest: (alg, s) => Array.from(crypto.createHash(alg).update(String(s), 'utf8').digest()).map(b => (b > 127 ? b - 256 : b)),
      computeHmacSignature: (alg, value, key) => Array.from(crypto.createHmac(alg, Buffer.from(key.map(b => b & 255))).update(Buffer.from(value.map(b => b & 255))).digest()).map(b => (b > 127 ? b - 256 : b)),
      base64Encode: (s) => Buffer.from(s, 'utf8').toString('base64'),
      base64EncodeWebSafe: (s) => Buffer.from(s, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
      getUuid: () => crypto.randomUUID(),
      formatDate: (d) => { const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return z.toISOString().slice(0, 10); },
    },
    Session: { getScriptTimeZone: () => 'Africa/Accra' },
    LockService: { getScriptLock: () => ({ waitLock() {}, tryLock() { return true }, releaseLock() {} }) },
    Logger: { log() {} },
    CacheService: { getScriptCache: () => ({ get: k => cache.has(k) ? cache.get(k) : null, put: (k, v) => cache.set(k, v), remove: k => cache.delete(k) }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props.has(k) ? props.get(k) : null, setProperty: (k, v) => props.set(k, v) }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (s) => ({ _s: s, setMimeType() { return this; }, getContent() { return this._s; } }) },
  };
  let code = fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8');
  code = code.replace("'__ADMIN_TEMP__'", "'" + (process.env.ADMIN_TEMP || 'TempPass123') + "'");
  Object.assign(ctx, extra);
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  ctx.__sheets = sheets; ctx.__props = props;
  return ctx;
}

module.exports = { makeContext };
