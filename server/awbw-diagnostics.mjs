// Fixed, public, read-only probes. This is not a general-purpose URL proxy.
const ORIGIN = 'https://awbw.amarriner.com';
const pages = {home: '/', games: '/yourgames.php', game: '/game.php?games_id=1741140'};
function attributes(tag) {
  const result = {};
  for (const match of tag.matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
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
    forms.push({action: sameOriginPath(form.action, url), method: (form.method || 'get').toLowerCase(),
      fields: fields.filter(f => f.name || f.id || f['v-model']).map(f => ({name: f.name || f.id || f['v-model'], type: (f.type || 'text').toLowerCase()}))});
  }
  const scripts = [...html.matchAll(/<script\b([^>]*)>/gi)].map(m => attributes(m[1]).src)
    .filter(Boolean).map(src => sameOriginPath(src, url)).filter(Boolean).slice(0, 40);
  const ws = html.match(/\bwsUrl\s*=\s*["'](wss:\/\/[^"']+)["']/)?.[1];
  let socketHost = null;
  try { if (ws) socketHost = new URL(ws).hostname; } catch {}
  const networkCalls = [...html.matchAll(/\b(?:axios\.(post|get)|fetch)\s*\(\s*["']([^"']+)["']/g)]
    .map(m => ({method: m[1] || 'fetch', path: sameOriginPath(m[2], url)})).filter(r => r.path).slice(0, 30);
  const loginMatch = html.match(/\blogin\s*(?:\([^)]*\)|:\s*function\s*\([^)]*\))\s*\{/);
  let loginClientStructure = null;
  if (loginMatch) {
    const start = loginMatch.index, tail = html.slice(start, start + 2500).split('</script>')[0];
    // Code structure only: remove every literal string and comment before returning it.
    loginClientStructure = tail.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '').replace(/(["'`])(?:\\.|(?!\1)[^\\])*?\1/g, '"[literal]"');
  }
  return {loginForms: forms, networkCalls, loginClientStructure, scripts, socketHost, hasGameClient: scripts.some(p => /\/game(?:\.min)?\.js$/.test(p)),
    hasLoginInput: /type\s*=\s*["']password["']/i.test(html)};
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
  return {service: 'Field Command', checkedAt: new Date().toISOString(), mode: 'public-read-only',
    authenticated: false, ordersSubmitted: 0, pages: Object.fromEntries(results)};
}
