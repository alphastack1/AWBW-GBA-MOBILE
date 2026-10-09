import {parseHTML} from 'linkedom';
import {createHash} from 'node:crypto';
import baseDamageValues from '../vendor/awbw-damage.json' with {type:'json'};

// Read only the JSON declarations used by AWBW's official page. Never execute
// upstream HTML or inline JavaScript in the account service.
export function declaration(source,name,optional=false){
 const pattern=new RegExp('^\\s*(?:const|let|var)\\s+'+name+'\\s*=\\s*','gm');
 const matches=[...source.matchAll(pattern)];
 if(matches.length!==1){if(optional&&matches.length===0)return null;throw new Error('Missing or ambiguous AWBW state: '+name);}
 const start=matches[0].index+matches[0][0].length;let end=start,quoted=false,escape=false,depth=0;
 const first=source[start];
 if(first==='{'||first==='['||first==='"'){
  for(;end<source.length;end++){
   const ch=source[end];
   if(quoted){if(escape)escape=false;else if(ch==='\\')escape=true;else if(ch==='"'){quoted=false;if(first==='"'){end++;break;}}continue;}
   if(ch==='"'){quoted=true;continue;}
   if(ch==='{'||ch==='[')depth++;
   if(ch==='}'||ch===']'){depth--;if(depth===0){end++;break;}}
  }
 }else{const value=/^(?:-?\d+(?:\.\d+)?|true|false|null)\b/.exec(source.slice(start));if(!value)throw new Error('Non-JSON AWBW state: '+name);end+=value[0].length;}
 if(!/^\s*;/.test(source.slice(end,end+20)))throw new Error('Non-JSON AWBW state: '+name);
 return JSON.parse(source.slice(start,end));
}
const number=(value,max)=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value))&&Number(value)>=0&&Number(value)<=max?Number(value):null;
const text=(value,max=40)=>typeof value==='string'?value.slice(0,max):'';
const country=value=>/^(?:aa|ab|ar|bd|bh|bm|ci|ge|gs|js|ne|os|pc|pl|rf|sc|tg|uw|wn|yc)$/.test(value)?value:null;
function gameSource(html){const {document}=parseHTML(html);const sources=[...document.querySelectorAll('script:not([src])')].map(s=>s.textContent).filter(s=>/^\s*const\s+gameId\s*=/m.test(s));if(sources.length!==1)throw new Error('Missing or ambiguous AWBW game state.');return sources[0];}
function weather(source){const match=source.match(/\bconst\s+gameWeather\s*=\s*\{\s*(?:"code"|code):\s*"([CSR])",\s*(?:"name"|name):\s*"(clear|rain|snow)"\s*\}\s*;/);if(!match||({C:'clear',R:'rain',S:'snow'})[match[1]]!==match[2])throw new Error('Unsupported AWBW weather.');return {code:match[1],name:match[2]};}

