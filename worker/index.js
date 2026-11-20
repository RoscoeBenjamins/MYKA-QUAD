// Cloudflare Worker: serves the app (static files in _site/ via the ASSETS binding) and the API.
//   POST /api  {action, payload, token} -> {ok, data|error}   (same contract as before)
//   GET  /api  -> health check
// Database: D1 (binding DB). Secrets/vars: MAILER_URL, MAILER_SECRET, optional ADMIN_TEMP.
import core from '../server/core.js';
import d1 from '../server/store-d1.js';

const ENV_KEYS = ['MAILER_URL', 'MAILER_SECRET', 'ADMIN_TEMP'];
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
const json = (o, status = 200) => new Response(JSON.stringify(o), {
  status, headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, CORS),
});

async function api(request, env) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method === 'GET') return json(core.doGet());
  if (request.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);
  let body;
  try { body = JSON.parse((await request.text()) || '{}'); } catch (e) { return json({ ok: false, error: 'Bad request body' }); }
  try {
    const vars = {};
    ENV_KEYS.forEach((k) => { if (env[k]) vars[k] = env[k]; });
    return json(await core.handle(body, { store: d1.makeD1Store(env.DB), env: vars }));
  } catch (e) {
    console.error(e && e.stack || e);
    return json({ ok: false, error: 'Server error — please try again. (' + String(e && e.message || e).slice(0, 200) + ')' });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api' || url.pathname === '/api/') return api(request, env);
    return env.ASSETS.fetch(request);
  },
};
