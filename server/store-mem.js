/** In-memory store with the same contract as store-pg.js — used by the tests and the local dev server. */
function makeMemStore() {
  const tables = {};
  const cache = new Map();
  let seq = 0;
  const clone = (x) => JSON.parse(JSON.stringify(x));
  let chain = Promise.resolve();
  return {
    tables,
    run(opts, fn) {
      const job = chain.then(async () => {
        const snapTables = {};
        Object.keys(tables).forEach((t) => {
          let rows = tables[t];
          if (t === 'Audit') rows = opts.withAudit ? rows.slice(-500) : [];
          snapTables[t] = clone(rows);
        });
        const now = Date.now();
        const snapCache = Array.from(cache.entries()).filter(([, v]) => v.expires > now).map(([key, v]) => ({ key, value: v.value, expires: v.expires }));
        const out = await fn({ tables: snapTables, cache: snapCache });
        out.changes.forEach((ch) => {
          const rows = (tables[ch.table] = tables[ch.table] || []);
          const del = new Set(ch.deletes);
          const upd = new Map(ch.updates.map((r) => [r._row, r]));
          tables[ch.table] = rows.filter((r) => !del.has(r._row)).map((r) => (upd.has(r._row) ? clone(upd.get(r._row)) : r));
          ch.inserts.forEach((r) => { const o = clone(r); o._row = ++seq; tables[ch.table].push(o); });
        });
        out.cache.forEach((c) => { if (c.value === null) cache.delete(c.key); else cache.set(c.key, { value: c.value, expires: c.expires }); });
        return out.result;
      });
      chain = job.catch(() => {});
      return job;
    },
  };
}
module.exports = { makeMemStore };
