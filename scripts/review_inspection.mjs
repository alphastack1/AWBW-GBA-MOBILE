import {readFile} from 'node:fs/promises';
import {createOrderGate} from '../live-orders.js';
const file=process.argv[2];
if(!file){console.error('Usage: npm run review-inspection -- /path/to/awbw-inspection.json');process.exit(1);}
const data=JSON.parse(await readFile(file,'utf8'));
if(!['field-command-inspection-v1','field-command-inspection-v2'].includes(data.format)||!Array.isArray(data.contracts))throw new Error('Unsupported inspection export.');
const contracts=data.contracts;
const state=contracts.filter(c=>c.responseSample&&/"(?:units|units_id|units_x|terrain|buildings)"/.test(JSON.stringify(c.responseSample)));
const actions=contracts.filter(c=>(c.transport==='websocket'?c.direction==='outgoing'&&c.requestSample?.action:(!/(?:fetch_|load_|stats|time)/i.test(c.path)&&(c.requestSample?.action||/(?:move|attack|capture|end_?turn|build|buy|purchase|order)/i.test(c.path)))));
const acknowledged=actions.filter(c=>c.status>=200&&c.status<300&&c.responseSample?.success===true);
const rejected=actions.filter(c=>c.status>=400||c.status===0||c.responseSample?.success===false);
const sockets=contracts.filter(c=>c.transport==='websocket');
console.log(`WebSocket evidence: ${sockets.length} frames (${sockets.filter(c=>c.direction==='outgoing').length} sends, ${sockets.filter(c=>c.direction==='incoming').length} receives).`);
console.log(`Inspection ${data.format}; ${contracts.length} observed requests; ${data.publicFiles?.length||0} public source files.`);
console.log(`Visible map snapshot: ${data.snapshot?'present':'missing'}${data.snapshotError?' ('+data.snapshotError+')':''}`);
console.log(`Structured game samples: ${state.length}; action candidates: ${actions.length}; explicit success responses: ${acknowledged.length}; rejected/network failures: ${rejected.length}.`);
for(const c of actions.slice(0,15))console.log(`${c.method} ${c.path} — HTTP ${c.status}; fields: ${c.requestFieldNames.join(', ')}`);
// Pair only adjacent action frames: same event type is evidence, not a request ID.
const gameplay=sockets.filter(c=>c.direction==='outgoing'||Object.keys(c.responseSchema||{}).some(k=>['Move','Capt','Fire','Build','NextTurn','err'].includes(k)));
let paired=0, exactMoves=0, replayed=0;
for(let i=0;i<gameplay.length;i++){
 const sent=gameplay[i];if(sent.direction!=='outgoing')continue;
 const action=sent.requestSample?.action, expected=action==='End'?'NextTurn':action, received=gameplay[i+1];
 if(received?.direction!=='incoming'||!Object.hasOwn(received.responseSchema||{},expected))continue;
 paired++;
 const result=received.responseSample?.Move, request=sent.requestSample, width=data.snapshot?.map?.width;
 if(action==='Move'&&Number.isInteger(width)&&result?.unit?.units_id===request.unitID&&Array.isArray(result.path)&&Array.isArray(request.path)&&result.path.length===request.path.length&&result.path.every((p,j)=>p.y*width+p.x===request.path[j])){
  exactMoves++;
  // Exercise the actual gate with retained native evidence; send stays local.
  const socket={},outcomes=[],wire=[];
  const gate=createOrderGate({state:()=>({available:true,version:'recording'}),socket:()=>socket,prepare:()=>({preview:{},choices:[{key:'Move',label:'Wait',command:request,expected:{}}]}),send:command=>{wire.push(command);gate.observe(socket,'outgoing',command);},result:r=>outcomes.push(r)});
  gate.enable(true);const plan=gate.plan({kind:'unit',unitId:request.unitID});gate.commit({requestId:`recording-${i}`,token:plan.token,choice:'Move'});gate.observe(socket,'incoming',received.responseSample);
  if(wire.length===1&&outcomes.at(-1)?.status==='observed')replayed++;
 }
}
console.log(`Official action/event sequence matches: ${paired}/${actions.filter(c=>c.transport==='websocket').length}; movement samples with matching unit ID and full path: ${exactMoves}.`);
console.log(`Retained movement outcomes replayed through the order gate: ${replayed}. Replay emits only to an in-memory fixture; it does not contact AWBW.`);
console.log('Sequence matches lack request IDs and do not establish independent-client execution or duplicate protection.');
console.log('\nLive orders remain UNVERIFIED. Observations from the official page are evidence, not proof that an independent client can safely submit orders.');
console.log('Required next: read public source, map exact state/action contracts, verify active-player permissions and turn versions, confirm rejected/stale/duplicate orders, and test independent orders in a designated test match. No commands are sent by this review.');
