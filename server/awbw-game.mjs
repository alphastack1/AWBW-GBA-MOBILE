import {parseHTML} from 'linkedom';

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

export function parseGamePage(html,{gameId,username,title}={}){
 const {document}=parseHTML(html);
 const source=[...document.querySelectorAll('script:not([src])')].map(s=>s.textContent).find(s=>/^\s*const\s+gameId\s*=/m.test(s));
 if(!source||String(declaration(source,'gameId'))!==String(gameId))throw new Error('AWBW did not return this game.');
 const width=declaration(source,'maxX'),height=declaration(source,'maxY');
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>128||height>128)throw new Error('Unsupported AWBW map.');
 const viewer=declaration(source,'viewerPId'),players=declaration(source,'playersInfo'),current=declaration(source,'currentTurn');
 if(!declaration(source,'loggedIn')||!Number.isInteger(viewer)||viewer<1||text(players?.[viewer]?.users_username,100).toLowerCase()!==username.toLowerCase())throw new Error('AWBW did not return your player view.');
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
   terrainDetails[y*width+x]={name:text(b?.terrain_name??t?.terrain_name)||'Terrain',defense:number(b?.terrain_defense??t?.terrain_defense,10)??0,visible:gameFog!=='Y'||!!ended||fog[x][y]>=1};
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
  units.push({id,owner,x,y,name:u.units_name,army,hp:number(u.units_hit_points,10),fuel:number(u.units_fuel,999),ammo:number(u.units_ammo,99),spent:u.units_moved===1});
 }
 const p=players[viewer],co=text(p.co_name,24);
 return {format:'field-command-hosted-game-v1',gameId:String(gameId),title:text(title,100)||`AWBW #${gameId}`,day:number(declaration(source,'gameDay'),10000),width,height,terrain,buildings,terrainDetails,
  weather:source.match(/\bconst\s+gameWeather\s*=\s*\{\s*(?:"code"|code):\s*"[CSR]",\s*(?:"name"|name):\s*"(clear|rain|snow)"\s*\}\s*;/)?.[1]||'clear',fog:terrainDetails.map(t=>!t.visible),
  game:{readOnly:true,canSendOrders:false,viewerPlayerId:viewer,currentPlayerId:current,funds:number(p.players_funds,1000000000),units,buildings:ownBuildings},
  commander:{name:co,country:text(p.countries_name,30),army:country(colors[viewer])||country(p.countries_code),power:number(p.players_co_power,1e10),maxPower:number(p.players_co_max_power,1e10),maxSuperPower:number(p.players_co_max_spower,1e10)},
  updatedAt:new Date().toISOString()};
}
