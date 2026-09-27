// Local dev API: same handler as Vercel (api/index.js) over an in-memory database.
//   node backend/test/server.js   ->  http://localhost:8787/api
const http = require('http');
const core = require('../../server/core');
const { makeMemStore } = require('../../server/store-mem');
const store = makeMemStore();
core.setMailerFetch(async (url, init) => { console.log('[mock mailer] send', (init.body || '').length, 'bytes'); return { status: 200, text: async () => '{"ok":true,"from":"mykaquadent@gmail.com"}' }; });
const env = { ADMIN_TEMP: process.env.ADMIN_TEMP || 'TempPass123', MAILER_URL: 'https://mock-mailer/exec', MAILER_SECRET: 'x'.repeat(40) };
const port = process.env.PORT || 8787;
http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'GET') { res.end(JSON.stringify(core.doGet())); return; }
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', async () => {
    let r; try { r = JSON.parse(body || '{}'); } catch (e) { return res.end('{"ok":false,"error":"Bad request body"}'); }
    res.end(JSON.stringify(await core.handle(r, { store, env })));
  });
}).listen(port, () => console.log('mock API on ' + port));
