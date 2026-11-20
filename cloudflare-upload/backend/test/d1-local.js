// A real (local) Cloudflare D1 database for tests, via Miniflare (same SQLite engine as production).
const fs = require('fs');
const path = require('path');
async function localD1() {
  const { Miniflare } = require('miniflare');
  const mf = new Miniflare({ modules: true, script: 'export default { fetch() { return new Response("") } }', d1Databases: ['DB'] });
  const db = await mf.getD1Database('DB');
  const sql = fs.readFileSync(path.join(__dirname, '..', '..', 'db', 'migrations', '0001_init.sql'), 'utf8')
    .split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
    .split(/;\s*\n/).map((s) => s.trim()).filter(Boolean);
  await db.batch(sql.map((s) => db.prepare(s)));
  return { db, dispose: () => mf.dispose() };
}
module.exports = { localD1 };
