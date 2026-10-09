import {checkAWBW} from '../../server/awbw-diagnostics.mjs';

export default async function handler(request) {
  const headers = {'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'};
  if (request.method !== 'GET') return new Response(JSON.stringify({error: 'Use GET for this read-only check.'}), {status: 405, headers: {...headers, Allow: 'GET'}});
  return new Response(JSON.stringify(await checkAWBW()), {headers});
}
