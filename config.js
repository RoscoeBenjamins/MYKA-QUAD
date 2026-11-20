// API endpoint for the Myka Quad ERP: the Cloudflare Worker (worker/index.js), same origin as the site.
// Old addresses (GitHub Pages) go to the retired Vercel endpoint, which only says the app has moved.
window.MYKA_CONFIG = {
  apiUrl: /github\.io$/.test(location.hostname) ? 'https://myka-quad.vercel.app/api' : '/api'
};
