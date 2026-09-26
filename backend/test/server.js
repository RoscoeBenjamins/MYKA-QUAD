// Local stand-in for the deployed Apps Script web app: POST / -> doPost
const http = require('http');
const { makeContext } = require('./gas-harness');
const ctx = makeContext({
  UrlFetchApp: { fetch(url, opt) { console.log('[mock gmail] send', url, (opt.payload || '').length, 'bytes'); return { getResponseCode: () => 200, getContentText: () => '{"ok":true,"from":"mykaquadent@gmail.com"}' }; } },
  ScriptApp: { getOAuthToken: () => 'mock' },
});
ctx.__props.set('MAILER_URL', 'https://mock-mailer/exec'); ctx.__props.set('MAILER_SECRET', 'x'.repeat(40));
const port = process.env.PORT || 8787;
http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'GET') { res.end(ctx.doGet({}).getContent()); return; }
  let body = '';
  req.on('data', c => (body += c));
  req.on('end', () => {
    const out = ctx.doPost({ postData: { contents: body } });
    res.setHeader('Content-Type', 'application/json');
    res.end(out.getContent());
  });
}).listen(port, () => console.log('mock API on ' + port));
