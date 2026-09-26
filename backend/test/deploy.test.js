// Tests the pull-based auto-deploy (checkForUpdate) with fake UrlFetchApp / ScriptApp.
const assert = require('assert');
const fs = require('fs'); const path = require('path');
const { makeContext } = require('./gas-harness');
const code = fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8');
const manifest = fs.readFileSync(path.join(__dirname, '..', 'appsscript.json'), 'utf8');
let release = { sha: 'abc1234def', tests: 'passed', message: 'test', codeLength: code.length };
let served = { code, manifest };
const calls = [];
const resp = (c, t) => ({ getResponseCode: () => c, getContentText: () => t });
const UrlFetchApp = { fetch(url, opt = {}) {
  const u = url.split('?')[0];
  if (u.endsWith('/api/release.json')) return resp(200, JSON.stringify(release));
  if (u.endsWith('/api/Code.txt')) return resp(200, served.code);
  if (u.endsWith('/api/appsscript.json')) return resp(200, served.manifest);
  if (u.startsWith('https://script.googleapis.com/')) {
    calls.push([opt.method, u.replace(/.*projects\/[^/]+/, ''), opt.payload && JSON.parse(opt.payload)]);
    if (u.endsWith('/versions')) return resp(200, JSON.stringify({ versionNumber: 7 }));
    return resp(200, '{}');
  }
  return resp(404, '');
} };
const triggers = [];
const ScriptApp = { getScriptId: () => 'SCRIPT', getOAuthToken: () => 'tok', getProjectTriggers: () => triggers,
  deleteTrigger() {}, newTrigger: h => ({ timeBased: () => ({ everyMinutes: () => ({ create: () => triggers.push({ getHandlerFunction: () => h }) }) }) }) };
const ctx = makeContext({ UrlFetchApp, ScriptApp });

// first run deploys
let r = ctx.installAutoUpdate();
assert.match(r, /deployed v7 \(abc1234\)/);
assert.deepEqual(calls.map(c => c[0] + ' ' + c[1]), ['put /content', 'post /versions', 'put /deployments/' + ctx.DEPLOYMENT_ID]);
assert.equal(calls[0][2].files.length, 2);
assert.equal(calls[2][2].deploymentConfig.versionNumber, 7);
assert.equal(triggers.length, 1);
assert.equal(ctx.__props.get('ADMIN_TEMP'), 'TempPass123');
// second run is a no-op
calls.length = 0;
assert.match(ctx.checkForUpdate(), /up to date/); assert.equal(calls.length, 0);
// untested release ignored
release = { sha: 'zzz', tests: 'failed' };
assert.match(ctx.checkForUpdate(), /no tested release/); assert.equal(calls.length, 0);
// broken code refused
release = { sha: 'bad1', tests: 'passed', codeLength: 30 };
served.code = 'function doPost( { checkForUpdate';
served.code = served.code.padEnd(30, ' ');
assert.throws(() => ctx.checkForUpdate()); assert.equal(calls.length, 0);
assert.ok(ctx.__props.get('lastDeployError'));
// size mismatch refused
release = { sha: 'bad2', tests: 'passed', codeLength: 5 };
served.code = code;
assert.throws(() => ctx.checkForUpdate(), /size mismatch/); assert.equal(calls.length, 0);
console.log('DEPLOY TESTS PASSED');
