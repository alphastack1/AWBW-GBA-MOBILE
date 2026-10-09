import {createNativeRules} from './awbw-native-rules.mjs';

export function inspectUnit(context,unitId){
 const unit=context.unitsInfo[unitId];
 if(!Number.isInteger(unitId)||!unit)throw new Error('Choose a visible unit.');
 const player=context.playersInfo[unit.units_players_id],mp=unit.units_movement_points,fuel=unit.units_fuel;
 if(!player?.players_team||!Number.isInteger(mp)||mp<0||mp>128||!Number.isFinite(fuel)||fuel<0||!context.genericUnits[unit.units_name])throw new Error('AWBW movement data is incomplete.');
 const rules=createNativeRules(context);rules.currentClick={info:unit,path:[unit.units_y*context.maxX+unit.units_x]};
 const solved=rules.getMovementTiles(context.maxX,context.maxY,unit.units_movement_type,Math.min(mp,fuel),{x:unit.units_x,y:unit.units_y},player.players_team,player,false);
 const reachable=[];solved.dist.forEach((cost,n)=>{const occupant=context.unitMap[n%context.maxX]?.[Math.floor(n/context.maxX)];if(Number.isFinite(cost)&&(!occupant||occupant.units_id===unitId))reachable.push(n);});
 const attackRange=new Set(),targets=new Set(),direct=unit.units_short_range<=1,min=direct?1:unit.units_short_range,max=direct?1:unit.units_long_range;
 if(!Number.isInteger(min)||!Number.isInteger(max)||min<1||max<min||max>20)throw new Error('AWBW attack data is incomplete.');
 const genericId=context.genericUnits[unit.units_name].units_id,damage=context.baseDamageValues;
 const armed=unit.units_ammo>0&&Object.values(damage.ATTACK1[genericId]||{}).some(n=>n>0)||Object.values(damage.ATTACK2[genericId]||{}).some(n=>n>0);
 for(const n of direct?reachable:[unit.units_y*context.maxX+unit.units_x]){
  const x=n%context.maxX,y=Math.floor(n/context.maxX);
  if(armed)for(let dx=-max;dx<=max;dx++)for(let dy=-max;dy<=max;dy++){const d=Math.abs(dx)+Math.abs(dy),ax=x+dx,ay=y+dy;if(d>=min&&d<=max&&ax>=0&&ay>=0&&ax<context.maxX&&ay<context.maxY)attackRange.add(ay*context.maxX+ax);}
  for(const target of rules.findUnitsInRangeOf(x,y,unit))if(context.unitsInfo[target.units_id])targets.add(target.units_id);
 }
 return {unit,rules,solved,public:{unitId,version:context.version,reachable,attackRange:[...attackRange],targets:[...targets],currentTargets:rules.findUnitsInRangeOf(unit.units_x,unit.units_y,unit).filter(u=>context.unitsInfo[u.units_id]).map(u=>u.units_id),move:mp,minRange:min,maxRange:max,cost:unit.units_cost,readOnly:true}};
}

