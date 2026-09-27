// Vercel serverless function: POST /api  {action, payload, token} -> {ok, data|error}
// Same request/response contract as the old Apps Script web app, so the front end is unchanged.
const core = require('../server/core');
const { makePgStore } = require('../server/store-pg');

let store = null;
function getStore() {
  if (!store) {
    if (!process.env.DATABASE_URL) throw new Error('The API is not connected to its database (DATABASE_URL is not set).');
    store = makePgStore(process.env.DATABASE_URL);
  }
  return store;
}
const ENV_KEYS = ['MAILER_URL', 'MAILER_SECRET', 'ADMIN_TEMP'];

function readBody(req) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'string') return Promise.resolve(req.body);
    if (Buffer.isBuffer(req.body)) return Promise.resolve(req.body.toString('utf8'));
    return Promise.resolve(JSON.stringify(req.body));
  }
  return new Promise((resolve, reject) => {
    let s = '';
    req.setEncoding('utf8');
    req.on('data', (c) => { s += c; });
    req.on('end', () => resolve(s));
    req.on('error', reject);
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  if (req.method === 'GET') return res.end(JSON.stringify(core.doGet()));
  if (req.method !== 'POST') { res.statusCode = 405; return res.end(JSON.stringify({ ok: false, error: 'Method not allowed' })); }
  let reqBody;
  try { reqBody = JSON.parse((await readBody(req)) || '{}'); }
  catch (e) { return res.end(JSON.stringify({ ok: false, error: 'Bad request body' })); }
  try {
    const env = {};
    ENV_KEYS.forEach((k) => { if (process.env[k]) env[k] = process.env[k]; });
    const out = await core.handle(reqBody, { store: getStore(), env });
    return res.end(JSON.stringify(out));
  } catch (e) {
    console.error(e);
    return res.end(JSON.stringify({ ok: false, error: 'Server error — please try again. (' + String(e && e.message || e).slice(0, 200) + ')' }));
  }
};
