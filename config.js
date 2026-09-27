// API endpoint for the Myka Quad ERP — the Vercel function in api/index.js (database: Supabase).
// On the Vercel site it is same-origin; the old GitHub Pages address uses the Vercel API directly.
window.MYKA_CONFIG = {
  apiUrl: /github\.io$/.test(location.hostname) ? 'https://myka-quad.vercel.app/api' : '/api'
};
