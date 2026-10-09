import test from 'node:test';
import assert from 'node:assert/strict';
import {checkAWBW, summarizePage} from '../server/awbw-diagnostics.mjs';

test('public diagnostics retain form structure but exclude secret values and foreign resources', () => {
  const result = summarizePage(`<form action="login.php" method="post"><input name="csrf" type="hidden" value="private-token"><input name="username"><input name="password" type="password" value="private-password"></form><script src="/js/lib/game.js?v=token"></script><script src="https://foreign.example/tracker.js"></script><script>var wsUrl = 'wss://awbw.amarriner.com';</script>`, 'https://awbw.amarriner.com/');
  assert.equal(result.loginForms[0].action, '/login.php');
  assert.deepEqual(result.scripts, ['/js/lib/game.js']);
  assert.equal(result.socketHost, 'awbw.amarriner.com');
  assert.equal(result.hasGameClient, true);
  assert.ok(!JSON.stringify(result).includes('private-'));
});
test('diagnostics use only three fixed GET targets without session credentials', async () => {
  const calls = [];
  const result = await checkAWBW(async (url, options) => {
    calls.push({url: String(url), options});
    return new Response('<html>Public page</html>', {headers: {'Content-Type': 'text/html'}});
  });
  assert.equal(calls.length, 3);
  assert.ok(calls.every(c => c.url.startsWith('https://awbw.amarriner.com/') && c.options.method === 'GET' && c.options.credentials === 'omit'));
  assert.equal(result.ordersSubmitted, 0);
  assert.equal(result.authenticated, false);
});
test('diagnostics never follow redirects outside the fixed AWBW origin', async () => {
  let calls = 0;
  const result = await checkAWBW(async () => {calls++; return new Response('', {status: 302, headers: {Location: 'https://foreign.example/private'}});});
  assert.equal(calls, 3);
  assert.ok(Object.values(result.pages).every(page => !page.reachable));
});
test('connection errors and HTTP failures remain failed checks without sensitive error output', async () => {
  const result = await checkAWBW(async url => {
    if (url.pathname === '/') throw new Error('private credential diagnostic');
    return new Response('private upstream body', {status: 403});
  });
  assert.ok(Object.values(result.pages).every(page => !page.reachable));
  assert.ok(!JSON.stringify(result).includes('private'));
  assert.equal(result.pages.games.status, 403);
});
