/**
 * Supabase Postgres store. One API request = one transaction:
 *   BEGIN → (advisory lock for writes) → load tables → run action → apply changes → COMMIT
 * Table changes are only written when the action succeeded; cache changes always are.
 */
const { Pool, types } = require('pg');
const { SCHEMA } = require('./core');

types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v))); // numeric -> number
types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10))); // bigint  -> number

const LOCK_KEY = 771977; // "MYKA" writes are serialised, like Apps Script's LockService
const q = (id) => '"' + String(id).replace(/"/g, '""') + '"';

function loadSql(withAudit) {
  const parts = Object.keys(SCHEMA).map((t) => {
    if (t === 'Audit') {
      return withAudit
        ? `'Audit', (select coalesce(json_agg(x order by x."_row"), '[]'::json) from (select * from "Audit" order by "_row" desc limit 500) x)`
        : `'Audit', '[]'::json`;
    }
    return `${q(t).replace(/"/g, "'")}, (select coalesce(json_agg(t order by t."_row"), '[]'::json) from ${q(t)} t)`;
  });
  return `select json_build_object(${parts.join(', ')}) as db,
          (select coalesce(json_agg(c), '[]'::json) from "Cache" c where c.expires > $1) as cache`;
}

async function applyChanges(client, changes) {
  for (const ch of changes) {
    const T = q(ch.table);
    const cols = ch.columns.map(q);
    if (ch.deletes.length) await client.query(`delete from ${T} where "_row" = any($1::bigint[])`, [ch.deletes]);
    if (ch.updates.length) {
      await client.query(
        `update ${T} as t set ${cols.map((c) => `${c} = x.${c}`).join(', ')}
           from json_populate_recordset(null::${T}, $1::json) x where t."_row" = x."_row"`,
        [JSON.stringify(ch.updates)]
      );
    }
    if (ch.inserts.length) {
      const rows = ch.inserts.map((r) => { const o = Object.assign({}, r); delete o._row; return o; });
      await client.query(
        `insert into ${T} (${cols.join(', ')})
           select ${cols.map((c) => 'x.' + c).join(', ')}
             from json_populate_recordset(null::${T}, $1::json) with ordinality as x
            order by x.ordinality`,
        [JSON.stringify(rows)]
      );
    }
  }
}

async function applyCache(client, cache) {
  for (const c of cache) {
    if (c.value === null) await client.query('delete from "Cache" where key = $1', [c.key]);
    else await client.query(
      'insert into "Cache"(key, value, expires) values ($1, $2, $3) on conflict (key) do update set value = excluded.value, expires = excluded.expires',
      [c.key, c.value, c.expires]
    );
  }
  if (Math.random() < 0.05) await client.query('delete from "Cache" where expires < $1', [Date.now()]);
}

function makePgStore(connectionString) {
  const pool = new Pool({
    connectionString,
    max: 3,
    idleTimeoutMillis: 10000,
    ssl: /localhost|127\.0\.0\.1/.test(connectionString) ? false : { rejectUnauthorized: false },
  });
  return {
    pool,
    async run(opts, fn) {
      const client = await pool.connect();
      try {
        await client.query('begin');
        if (opts.lock) await client.query('select pg_advisory_xact_lock($1)', [LOCK_KEY]);
        const snap = await client.query(loadSql(opts.withAudit), [Date.now()]);
        const out = await fn({ tables: snap.rows[0].db, cache: snap.rows[0].cache });
        await applyChanges(client, out.changes);
        await applyCache(client, out.cache);
        await client.query('commit');
        return out.result;
      } catch (e) {
        try { await client.query('rollback'); } catch (_) { /* ignore */ }
        throw e;
      } finally {
        client.release();
      }
    },
  };
}

module.exports = { makePgStore, loadSql, applyChanges, applyCache };
