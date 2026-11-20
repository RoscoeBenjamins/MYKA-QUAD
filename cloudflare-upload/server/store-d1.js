/**
 * Cloudflare D1 store. One API request = one read batch + one write batch.
 *
 *   load:   one D1 batch (a single SQLite transaction, so a consistent snapshot) reads the
 *           tables the action needs, the Cache rows and the Meta version number.
 *   commit: one D1 batch (also a transaction). When tables changed, it starts with a guard
 *           that fails if Meta.v moved since the load (another request wrote in between); the
 *           whole batch then rolls back and the request is re-run from the start on fresh data.
 *           This replaces the Postgres advisory lock: concurrent writes can't produce duplicate
 *           document numbers or lost updates.
 * Table changes are only written when the action succeeded; cache changes always are.
 */
const MAX_ATTEMPTS = 25;
const CHUNK = 400; // rows per INSERT … json_each(?) statement
const q = (id) => '"' + String(id).replace(/"/g, '""') + '"';
const jp = (c) => "'$." + '"' + String(c).replace(/'/g, "''").replace(/"/g, '\\"') + '"' + "'";

function selectSql(table) {
  if (table === 'Audit') return 'SELECT * FROM (SELECT * FROM "Audit" ORDER BY "_row" DESC LIMIT 500) ORDER BY "_row"';
  return 'SELECT * FROM ' + q(table) + ' ORDER BY "_row"';
}

async function load(db, tables) {
  const stmts = tables.map((t) => db.prepare(selectSql(t)));
  stmts.push(db.prepare('SELECT key, value, expires FROM "Cache" WHERE expires > ?').bind(Date.now()));
  stmts.push(db.prepare('SELECT v FROM "Meta" WHERE id = 1'));
  const res = await db.batch(stmts);
  const out = { tables: {}, cache: res[tables.length].results, version: (res[tables.length + 1].results[0] || { v: 0 }).v };
  tables.forEach((t, i) => { out.tables[t] = res[i].results; });
  return out;
}

function writeStatements(db, changes, cache, version, guard) {
  const stmts = [];
  if (changes.length && guard !== false) {
    // fails (NOT NULL) when someone else committed since our load -> whole batch rolls back
    stmts.push(db.prepare('INSERT INTO "Guard"(ok) SELECT NULL WHERE (SELECT v FROM "Meta" WHERE id = 1) <> ?').bind(version));
    stmts.push(db.prepare('UPDATE "Meta" SET v = v + 1 WHERE id = 1'));
  } else if (changes.length) {
    stmts.push(db.prepare('UPDATE "Meta" SET v = v + 1 WHERE id = 1')); // unguarded write still bumps the version
  }
  for (const ch of changes) {
    const T = q(ch.table);
    if (ch.deletes.length) stmts.push(db.prepare('DELETE FROM ' + T + ' WHERE "_row" IN (SELECT value FROM json_each(?))').bind(JSON.stringify(ch.deletes)));
    if (ch.updates.length) {
      const sql = 'UPDATE ' + T + ' SET ' + ch.columns.map((c) => q(c) + ' = json_extract(?1, ' + jp(c) + ')').join(', ') + ' WHERE "_row" = json_extract(?1, \'$._row\')';
      for (const r of ch.updates) stmts.push(db.prepare(sql).bind(JSON.stringify(r)));
    }
    if (ch.inserts.length) {
      const sql = 'INSERT INTO ' + T + ' (' + ch.columns.map(q).join(', ') + ') SELECT ' +
        ch.columns.map((c) => 'json_extract(value, ' + jp(c) + ')').join(', ') + ' FROM json_each(?) ORDER BY key';
      for (let i = 0; i < ch.inserts.length; i += CHUNK) {
        const rows = ch.inserts.slice(i, i + CHUNK).map((r) => { const o = Object.assign({}, r); delete o._row; return o; });
        stmts.push(db.prepare(sql).bind(JSON.stringify(rows)));
      }
    }
  }
  for (const c of cache) {
    if (c.value === null) stmts.push(db.prepare('DELETE FROM "Cache" WHERE key = ?').bind(c.key));
    else stmts.push(db.prepare('INSERT INTO "Cache"(key, value, expires) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, expires = excluded.expires').bind(c.key, c.value, c.expires));
  }
  if (stmts.length && Math.random() < 0.05) stmts.push(db.prepare('DELETE FROM "Cache" WHERE expires < ?').bind(Date.now()));
  return stmts;
}

const isConflict = (e) => /NOT NULL constraint failed: Guard\.ok/i.test(String(e && e.message || e));

function makeD1Store(db) {
  return {
    async run(opts, fn) {
      for (let attempt = 1; ; attempt++) {
        let snap = await load(db, opts.tables);
        if (!snap.tables.Settings || !snap.tables.Settings.length) snap = await load(db, opts.allTables); // empty DB: seed needs all
        const out = await fn({ tables: snap.tables, cache: snap.cache });
        const stmts = writeStatements(db, out.changes, out.cache, snap.version, opts.guard);
        if (!stmts.length) return out.result;
        try {
          await db.batch(stmts);
          return out.result;
        } catch (e) {
          if (!isConflict(e) || attempt >= MAX_ATTEMPTS) throw e;
          await new Promise((r) => setTimeout(r, Math.random() * Math.min(1000, 40 * attempt)));
        }
      }
    },
  };
}

module.exports = { makeD1Store, writeStatements, load };