export function parseGamePage(html,{gameId,username,title}={}){
 const source=gameSource(html);
 if(!source||String(declaration(source,'gameId'))!==String(gameId))throw new Error('AWBW did not return this game.');
 const width=declaration(source,'maxX'),height=declaration(source,'maxY');
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>128||height>128)throw new Error('Unsupported AWBW map.');
 const viewer=declaration(source,'viewerPId'),players=declaration(source,'playersInfo'),current=declaration(source,'currentTurn');
 if(!declaration(source,'loggedIn')||!Number.isInteger(viewer)||viewer<1||!players?.[viewer]?.players_team||text(players?.[viewer]?.users_username,100).toLowerCase()!==username.toLowerCase())throw new Error('AWBW did not return your player view.');
 const rawTerrain=declaration(source,'terrainInfo'),rawBuildings=declaration(source,'buildingsInfo'),rawUnits=declaration(source,'unitsInfo');
 const gameFog=declaration(source,'gameFog'),fog=declaration(source,'fogInfo'),ended=declaration(source,'gameEndDate');
 const colors=declaration(source,'viewerColors',true)||{};
 if(gameFog==='Y'&&!ended&&(!fog||Array.from({length:width},(_,x)=>Array.from({length:height},(_,y)=>number(fog[x]?.[y],10000)!==null)).flat().includes(false)))throw new Error('AWBW visibility is incomplete.');
 const terrain={},buildings={},terrainDetails=[],ownBuildings=[];
 for(let x=0;x<width;x++){
  terrain[x]={};buildings[x]={};
  for(let y=0;y<height;y++){
   const t=rawTerrain[x]?.[y],b=rawBuildings[x]?.[y],id=b?.terrain_id??t?.terrain_id;
   if(!Number.isInteger(id)||id<1||id>1000)throw new Error('Incomplete AWBW terrain.');
   if(t)terrain[x][y]={terrain_id:t.terrain_id};
   if(b){buildings[x][y]={terrain_id:b.terrain_id};if(b.buildings_players_id===viewer)ownBuildings.push({id:b.buildings_id,owner:viewer,x,y,name:text(b.terrain_name)});}
   terrainDetails[y*width+x]={name:text(b?.terrain_name??t?.terrain_name)||'Terrain',defense:number(b?.terrain_defense??t?.terrain_defense,10)??0,capture:number(b?.buildings_capture,20),visible:gameFog!=='Y'||!!ended||fog[x][y]>=1};
  }
 }
 const carried=new Set(Object.values(rawUnits||{}).flatMap(u=>[u.units_cargo1_units_id,u.units_cargo2_units_id]).filter(Number.isInteger));
 const units=[];
 for(const u of Object.values(rawUnits||{})){
  const x=u.units_x,y=u.units_y,id=u.units_id,owner=u.units_players_id;
  if(![x,y,id,owner].every(Number.isInteger)||x<0||y<0||x>=width||y>=height||id<1||owner<1||carried.has(id))continue;
  const allied=players[owner]?.players_team===players[viewer].players_team;
  // Never return enemy units on fogged tiles or submerged/hidden units. The
  // server's page is already viewer-filtered; this adds a fail-closed filter.
  if(!allied&&(!terrainDetails[y*width+x].visible||u.units_sub_dive&&u.units_sub_dive!=='N'))continue;
  if(!/^[A-Za-z .-]{1,24}$/.test(u.units_name||''))continue;
  const army=country(colors[owner])||country(players[owner]?.countries_code);if(!army)continue;
  units.push({id,owner,x,y,name:u.units_name,army,hp:number(u.units_hit_points,10),fuel:number(u.units_fuel,999),ammo:number(u.units_ammo,99),move:number(u.units_movement_points,128),minRange:number(u.units_short_range,20),maxRange:number(u.units_long_range,20),cost:number(u.units_cost,1000000000),spent:u.units_moved===1});
 }
 const p=players[viewer],co=text(p.co_name,24);
 return {format:'field-command-hosted-game-v1',gameId:String(gameId),title:text(title,100)||`AWBW #${gameId}`,day:number(declaration(source,'gameDay'),10000),width,height,terrain,buildings,terrainDetails,
  weather:weather(source).name,fog:terrainDetails.map(t=>!t.visible),
  game:{readOnly:true,canSendOrders:false,viewerPlayerId:viewer,currentPlayerId:current,funds:number(p.players_funds,1000000000),income:number(p.players_income,1000000000),units,buildings:ownBuildings},
  commander:{name:co,country:text(p.countries_name,30),army:country(colors[viewer])||country(p.countries_code),power:number(p.players_co_power,1e10),maxPower:number(p.players_co_max_power,1e10),maxSuperPower:number(p.players_co_max_spower,1e10)},
  updatedAt:new Date().toISOString()};
}

// Server-only state. These native player/unit records never enter an API reply.
export function parseGameContext(html,options){
 const data=parseGamePage(html,options),source=gameSource(html),context={data,gameId:data.gameId,maxX:data.width,maxY:data.height,viewerPId:data.game.viewerPlayerId,currentTurn:data.game.currentPlayerId,gameWeather:weather(source),baseDamageValues};
 for(const key of ['terrainInfo','buildingsInfo','unitsInfo','playersInfo','fogInfo','genericUnits','moveCosts','freezeGame','gameEndDate','banUnits','labUnits','grantedVisions','clientLastUpdated','GAME_FLAGS__KINDLE_SCOP'])context[key]=declaration(source,key,true);
 for(const key of ['genericUnits','moveCosts','playersInfo','terrainInfo','buildingsInfo','unitsInfo'])if(!context[key]||typeof context[key]!=='object')throw new Error('AWBW rule data is incomplete: '+key);
 // Retain only the entitled visible units, including the same fail-closed fog,
 // submerged-enemy and cargo filtering used in the public response.
 const ids=new Set(data.game.units.map(u=>u.id));context.unitsInfo=Object.fromEntries(Object.entries(context.unitsInfo).filter(([,u])=>ids.has(u.units_id)));
 context.unitMap={};for(const u of Object.values(context.unitsInfo)){context.unitMap[u.units_x]??={};context.unitMap[u.units_x][u.units_y]={units_id:u.units_id,team:context.playersInfo[u.units_players_id]?.players_team};}
 context.grantedVisions??=[];if(!Array.isArray(context.grantedVisions))throw new Error('Unsupported AWBW shared vision.');context.banUnits??={};context.labUnits??={};
 const playersVersion=Object.entries(context.playersInfo).map(([id,p])=>[id,p.players_team,p.players_funds,p.co_name,p.players_co_id,p.players_co_power_on,p.players_co_power,p.numProperties,p.cities,p.labs,p.towers]);
 context.version=createHash('sha256').update(JSON.stringify([context.maxX,context.maxY,context.currentTurn,data.day,context.clientLastUpdated,context.gameWeather,playersVersion,context.unitsInfo,context.buildingsInfo,context.terrainInfo,context.fogInfo,context.moveCosts,context.genericUnits,context.banUnits,context.labUnits])).digest('hex');
 return context;
}
