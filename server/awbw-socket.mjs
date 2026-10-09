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
