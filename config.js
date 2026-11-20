// API endpoint for the Myka Quad ERP: the Cloudflare Worker (worker/index.js), same origin as the site.
// The old GitHub Pages address calls the Worker's API directly.
window.MYKA_CONFIG = {
  apiUrl: /github\.io$/.test(location.hostname) ? 'https://myka-quad.awuben.workers.dev/api' : '/api'
};
