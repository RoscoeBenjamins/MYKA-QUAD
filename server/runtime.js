/**
 * MYKA QUAD — runtime for the Node/Vercel port of the API.
 * ---------------------------------------------------------------------------
 * The business logic in core.js is the same code that ran in Google Apps Script
 * (backend/Code.gs). This file supplies what Apps Script used to provide:
 *   - a per-request "unit of work" over the database tables (read_/append_/update_/deleteWhere_)
 *   - CacheService (login lockouts, 2-step challenges) backed by the "Cache" table
 *   - Utilities / Session / LockService / PropertiesService shims
 * Everything is per request (AsyncLocalStorage), so concurrent requests never share state.
 * A store (store-pg.js in production, store-mem.js in tests) loads the tables at the
 * start of a request and commits the changes at the end, in one transaction.
 */
const crypto = require('crypto');
const { AsyncLocalStorage } = require('async_hooks');

const als = new AsyncLocalStorage();
function cur() {
  const c = als.getStore();
  if (!c) throw new Error('No request context');
  return c;
}

// ---- per-request unit of work ------------------------------------------------
class UnitOfWork {
  constructor(schema, tables, cacheRows) {
    this.schema = schema;
    this.tables = {};         // name -> canonical rows (plain objects with _row)
    this.cache = {};          // read_ copies (same semantics as Code.gs' _cache)
    this.deleted = {};        // name -> Set(real _row ids)
    this.updated = {};        // name -> Set(real _row ids)
    this.dirty = new Set();
    this.tmp = 0;
    Object.keys(schema).forEach((n) => {
      this.tables[n] = (tables[n] || []).map((r) => this.norm_(n, r, r._row));
      this.deleted[n] = new Set();
      this.updated[n] = new Set();
    });
    this.kv = new Map();      // CacheService
    this.kvDirty = new Map(); // key -> {value, expires} | null (delete)
    const now = Date.now();
    (cacheRows || []).forEach((r) => { if (Number(r.expires) > now) this.kv.set(r.key, { value: r.value, expires: Number(r.expires) }); });
  }
  types_(name) { const t = {}; this.schema[name].forEach((c) => { t[c[0]] = c[1]; }); return t; }
  // same conversion Code.gs applied when writing a row (toRow_) and reading it back (cellOut_)
  norm_(name, obj, rowId) {
    const types = this.types_(name);
    const o = {};
    this.schema[name].forEach((c) => {
      const k = c[0], v = obj[k];
      if (types[k] === 'n') { const n = Number(v); o[k] = (v === undefined || v === null || v === '' || isNaN(n)) ? 0 : Math.round(n * 100) / 100; }
      else o[k] = v === undefined || v === null ? '' : String(v);
    });
    o._row = rowId;
    return o;
  }
  read(name) {
    if (!this.tables[name]) throw new Error('Missing sheet ' + name);
    if (!this.cache[name]) this.cache[name] = this.tables[name].map((r) => Object.assign({}, r));
    return this.cache[name];
  }
  append(name, objs) {
    if (!objs.length) return;
    objs.forEach((o) => { this.tables[name].push(this.norm_(name, o, 'new:' + (++this.tmp))); });
    this.dirty.add(name); delete this.cache[name];
  }
  update(name, rowId, obj) {
    const rows = this.tables[name];
    const i = rows.findIndex((r) => r._row === rowId);
    if (i < 0) throw new Error('Row not found in ' + name);
    rows[i] = this.norm_(name, obj, rowId);
    if (typeof rowId === 'number') this.updated[name].add(rowId);
    this.dirty.add(name); delete this.cache[name];
  }
  deleteWhere(name, pred) {
    const victims = this.read(name).filter(pred).map((r) => r._row);
    if (!victims.length) return 0;
    const set = new Set(victims);
    this.tables[name] = this.tables[name].filter((r) => !set.has(r._row));
    victims.forEach((id) => { if (typeof id === 'number') { this.deleted[name].add(id); this.updated[name].delete(id); } });
    this.dirty.add(name); delete this.cache[name];
    return victims.length;
  }
  /** Changes to write, in a store-neutral shape. */
  changes() {
    const out = [];
    this.dirty.forEach((name) => {
      const rows = this.tables[name];
      out.push({
        table: name,
        columns: this.schema[name].map((c) => c[0]),
        deletes: Array.from(this.deleted[name]),
        updates: rows.filter((r) => this.updated[name].has(r._row)),
        inserts: rows.filter((r) => typeof r._row !== 'number'),
      });
    });
    return out;
  }
  kvChanges() {
    return Array.from(this.kvDirty.entries()).map(([key, v]) => (v ? { key, value: v.value, expires: v.expires } : { key, value: null, expires: 0 }));
  }
}

// ---- Apps Script service shims ----------------------------------------------
const signed = (buf) => Array.from(buf).map((b) => (b > 127 ? b - 256 : b));
const unsigned = (arr) => Buffer.from(arr.map((b) => b & 255));

const Utilities = {
  DigestAlgorithm: { SHA_256: 'sha256', SHA_1: 'sha1' },
  Charset: { UTF_8: 'utf8' },
  MacAlgorithm: { HMAC_SHA_1: 'sha1' },
  computeDigest: (alg, s) => signed(crypto.createHash(alg).update(String(s), 'utf8').digest()),
  computeHmacSignature: (alg, value, key) => signed(crypto.createHmac(alg, unsigned(key)).update(unsigned(value)).digest()),
  getUuid: () => crypto.randomUUID(),
  // Africa/Accra is UTC+0 all year, so UTC formatting matches the old script's time zone.
  formatDate: (d) => new Date(d.getTime()).toISOString().slice(0, 10),
};
const Session = { getScriptTimeZone: () => 'Africa/Accra' };
// Writes are serialised by a Postgres advisory lock held for the whole request.
const LockService = { getScriptLock: () => ({ waitLock() {}, tryLock() { return true; }, releaseLock() {} }) };
const PropertiesService = {
  getScriptProperties: () => ({
    getProperty: (k) => { const e = cur().env; return e[k] === undefined || e[k] === '' ? null : e[k]; },
    setProperty: (k, v) => { cur().env[k] = String(v); },
  }),
};
const CacheService = {
  getScriptCache: () => ({
    get: (k) => { const u = cur().uow; const e = u.kv.get(k); return e && e.expires > Date.now() ? e.value : null; },
    put: (k, v, sec) => { const u = cur().uow; const e = { value: String(v), expires: Date.now() + (sec || 600) * 1000 }; u.kv.set(k, e); u.kvDirty.set(k, e); },
    remove: (k) => { const u = cur().uow; u.kv.delete(k); u.kvDirty.set(k, null); },
  }),
};

module.exports = { als, cur, UnitOfWork, Utilities, Session, LockService, PropertiesService, CacheService };
