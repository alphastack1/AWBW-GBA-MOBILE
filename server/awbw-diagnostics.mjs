// Fixed, public, read-only probes. This is not a general-purpose URL proxy.
const ORIGIN = 'https://awbw.amarriner.com';
const pages = {home: '/', games: '/yourgames.php', game: '/game.php?games_id=1741140'};
function attributes(tag) {
  const result = {};
  for (const match of tag.matchAll(/([:@\w.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    result[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4];
  }
  return result;
}
function sameOriginPath(value, base) {
  try {
    const url = new URL(value || '', base);
    return url.origin === ORIGIN ? url.pathname : null;
  } catch { return null; }
}
export function summarizePage(html, url) {
  const forms = [];
  for (const match of html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)) {
    const form = attributes(match[1]);
    const fields = [...match[2].matchAll(/<input\b([^>]*)>/gi)].map(m => attributes(m[1]));
    if (!fields.some(f => f.type?.toLowerCase() === 'password')) continue;
    const fieldName = f => f.name || f.id || Object.entries(f).find(([key]) => key.startsWith('v-model'))?.[1];
    forms.push({action: sameOriginPath(form.action, url), method: (form.method || 'get').toLowerCase(), submitHandler: form['@submit.prevent'] || form['v-on:submit.prevent'] || form.onsubmit || null,
      fields: fields.filter(f => fieldName(f)).map(f => ({name: fieldName(f), type: (f.type || 'text').toLowerCase()})),
      controls: fields.map(f => Object.fromEntries(Object.entries(f).filter(([key]) => /^(?:type|name|id|class|autocomplete|placeholder|v-model.*|:name|v-bind:name)$/.test(key))))});
  }
  const scripts = [...html.matchAll(/<script\b([^>]*)>/gi)].map(m => attributes(m[1]).src)
    .filter(Boolean).map(src => sameOriginPath(src, url)).filter(Boolean).slice(0, 40);
  const ws = html.match(/\bwsUrl\s*=\s*["'](wss:\/\/[^"']+)["']/)?.[1];
  let socketHost = null;
  try { if (ws) socketHost = new URL(ws).hostname; } catch {}
  const networkCalls = [...html.matchAll(/\b(?:axios\.(post|get)|fetch)\s*\(\s*["']([^"']+)["']/g)]
    .map(m => ({method: m[1] || 'fetch', path: sameOriginPath(m[2], url)})).filter(r => r.path).slice(0, 30);
  const loginMatch = html.match(/\blogin\s*(?:\([^)]*\)|:\s*function\s*\([^)]*\))\s*\{/i);
  let loginClientStructure = null;
  if (loginMatch) {
    const start = loginMatch.index, tail = html.slice(start, start + 2500).split('</script>')[0];
    // Code structure only: remove every literal string and comment before returning it.
    loginClientStructure = tail.replace(/(["'`])(?:\\.|(?!\1)[^\\])*?\1/g, '"[literal]"').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
  }
  const branch = html.match(/\bwsServerBranch\s*=\s*["']([\w-]+)["']/)?.[1];
  const loginPaths = [...new Set([...html.matchAll(/["'`]([^"'`\n]{0,100}login[^"'`\n]{0,100}\.php(?:\?[^"'`\n]*)?)["'`]/gi)].map(m => sameOriginPath(m[1], url)).filter(Boolean))];
  return {loginForms: forms, loginPaths, networkCalls, loginClientStructure, scripts, socketHost, socketBranch: branch || null, hasGameClient: scripts.some(p => /\/game(?:\.min)?\.js$/.test(p)),
    hasLoginInput: /type\s*=\s*["']password["']/i.test(html)};
}
export function checkSocketHandshake(branch, requester = httpsRequest) {
  if (!/^[\w-]{1,40}$/.test(branch || '')) return Promise.resolve({connected: false, reason: 'No recognized socket branch in the public game page.'});
  return new Promise(resolve => {
    const key = randomBytes(16).toString('base64'), expected = createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    let done = false, req;
    const finish = result => {if (done) return; done = true; clearTimeout(timer); req?.destroy(); resolve({...result, authenticated: false, ordersSubmitted: 0});};
    const timer = setTimeout(() => finish({connected: false, reason: 'Socket handshake timed out.'}), 8000);
    try {
      req = requester(new URL(`/${branch}/game/1741140`, ORIGIN), {method: 'GET', headers: {Upgrade: 'websocket', Connection: 'Upgrade', 'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': key, Origin: ORIGIN}});
      req.on('upgrade', (response, socket) => {const valid = response.statusCode === 101 && response.headers['sec-websocket-accept'] === expected; socket.destroy(); finish({connected: valid, status: response.statusCode});});
      req.on('response', response => {response.resume(); finish({connected: false, status: response.statusCode});});
      req.on('error', () => finish({connected: false, reason: 'Socket connection failed.'}));
      req.end();
    } catch {finish({connected: false, reason: 'Socket connection failed.'});}
  });
}
async function probe(path, fetcher) {
  let url = new URL(path, ORIGIN);
  for (let redirects = 0; redirects <= 3; redirects++) {
    const response = await fetcher(url, {method: 'GET', redirect: 'manual', credentials: 'omit',
      headers: {'User-Agent': 'FieldCommand/0.6 (read-only AWBW integration check)', Accept: 'text/html'},
      signal: AbortSignal.timeout(10000)});
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const next = new URL(response.headers.get('location') || '', url);
      await response.body?.cancel();
      if (next.origin !== ORIGIN || redirects === 3) return {status: response.status, reachable: false, reason: 'Upstream redirect could not be followed safely.'};
      url = next; continue;
    }
    const text = (await response.text()).slice(0, 1000000);
    return {status: response.status, reachable: response.ok, path: url.pathname,
      contentType: response.headers.get('content-type')?.split(';')[0] || null,
      ...(response.ok ? summarizePage(text, url) : {})};
  }
}
export async function checkAWBW(fetcher = fetch) {
  const results = await Promise.all(Object.entries(pages).map(async ([name, path]) => {
    try { return [name, await probe(path, fetcher)]; }
    catch { return [name, {reachable: false, reason: 'AWBW could not be reached before the connection timeout.'}]; }
  }));
  const pageResults = Object.fromEntries(results);
  const socket = fetcher === fetch && pageResults.game?.socketHost === 'awbw.amarriner.com' ? await checkSocketHandshake(pageResults.game.socketBranch) : {connected: false, reason: 'Socket transport was not probed.', authenticated: false, ordersSubmitted: 0};
  return {service: 'Field Command', checkedAt: new Date().toISOString(), mode: 'public-read-only',
    authenticated: false, ordersSubmitted: 0, pages: pageResults, socket};
}
import {request as httpsRequest} from 'node:https';
import {randomBytes, createHash} from 'node:crypto';
