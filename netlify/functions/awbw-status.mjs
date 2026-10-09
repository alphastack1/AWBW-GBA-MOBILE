import {checkAWBW} from '../../server/awbw-diagnostics.mjs';
import {probeCommandStore,readHostedHealth} from '../../server/command-store.mjs';

export default async function handler(request) {
  const headers = {'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'};
  if (request.method !== 'GET') return new Response(JSON.stringify({error: 'Use GET for this read-only check.'}), {status: 405, headers: {...headers, Allow: 'GET'}});
  const [awbw,commandStore,lastHostedRead]=await Promise.all([checkAWBW(),probeCommandStore(),readHostedHealth()]);
  return new Response(JSON.stringify({...awbw,commandStore,lastHostedRead}), {headers});
}
