import WebSocket from 'ws';

// A successful anonymous upgrade does not prove authentication. Await AWBW's
// JoinRoom event for this exact viewer, then close without sending game frames.
export function probeAuthenticatedSocket({gameId,branch,viewerId,cookie},Socket=WebSocket){
 if(!/^\d{1,12}$/.test(String(gameId))||!/^\w[\w-]{0,39}$/.test(branch||'')||!Number.isInteger(viewerId)||viewerId<1||!cookie)return Promise.resolve({authenticated:false,ordersSubmitted:0,reason:'Authenticated socket details are incomplete.'});
 return new Promise(resolve=>{
  let socket,finished=false;
  const finish=result=>{if(finished)return;finished=true;clearTimeout(timer);socket?.terminate();resolve({...result,ordersSubmitted:0});};
  const timer=setTimeout(()=>finish({authenticated:false,reason:'AWBW did not confirm this socket before the timeout.'}),4500);
  try{
   socket=new Socket(`wss://awbw.amarriner.com/${branch}/game/${gameId}`,{origin:'https://awbw.amarriner.com',headers:{Cookie:cookie},handshakeTimeout:4000});
   socket.on('message',bytes=>{
    if(bytes.length>100000)return;
    try{const body=JSON.parse(String(bytes)),joined=Object.values(body).find(event=>event?.action==='JoinRoom');if(!joined)return;
     finish(joined.playerId===viewerId?{authenticated:true}:{authenticated:false,reason:'AWBW did not confirm your player on this socket.'});
    }catch{}
   });
   socket.on('close',()=>finish({authenticated:false,reason:'AWBW closed this socket before confirming your player.'}));
   socket.on('error',()=>finish({authenticated:false,reason:'The authenticated AWBW socket could not connect.'}));
  }catch{finish({authenticated:false,reason:'The authenticated AWBW socket could not connect.'});}
 });
}

export function submitSingleOrder({gameId,branch,viewerId,cookie,beforeSend},Socket=WebSocket,{timeout=12000}={}){
 if(!/^\d{1,12}$/.test(String(gameId))||!/^\w[\w-]{0,39}$/.test(branch||'')||!Number.isInteger(viewerId)||viewerId<1||!cookie)return Promise.resolve({status:'not-sent',message:'AWBW’s authenticated connection is incomplete.'});
 return new Promise(resolve=>{
  let socket,finished=false,sent=false,joining=false,prepared,interference=false;
  const finish=result=>{if(finished)return;finished=true;clearTimeout(timer);socket?.terminate();resolve({...result,submitted:sent});};
  const timer=setTimeout(()=>finish({status:sent?'uncertain':'not-sent',message:sent?'No confirmed outcome. Refresh and check AWBW; do not repeat this order.':'AWBW did not establish the connection in time.'}),timeout);
  const match=e=>{
   const c=prepared.command,p=prepared.expected;
   if(c.action==='Fire')return e.action==='Fire'&&e.attacker?.units_id===c.attacker.unitID&&e.attacker?.units_players_id===viewerId&&e.defender?.units_id===c.defender.unitID||e.action==='Move'&&e.trapped&&e.unit?.units_id===c.attacker.unitID&&e.unit?.units_players_id===viewerId;
   if(c.action==='Move')return e.action==='Move'&&e.unit?.units_id===c.unitID&&e.unit?.units_players_id===viewerId&&(e.trapped||e.unit?.units_x===p.x&&e.unit?.units_y===p.y);
   if(c.action==='Capt')return e.action==='Capt'&&e.buildingInfo?.buildings_x===p.x&&e.buildingInfo?.buildings_y===p.y&&(!p.buildingId||e.buildingInfo?.buildings_id===p.buildingId)||e.action==='Move'&&e.trapped&&e.unit?.units_id===c.unitID&&e.unit?.units_players_id===viewerId;
   if(c.action==='Build')return e.action==='Build'&&e.newUnit?.units_players_id===viewerId&&e.newUnit?.units_x===p.x&&e.newUnit?.units_y===p.y&&e.newUnit?.units_name===p.name;
   return c.action==='End'&&e.action==='NextTurn'&&Number.isInteger(e.nextPId)&&e.nextPId!==viewerId;
  };
  try{
   socket=new Socket(`wss://awbw.amarriner.com/${branch}/game/${gameId}`,{origin:'https://awbw.amarriner.com',headers:{Cookie:cookie},handshakeTimeout:4000});
   socket.on('message',async bytes=>{
    if(finished||bytes.length>1000000)return;let body;try{body=JSON.parse(String(bytes));}catch{return;}
    const events=Object.values(body).filter(e=>e&&typeof e==='object'&&typeof e.action==='string'),joined=events.find(e=>e.action==='JoinRoom');
    if(joined&&!joining&&!sent){
     joining=true;if(joined.playerId!==viewerId){finish({status:'not-sent',message:'AWBW did not authenticate your player on this connection.'});return;}
     try{prepared=await beforeSend();if(finished)return;if(interference)throw new Error('AWBW updated during this preview.');
      const c=prepared.command;if(!['Move','Capt','Build','End','Fire'].includes(c.action)||(c.action==='Fire'?c.attacker?.playerID:c.playerID)!==viewerId)throw new Error('Unsupported order.');
      sent=true;socket.send(JSON.stringify(c));
     }catch(error){finish({status:sent?'uncertain':'not-sent',message:sent?'Connection interrupted while submitting. Check AWBW before continuing.':error.message});}return;
    }
    const actions=events.filter(e=>!['JoinRoom','LeaveRoom','ActivityUpdate','Ping','Sync'].includes(e.action));
    if(!sent){if(actions.length)interference=true;return;}
    if(body.err){finish({status:'rejected',message:'AWBW rejected this order. Refresh the battlefield.'});return;}
    const matched=actions.find(match);if(matched)finish({status:'observed',action:matched.action,trapped:!!matched.trapped,nativeUnitId:matched.newUnit?.units_id,position:matched.unit?{x:matched.unit.units_x,y:matched.unit.units_y}:undefined,message:matched.trapped?'AWBW reported a trapped movement. Review the updated position.':'AWBW returned the matching game event.'});
   });
   socket.on('error',()=>finish({status:sent?'uncertain':'not-sent',message:sent?'Connection interrupted after submission. Check AWBW before continuing.':'AWBW’s connection is unavailable.'}));
   socket.on('close',()=>finish({status:sent?'uncertain':'not-sent',message:sent?'Connection closed after submission. Check AWBW before continuing.':'AWBW closed the connection before submission.'}));
  }catch{finish({status:sent?'uncertain':'not-sent',message:'AWBW’s connection could not complete the order.'});}
 });
}
