// The bridge owns authority. The handheld can request previews, never raw wire messages.
export function createOrderGate(adapter, {now=()=>Date.now(), id=()=>crypto.randomUUID(), timeout=15000}={}) {
 let enabled=false, revision=0, proposal=null, pending=null, locked=false;
 const consumed=new Set();
 function tick(){if(pending&&now()-pending.sentAt>=timeout&&!locked){locked=true;adapter.result({requestId:pending.requestId,status:'uncertain',message:'No confirmed outcome. Check AWBW and reload its tab before sending more orders.'});}}
 function status(){tick();const state=adapter.state();return {enabled,revision,busy:!!pending,locked,available:enabled&&!pending&&!locked&&state.available,reason:locked?'Outcome uncertain; reload the AWBW tab.':pending?'Waiting for AWBW.':!enabled?'Enable handheld orders in the AWBW bridge.':state.reason||''};}
 function guard(){tick();if(!enabled)throw new Error('Handheld orders are disabled in AWBW.');if(locked)throw new Error('Previous outcome is uncertain. Check AWBW and reload its tab.');if(pending)throw new Error('An order is already waiting for AWBW.');const state=adapter.state();if(!state.available)throw new Error(state.reason||'AWBW is not ready for orders.');return state;}
 function invalidate(){revision++;proposal=null;}
 return {
  status,
  enable(value){enabled=value===true;proposal=null;},
  cancel(){proposal=null;},
  plan(input){proposal=null;const state=guard(),prepared=adapter.prepare(input);proposal={token:id(),input:structuredClone(input),prepared,revision,version:state.version,expires:now()+60000};return {token:proposal.token,revision,expires:proposal.expires,...prepared.preview,choices:prepared.choices.map(c=>({key:c.key,label:c.label}))};},
  commit({requestId,token,choice}){
   if(typeof requestId!=='string'||!/^[a-zA-Z0-9-]{8,80}$/.test(requestId)||consumed.has(requestId))throw new Error('Duplicate or invalid order request.');
   const state=guard(),p=proposal;
   if(!p||token!==p.token||p.revision!==revision||p.version!==state.version||now()>p.expires)throw new Error('Preview is stale. Select the order again.');
   const selected=p.prepared.choices.find(c=>c.key===choice);if(!selected)throw new Error('This order was not offered by AWBW.');
   // Recompute paths, ownership, funds and eligibility immediately before sending.
   const fresh=adapter.prepare(p.input).choices.find(c=>c.key===choice);
   if(!fresh||JSON.stringify(fresh)!==JSON.stringify(selected)){proposal=null;throw new Error('AWBW state changed. Select the order again.');}
   if(consumed.size>=1000)throw new Error('Reload AWBW before sending more orders.');
   consumed.add(requestId);proposal=null;pending={requestId,...fresh,sentAt:now(),socket:adapter.socket(),interference:false};
   // A synchronous send error has an uncertain outcome too: never automatically retry.
   try{adapter.send(fresh.command);}catch{locked=true;adapter.result({requestId,status:'uncertain',message:'Connection failed while sending. Check AWBW and reload its tab.'});return;}
   if(pending)adapter.result({requestId,status:'sent',message:'Sent once. Waiting for AWBW’s response.'});
  },
  observe(socket,direction,data){
   if(socket!==adapter.socket()&&socket!==pending?.socket)return;
   if(direction==='outgoing'){
    if(!data?.action||['LeaveRoom','Ping'].includes(data.action))return;
    invalidate();
    if(pending&&(pending.seenSend||JSON.stringify(data)!==JSON.stringify(pending.command)))pending.interference=true;
    if(pending)pending.seenSend=true;
    return;
   }
   if(!data||typeof data!=='object')return;
   const events=Object.values(data).filter(v=>v&&typeof v==='object'&&typeof v.action==='string'&&!['JoinRoom','LeaveRoom','ActivityUpdate','Ping'].includes(v.action));
   if(!events.length&&!data.err)return;
   invalidate();
   if(!pending||locked)return;
   if(pending.interference)return; // Server events have no unique order IDs.
   if(data.err){const requestId=pending.requestId;pending=null;adapter.result({requestId,status:'rejected',message:'AWBW rejected the order. Check its original page for the reason.'});return;}
   const p=pending,match=events.find(e=>{
    if(p.command.action==='Move')return e.action==='Move'&&e.unit?.units_id===p.command.unitID&&e.unit?.units_players_id===p.command.playerID;
    if(p.command.action==='Capt')return e.action==='Capt'&&e.buildingInfo?.buildings_x===p.expected.x&&e.buildingInfo?.buildings_y===p.expected.y;
    if(p.command.action==='Build')return e.action==='Build'&&e.newUnit?.units_players_id===p.command.playerID&&e.newUnit?.units_x===p.expected.x&&e.newUnit?.units_y===p.expected.y&&e.newUnit?.units_name===p.expected.name;
    return p.command.action==='End'&&e.action==='NextTurn'&&Number.isInteger(e.nextPId)&&e.nextPId!==p.command.playerID;
   });
   if(match){pending=null;adapter.result({requestId:p.requestId,status:'observed',action:match.action,message:match.trapped?'AWBW returned a trapped movement outcome. Review the updated board.':'AWBW returned the matching game event. Review the updated board.'});}
  },
  disconnect(socket){if(socket!==adapter.socket()&&socket!==pending?.socket)return;invalidate();if(pending){locked=true;adapter.result({requestId:pending.requestId,status:'uncertain',message:'Connection interrupted. Check AWBW and reload its tab; do not repeat the order.'});}}
 };
}
