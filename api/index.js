// RETIRED 2026-11-20: Myka Quad now runs on Cloudflare (Worker + D1). This Vercel endpoint only
// tells old browsers where the app went, so nothing can be saved to the retired Supabase database.
module.exports = function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  res.end(JSON.stringify({ ok: false, error: 'Myka Quad has moved to a new address on Cloudflare. Please use the new link: https://myka-quad.awuben.workers.dev.' }));
};
