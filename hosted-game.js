// Native AWBW map rendering and per-player reads through the hosted session.
// This module never submits a gameplay order.
export function createHostedGame({asset,registerArt,accept,message}){
 const gameId=new URLSearchParams(location.search).get('game');
 if(window.FC_EMBEDDED||!/^\d{1,12}$/.test(gameId||''))return null;
 let data=null,busy=false;
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
  return {format:'field-command-snapshot-v2',gameId:data.gameId,title:data.title,day:data.day,game:data.game,capturedAt:data.updatedAt,map:{width:data.width,height:data.height,layers,frame:canvas.toDataURL('image/png')},coverage:{renderedOnly:true,warning:'Your authenticated AWBW view. Hosted order transport is being connected.'}};
 }
 async function refresh(){
  if(busy)return;busy=true;message('Loading your AWBW battlefield…');
  try{
   const response=await fetch(`/api/awbw/account?action=game&gameId=${gameId}`,{credentials:'same-origin',cache:'no-store'}),body=await response.json();
   if(!response.ok){if(response.status===401)location.assign('/');throw new Error(body.message||'Could not read this game.');}
   const snapshot=await render(body);data=body;accept(snapshot);message('Your AWBW battlefield is open. Hosted orders are being connected.');
  }catch(error){message(error.message);}
  finally{busy=false;}
 }
 return {refresh,get data(){return data;},get busy(){return busy;},tile(x,y){return data?.terrainDetails[y*data.width+x];}};
}