export function prepareOrder(context,input){
 if(!input||typeof input!=='object'||Array.isArray(input)||!['unit','build','end'].includes(input.kind))throw new Error('Choose a supported order.');
 const player=context.viewerPId,p=context.playersInfo[player];
 if(context.currentTurn!==player)throw new Error('It is not your active AWBW turn.');
 if(context.freezeGame!==false||context.gameEndDate)throw new Error('This game cannot accept orders.');
 const at=(x,y)=>{if(!Number.isInteger(x)||!Number.isInteger(y)||x<0||y<0||x>=context.maxX||y>=context.maxY)throw new Error('Choose a tile inside the map.');};
 if(input.kind==='end')return {preview:{kind:'end',summary:'End your AWBW turn'},choices:[{key:'End',label:'End turn',command:{action:'End',playerID:player},expected:{}}]};
 if(input.kind==='build'){
  at(input.x,input.y);const b=context.buildingsInfo[input.x]?.[input.y];
  if(!b||!Number.isInteger(b.buildings_id)||b.buildings_id<1||b.buildings_players_id!==player||context.unitMap[input.x]?.[input.y])throw new Error('Choose an empty production property you own.');
  const types=/Base/.test(b.terrain_name)||/City/.test(b.terrain_name)&&p.co_name==='Hachi'&&p.players_co_power_on==='S'?['F','B','T','W','P']:/Airport/.test(b.terrain_name)?['A']:/Port/.test(b.terrain_name)?['L','S']:[];
  const multiplier=createNativeRules(context).findCostMultiplier(player),funds=p.players_funds;
  if(!Number.isFinite(funds)||!Number.isFinite(multiplier)||multiplier<=0)throw new Error('AWBW purchase data is incomplete.');
  const choices=[];
  for(const [key,u]of Object.entries(context.genericUnits)){
   if(context.banUnits[key]||!types.includes(u.units_movement_type)||context.labUnits[key]&&p.labs===0||context.labUnits[u.units_name]&&p.labs===0)continue;
   const cost=u.units_cost*multiplier;if(!Number.isInteger(u.units_id)||!Number.isFinite(cost)||cost<0||cost>funds)continue;
   choices.push({key:`Build:${u.units_id}`,label:`${u.units_name} · ${cost.toLocaleString()} G`,command:{action:'Build',playerID:player,unitID:u.units_id,buildingID:b.buildings_id},expected:{x:input.x,y:input.y,name:u.units_name,cost}});
  }
  choices.sort((a,b)=>a.expected.cost-b.expected.cost);
  return {preview:{kind:'build',x:input.x,y:input.y,summary:'Build a unit'},choices};
 }
 const inspected=inspectUnit(context,input.unitId),{unit,rules,solved}=inspected;
 if(unit.units_players_id!==player||unit.units_moved!==0)throw new Error('Choose a ready unit you own.');
 const preview={kind:'unit',unitId:input.unitId,name:unit.units_name,from:{x:unit.units_x,y:unit.units_y},...inspected.public,summary:'Choose a destination'};
 if(input.x===undefined&&input.y===undefined)return {preview,choices:[]};
 at(input.x,input.y);if(!preview.reachable.includes(input.y*context.maxX+input.x))throw new Error('That tile is outside this unit’s available movement.');
 const path=rules.findShortestPath(solved,input.y*context.maxX+input.x);
 if(!path.length||path[0]!==unit.units_y*context.maxX+unit.units_x||path.at(-1)!==input.y*context.maxX+input.x||path.length>context.maxX*context.maxY||path.some((n,i)=>!Number.isInteger(n)||n<0||n>=context.maxX*context.maxY||i&&Math.abs(n%context.maxX-path[i-1]%context.maxX)+Math.abs(Math.floor(n/context.maxX)-Math.floor(path[i-1]/context.maxX))!==1))throw new Error('This path requires AWBW’s original controls.');
 rules.currentClick.path=path;
 const choices=[],options=rules.checkTargetTile(input.x,input.y)||[];
 if(input.defenderId!==undefined){
  const defender=context.unitsInfo[input.defenderId];
  if(!Number.isInteger(input.defenderId)||!defender||!options.some(o=>o.option==='Fire'&&o.clickable)||!rules.findUnitsInRangeOf(input.x,input.y,unit).some(u=>u.units_id===input.defenderId))throw new Error('Choose an available visible attack target.');
  return {preview:{...preview,x:input.x,y:input.y,path,targets:[input.defenderId],summary:`${unit.units_name} → ${defender.units_name}`},choices:[{key:'Fire',label:'Fire',command:{action:'Fire',attacker:{playerID:player,unitID:unit.units_id,path:unit.units_short_range>1?[]:path},defender:{playerID:defender.units_players_id,unitID:defender.units_id}},expected:{x:input.x,y:input.y,defenderId:input.defenderId}}]};
 }
 for(const [option,action,label]of [['Wait','Move','Wait'],['Capt','Capt','Capture']])if(options.some(o=>o.option===option&&o.clickable))choices.push({key:action,label,command:{action,path,playerID:player,unitID:unit.units_id},expected:{x:input.x,y:input.y,...(action==='Capt'?{buildingId:context.buildingsInfo[input.x][input.y].buildings_id}:{})}});
 return {preview:{...preview,x:input.x,y:input.y,path,summary:`${unit.units_name} → ${input.x+1}:${input.y+1}`,targets:options.some(o=>o.option==='Fire'&&o.clickable)?rules.findUnitsInRangeOf(input.x,input.y,unit).filter(u=>context.unitsInfo[u.units_id]).map(u=>u.units_id):[]},choices};
}

export async function forecast(context,input,calculate){
 if(!input||typeof input!=='object'||!Number.isInteger(input.attackerId)||!Number.isInteger(input.defenderId))throw new Error('Choose two visible units.');
 const inspected=inspectUnit(context,input.attackerId),{unit,public:info}=inspected,defender=context.unitsInfo[input.defenderId];
 if(unit.units_players_id!==context.viewerPId||!defender||context.playersInfo[defender.units_players_id].players_team===context.playersInfo[context.viewerPId].players_team)throw new Error('Choose your unit and a visible enemy.');
 const x=input.x??unit.units_x,y=input.y??unit.units_y;
 if(!Number.isInteger(x)||!Number.isInteger(y)||!info.reachable.includes(y*context.maxX+x)||x<0||y<0||x>=context.maxX||y>=context.maxY||unit.units_short_range>1&&(x!==unit.units_x||y!==unit.units_y))throw new Error('Choose an available firing position.');
 if(!inspected.rules.findUnitsInRangeOf(x,y,unit).some(u=>u.units_id===defender.units_id))throw new Error('This target is outside the unit’s available attack.');
 const rules=createNativeRules(context,{post:async(path,body)=>{
  if(path!=='api/calculator/calculate_new.php')throw new Error('Unsupported calculator request.');return {data:await calculate(body)};
 }});
 // AWBW's helper tests endTile for truthiness. A boxed zero preserves the
 // actual top-left firing tile through that check and the helper's arithmetic.
 const endTile=y*context.maxX+x,response=await rules.calculateDamage(unit,defender,endTile===0?Object(0):endTile),body=response.data;
 const damage={min:body.minInfo?.percent,max:body.maxInfo?.percent},counter={min:body.minCounterInfo?body.minCounterInfo.minLuck?.counterPercent:0,max:body.maxCounterInfo?body.maxCounterInfo.maxLuck?.counterPercent:0};
 for(const range of [damage,counter])if(!Number.isFinite(range.min)||!Number.isFinite(range.max)||range.min<0||range.max<range.min||range.max>10000)throw new Error('AWBW’s damage response changed.');
 return {attackerId:unit.units_id,defenderId:defender.units_id,x,y,damage,counter,source:'AWBW calculator',version:context.version,readOnly:true};
}
