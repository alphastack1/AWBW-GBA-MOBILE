// Native AWBW map rendering and per-player reads through the hosted session.
// Orders use signed server previews and a separate, single-submission endpoint.
export function createHostedGame({asset,registerArt,accept,message,settled}){
 const gameId=new URLSearchParams(location.search).get('game');
 if(window.FC_EMBEDDED||!/^\d{1,12}$/.test(gameId||''))return null;
 let data=null,busy=false,inspections=new Map(),csrf=null,forecast=null,generation=0;
 const $=s=>document.querySelector(s);
 const slug=name=>name.replaceAll(' ','').toLowerCase();
 async function render(data){
  if(!window.MapRenderer)throw new Error('Map renderer did not load. Refresh this page.');
  window.TS_spriteSheet=asset('terrain_spritesheet.png');
  const canvas=document.createElement('canvas');
  const renderer=new window.MapRenderer(data.terrain,data.width,data.height,{buildings:data.buildings,mapTheme:2,terrainPath:'terrain/aw1/',weather:data.weather,shoals:'new'});
  await renderer.getSpriteSheet();renderer.initCanvas(canvas);cancelAnimationFrame(renderer._animFrame);renderer._renderCanvas();
  const ctx=canvas.getContext('2d');
  for(const [x,column]of Object.entries(data.buildings))for(const [y,b]of Object.entries(column)){
   const name=window.TS_terrainIdToName[b.terrain_id],sprite=renderer._tileMap[name];
   if(sprite)ctx.drawImage(renderer._spriteSheet,sprite.x,sprite.y,sprite.w,sprite.h,+x*16,+y*16+16-sprite.h,sprite.w,sprite.h);
  }
  ctx.fillStyle='rgba(0,0,0,.3)';data.fog.forEach((hidden,n)=>{if(hidden)ctx.fillRect(n%data.width*16,Math.floor(n/data.width)*16,16,16);});
  const layers=data.game.units.map(unit=>{
   const filename=unit.army+slug(unit.name)+'.gif',source='https://awbw.amarriner.com/terrain/aw2/'+filename;
   registerArt(source,asset(filename)||`/api/awbw/art?army=${unit.army}&unit=${encodeURIComponent(slug(unit.name))}`);
   return {x:unit.x,y:unit.y,source,kind:'unit',width:16,height:16,opacity:1,filter:unit.spent?'grayscale(1) brightness(.65)':'',background:false};
  });
  return {format:'field-command-snapshot-v2',gameId:data.gameId,title:data.title,day:data.day,game:data.game,capturedAt:data.updatedAt,map:{width:data.width,height:data.height,layers,frame:canvas.toDataURL('image/png')},coverage:{renderedOnly:true,warning:'Your authenticated AWBW view. Order eligibility comes from the current server session.'}};
 }
 async function refresh({quiet=false}={}){
  if(busy)return;busy=true;if(!quiet)message('Loading your AWBW battlefield…');
  try{
   const response=await fetch(`/api/awbw/account?action=game&gameId=${gameId}`,{credentials:'same-origin',cache:'no-store'}),body=await response.json();
   if(!response.ok){if(response.status===401)location.assign('/?returnGame='+gameId);throw new Error(body.message||'Could not read this game.');}
   const snapshot=await render(body);data=body;generation++;inspections.clear();forecast=null;accept(snapshot);if(!quiet)message(body.capabilities?.available?'Your turn. Select a ready unit or production property.':body.capabilities?.reason||'Your AWBW battlefield is open.');
  }catch(error){generation++;inspections.clear();forecast=null;if(data)data.capabilities={...data.capabilities,available:false,reason:error.message};message(error.message);}
  finally{busy=false;settled?.();}
 }
 async function inspect(unitId){
  if(!data?.game.units.some(u=>u.id===unitId))throw new Error('Choose a visible unit.');
  if(inspections.has(unitId))return inspections.get(unitId);
  const version=generation,response=await fetch(`/api/awbw/account?action=inspect&gameId=${gameId}&unitId=${unitId}`,{credentials:'same-origin',cache:'no-store'}),body=await response.json();
  if(!response.ok){if(response.status===401)location.assign('/?returnGame='+gameId);throw new Error(body.message||'Could not inspect this unit.');}
  if(version!==generation)throw new Error('The battlefield refreshed. Select this unit again.');
  if(body.unitId!==unitId||!['reachable','attackRange','targets'].every(key=>Array.isArray(body[key])&&body[key].every(Number.isInteger)))throw new Error('AWBW inspection is incomplete.');
  inspections.set(unitId,body);return body;
 }
 async function post(action,input){
  if(!csrf){const r=await fetch('/api/awbw/account?action=session',{credentials:'same-origin',cache:'no-store'}),s=await r.json();if(!r.ok||!s.authenticated||!s.csrf){if(r.status===401||r.ok&&!s.authenticated)location.assign('/?returnGame='+gameId);throw new Error('Sign in again to continue.');}csrf=s.csrf;}
  const response=await fetch(`/api/awbw/account?action=${action}&gameId=${gameId}`,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','X-FC-CSRF':csrf},body:JSON.stringify(input)}),body=await response.json();
  if(!response.ok){if(response.status===401)location.assign('/?returnGame='+gameId);throw new Error(body.message||'AWBW could not complete this request.');}return body;
 }
 async function damage(attackerId,defenderId,position={}){
  const version=generation,body=await post('forecast',{attackerId,defenderId,...position});
  if(version!==generation)throw new Error('The battlefield refreshed. Choose a fresh target.');
  if(body.attackerId!==attackerId||body.defenderId!==defenderId)throw new Error('AWBW’s forecast is incomplete.');
  forecast=body;return body;
 }
 return {refresh,inspect,damage,plan:input=>post('plan',input),commit:input=>post('commit',input),clearForecast:()=>{forecast=null;},get forecast(){return forecast;},inspection:unitId=>inspections.get(unitId),get data(){return data;},get busy(){return busy;},tile(x,y){return data?.terrainDetails[y*data.width+x];}};
}
