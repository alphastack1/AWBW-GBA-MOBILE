// Adapter for the reviewed official frontend. No guessed terrain/combat rules.
export function createOfficialAdapter(w, {observed, visibleUnits, result}) {
 const viewer=()=>typeof w.getViewerPId==='function'?w.getViewerPId():null;
 const buildingList=()=>Object.values(w.buildingsInfo||{}).flatMap(column=>Object.values(column||{}));
 function state(){
  const player=viewer(),width=w.maxX,height=w.maxY;
  let reason='';
  if(!Number.isInteger(player)||player<=0||w.currentTurn!==player)reason='It is not your active AWBW turn.';
  else if(!w.webSocket||!observed.has(w.webSocket)||w.webSocket.readyState!==1)reason='AWBW’s observed connection is not ready. Reload the AWBW tab.';
  else if(w.gameEndDate||w.freezeGame!==false)reason='Game ended or replay mode is active.';
  else if(w.ongoingAction!==false||!Array.isArray(w.actionQueue)||w.actionQueue.length)reason='Wait for AWBW to finish updating the board.';
  else if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>128||height>128||!w.unitsInfo||!w.playersInfo?.[player]||!Number.isFinite(Number(w.playersInfo[player].players_funds)))reason='Official game state is incomplete.';
  else if(!['emitData','getMovementTiles','findShortestPath','checkTargetTile','findCostMultiplier'].every(k=>typeof w[k]==='function'))reason='AWBW’s rule helpers changed; this version cannot submit orders.';
  const ownUnits=Object.values(w.unitsInfo||{}).filter(u=>u.units_players_id===player).map(u=>[u.units_id,u.units_x,u.units_y,u.units_moved,u.units_fuel,u.units_hit_points,u.units_ammo]);
  const ownBuildings=buildingList().filter(b=>b.buildings_players_id===player).map(b=>[b.buildings_id,b.buildings_x,b.buildings_y,b.buildings_capture]);
  return {available:!reason,reason,version:JSON.stringify([w.currentTurn,w.gameDay,w.clientLastUpdated,w.playersInfo?.[player]?.players_funds,ownUnits,ownBuildings])};
 }
 function at(x,y){if(!Number.isInteger(x)||!Number.isInteger(y)||x<0||y<0||x>=w.maxX||y>=w.maxY)throw new Error('Tile is outside the AWBW map.');}
 function prepare(input){
  if(!input||typeof input!=='object')throw new Error('Invalid preview request.');
  const player=viewer(),ready=state();if(!ready.available)throw new Error(ready.reason);
  if(input.kind==='end')return {preview:{kind:'end',summary:'End your real AWBW turn'},choices:[{key:'End',label:'End AWBW turn',command:{action:'End',playerID:player},expected:{}}]};
  if(input.kind==='build'){
   at(input.x,input.y);const b=w.buildingsInfo?.[input.x]?.[input.y],p=w.playersInfo[player];
   if(!b||b.buildings_players_id!==player||w.unitMap?.[input.x]?.[input.y])throw new Error('Choose an empty production property you own.');
   const name=b.terrain_name,types=/Base/.test(name)||(/City/.test(name)&&p.co_name==='Hachi'&&p.players_co_power_on==='S')?['F','B','T','W','P']:/Airport/.test(name)?['A']:/Port/.test(name)?['L','S']:null;
   if(!types||!w.genericUnits)throw new Error('This property cannot build units.');
   const multiplier=w.findCostMultiplier(player),funds=Number(p.players_funds);if(!Number.isFinite(multiplier)||multiplier<=0)throw new Error('Unknown AWBW purchase cost.');
   const choices=[];
   for(const [key,u] of Object.entries(w.genericUnits)){
    if(w.banUnits?.[key]||!types.includes(u.units_movement_type)||w.labUnits?.[key]&&p.labs===0||w.labUnits?.[u.units_name]&&p.labs===0)continue;
    const cost=u.units_cost*multiplier;
    if(!Number.isInteger(u.units_id)||u.units_id<=0||!Number.isFinite(cost)||cost<0||cost>funds||typeof u.units_name!=='string'||!/^[A-Za-z .-]{1,24}$/.test(u.units_name))continue;
    choices.push({key:`Build:${u.units_id}`,label:`${u.units_name} · ${cost.toLocaleString()} G`,command:{action:'Build',playerID:player,unitID:u.units_id,buildingID:b.buildings_id},expected:{x:input.x,y:input.y,name:u.units_name,cost}});
   }
   choices.sort((a,b)=>a.expected.cost-b.expected.cost);
   return {preview:{kind:'build',x:input.x,y:input.y,summary:`Build at tile ${input.x+1}, ${input.y+1}`},choices};
  }
  if(input.kind!=='unit'||!Number.isInteger(input.unitId))throw new Error('Unsupported order.');
  const u=w.unitsInfo[input.unitId];
  if(!u||u.units_players_id!==player||u.units_moved!==0||!visibleUnits().some(v=>v.id===input.unitId))throw new Error('Select a visible, ready unit you own.');
  const old=w.currentClick;
  try {
   w.currentClick={info:u,path:[u.units_y*w.maxX+u.units_x]};
   const solved=w.getMovementTiles(w.maxX,w.maxY,u.units_movement_type,Math.min(u.units_movement_points,u.units_fuel),{x:u.units_x,y:u.units_y},w.playersInfo[player].players_team,w.playersInfo[player],false);
   if(!Array.isArray(solved?.dist)||solved.dist.length!==w.maxX*w.maxY)throw new Error('Unexpected AWBW movement result.');
   const reachable=[];solved.dist.forEach((d,n)=>{const x=n%w.maxX,y=Math.floor(n/w.maxX),occupant=w.unitMap?.[x]?.[y];if(Number.isFinite(d)&&(!occupant||occupant.units_id===u.units_id))reachable.push(n);});
   const preview={kind:'unit',unitId:u.units_id,name:u.units_name,from:{x:u.units_x,y:u.units_y},reachable,summary:`Select a destination for ${u.units_name}`};
   if(input.x===undefined&&input.y===undefined)return {preview,choices:[]};
   at(input.x,input.y);if(!reachable.includes(input.y*w.maxX+input.x))throw new Error('That destination is not offered by AWBW.');
   const path=w.findShortestPath(solved,input.y*w.maxX+input.x);
   if(!Array.isArray(path)||!path.length||path[0]!==u.units_y*w.maxX+u.units_x||path.at(-1)!==input.y*w.maxX+input.x||path.length>w.maxX*w.maxY||path.some((n,i)=>!Number.isInteger(n)||n<0||n>=w.maxX*w.maxY||(i&&Math.abs(n%w.maxX-path[i-1]%w.maxX)+Math.abs(Math.floor(n/w.maxX)-Math.floor(path[i-1]/w.maxX))!==1)))throw new Error('This path needs original AWBW controls (for example, teleport movement).');
   w.currentClick.path=path;
   const options=w.checkTargetTile(input.x,input.y),choices=[];
   for(const [option,action,label] of [['Wait','Move','Wait'],['Capt','Capt','Capture']]){
    if(!options?.some(o=>o.option===option&&o.clickable===true))continue;
    const b=w.buildingsInfo?.[input.x]?.[input.y];
    choices.push({key:action,label,command:{action,path,playerID:player,unitID:u.units_id},expected:{x:input.x,y:input.y,...(action==='Capt'?{buildingId:b?.buildings_id}: {})}});
   }
   return {preview:{...preview,x:input.x,y:input.y,path,summary:`${u.units_name}: tile ${u.units_x+1}, ${u.units_y+1} → ${input.x+1}, ${input.y+1}`},choices};
  } finally {w.currentClick=old;}
 }
 return {state,prepare,socket:()=>w.webSocket,send:command=>w.emitData(w.webSocket,command),result};
}
