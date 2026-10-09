import test from 'node:test';
import assert from 'node:assert/strict';
import {createOrderGate} from '../live-orders.js';
import {createOfficialAdapter} from '../awbw-orders.js';

function fixture(){
 let time=0,sequence=0;const socket={},results=[],sent=[];
 const state={available:true,version:'day-11'};
 const command={action:'Move',path:[147,148,149],playerID:7,unitID:11};
 const prepared={preview:{kind:'unit',summary:'Move preview'},choices:[{key:'Move',label:'Wait',command,expected:{x:2,y:7}}]};
 const adapter={state:()=>state,socket:()=>socket,prepare:()=>structuredClone(prepared),result:r=>results.push(r),send:c=>{sent.push(c);gate.observe(socket,'outgoing',c);}};
 const gate=createOrderGate(adapter,{now:()=>time,id:()=>`preview-${++sequence}`});
 return {gate,socket,state,prepared,sent,results,adapter,advance:ms=>time+=ms,plan:()=>gate.plan({kind:'unit',unitId:11}),commit:token=>gate.commit({requestId:'request-0001',token,choice:'Move'})};
}
test('active bridge and official player state are required for previews',()=>{
 const f=fixture();assert.throws(f.plan,/disabled/);f.gate.enable(true);f.state.available=false;f.state.reason='Not your turn';assert.throws(f.plan,/Not your turn/);assert.equal(f.sent.length,0);
});
test('preview sends nothing; selecting an order sends once; matching raw event resolves it',()=>{
 const f=fixture();f.gate.enable(true);const p=f.plan();assert.equal(f.sent.length,0);f.commit(p.token);assert.equal(f.sent.length,1);assert.throws(()=>f.commit(p.token),/Duplicate/);
 assert.throws(f.plan,/already waiting/);f.gate.observe(f.socket,'incoming',{Move:{action:'Move',unit:{units_id:99,units_players_id:7}}});assert.equal(f.gate.status().busy,true);
 f.gate.observe(f.socket,'incoming',{Move:{action:'Move',unit:{units_id:11,units_players_id:7},trapped:true}});assert.equal(f.gate.status().busy,false);assert.match(f.results.at(-1).message,/trapped/);
});
test('stale versions, changed costs/rules, unoffered commands, expiration and revocation block send',()=>{
 for(const change of ['version','rules','choice','expired','disabled','native']){
  const f=fixture();f.gate.enable(true);const p=f.plan();let choice='Move';
  if(change==='version')f.state.version='day-12';
  if(change==='rules')f.prepared.choices[0].command.path=[147,148];
  if(change==='choice')choice='Fire';
  if(change==='expired')f.advance(60001);
  if(change==='disabled')f.gate.enable(false);
  if(change==='native')f.gate.observe(f.socket,'outgoing',{action:'Capt'});
  assert.throws(()=>f.gate.commit({requestId:'request-0001',token:p.token,choice}));assert.equal(f.sent.length,0,change);
 }
});
test('connection loss and timeout lock further orders, including after toggling enable',()=>{
 for(const fail of ['close','timeout','throw']){
  const f=fixture();f.gate.enable(true);const p=f.plan();
  if(fail==='throw')f.adapter.send=()=>{throw new Error('socket failure');};
  f.commit(p.token);if(fail==='close')f.gate.disconnect(f.socket);if(fail==='timeout')f.advance(15001);
  assert.equal(f.gate.status().locked,true);f.gate.enable(false);f.gate.enable(true);assert.throws(f.plan,/uncertain/);assert.equal(f.results.at(-1).status,'uncertain');assert.equal(f.sent.length,fail==='throw'?0:1);
 }
});
test('server rejection is distinguished from connection failure; no automatic resend',()=>{
 const f=fixture();f.gate.enable(true);f.commit(f.plan().token);f.gate.observe(f.socket,'incoming',{err:true,message:'private raw server message'});assert.equal(f.gate.status().busy,false);assert.equal(f.results.at(-1).status,'rejected');assert.equal(f.sent.length,1);assert.ok(!JSON.stringify(f.results).includes('private'));
});
test('unrelated sockets and passive events do not invalidate a preview',()=>{
 const f=fixture();f.gate.enable(true);const p=f.plan();f.gate.observe({},'incoming',{Move:{action:'Move'}});f.gate.observe(f.socket,'incoming',{ActivityUpdate:{action:'ActivityUpdate'}});f.commit(p.token);assert.equal(f.sent.length,1);
});
test('an overlapping native order prevents ambiguous correlation and locks on timeout',()=>{
 const f=fixture();f.gate.enable(true);f.commit(f.plan().token);f.gate.observe(f.socket,'outgoing',{action:'End',playerID:7});f.gate.observe(f.socket,'incoming',{Move:{action:'Move',unit:{units_id:11,units_players_id:7}}});f.gate.observe(f.socket,'incoming',{err:true});assert.equal(f.gate.status().busy,true);f.advance(15001);assert.equal(f.gate.status().locked,true);
});
test('build, capture and end events must match the planned identity or tile',()=>{
 const cases=[
  {command:{action:'Capt',playerID:7,unitID:11,path:[213]},expected:{x:3,y:10},event:{action:'Capt',buildingInfo:{buildings_x:3,buildings_y:10}}},
  {command:{action:'Build',playerID:7,unitID:13,buildingID:50},expected:{x:4,y:5,name:'Tank'},event:{action:'Build',newUnit:{units_players_id:7,units_x:4,units_y:5,units_name:'Tank'}}},
  {command:{action:'End',playerID:7},expected:{},event:{action:'NextTurn',nextPId:8}}
 ];
 for(const c of cases){const f=fixture();f.prepared.choices=[{key:c.command.action,label:'Order',...c}];f.gate.enable(true);const p=f.plan();f.gate.commit({requestId:'request-0001',token:p.token,choice:c.command.action});f.gate.observe(f.socket,'incoming',{event:{...c.event,...(c.command.action==='End'?{nextPId:7}:c.command.action==='Capt'?{buildingInfo:{buildings_x:9,buildings_y:9}}:{newUnit:{...c.event.newUnit,units_players_id:8}})}});assert.equal(f.gate.status().busy,true);f.gate.observe(f.socket,'incoming',{event:c.event});assert.equal(f.results.at(-1).status,'observed');}
});

function official(){
 const w={getViewerPId:()=>7,currentTurn:7,maxX:21,maxY:19,gameDay:11,clientLastUpdated:123,freezeGame:false,ongoingAction:false,actionQueue:[],gameEndDate:null,webSocket:{readyState:1},unitsInfo:{11:{units_id:11,units_players_id:7,units_x:0,units_y:7,units_moved:0,units_fuel:99,units_movement_points:3,units_name:'Infantry',units_movement_type:'F'}},playersInfo:{7:{players_funds:10000,players_team:'A',labs:0}},unitMap:{},buildingsInfo:{2:{7:{buildings_id:50,buildings_players_id:8,buildings_x:2,buildings_y:7,terrain_name:'City',buildings_team:'B'}}},currentClick:{sentinel:'original selection'},genericUnits:{Tank:{units_id:13,units_name:'Tank',units_movement_type:'T',units_cost:7000},Infantry:{units_id:1,units_name:'Infantry',units_movement_type:'F',units_cost:1000}},findCostMultiplier:()=>1,emitData:()=>{throw new Error('preview must not send');},getMovementTiles(...args){assert.equal(args[7],false);assert.equal(this.currentClick.info.units_id,11);const dist=Array(399).fill(Infinity);dist[147]=0;dist[148]=1;dist[149]=2;return{dist};},findShortestPath:()=>[147,148,149],checkTargetTile:()=>[{option:'Wait',clickable:true},{option:'Capt',clickable:true}]};
 const observed=new WeakSet([w.webSocket]);const adapter=createOfficialAdapter(w,{observed,visibleUnits:()=>[{id:11}],result:()=>{}});return {w,adapter};
}
test('official rule helpers determine paths/capture, restoring the original selection',()=>{
 const {w,adapter}=official(),old=w.currentClick;const p=adapter.prepare({kind:'unit',unitId:11,x:2,y:7});assert.deepEqual(p.choices[0].command,{action:'Move',path:[147,148,149],playerID:7,unitID:11});assert.equal(p.choices[1].command.action,'Capt');assert.equal(w.currentClick,old);
 w.getMovementTiles=()=>{throw new Error('changed rule helper');};assert.throws(()=>adapter.prepare({kind:'unit',unitId:11}));assert.equal(w.currentClick,old);
});
test('official adapter blocks enemy/spent units, replay, animations, queue, disconnect and unobserved socket',()=>{
 for(const flag of ['enemy','spent','replay','busy','queue','disconnect','socket','owner','helpers']){
  const {w,adapter}=official();
  if(flag==='enemy')w.unitsInfo[11].units_players_id=8;if(flag==='spent')w.unitsInfo[11].units_moved=1;
  if(flag==='replay')w.freezeGame=true;if(flag==='busy')w.ongoingAction=true;if(flag==='queue')w.actionQueue.push({});
  if(flag==='disconnect')w.webSocket.readyState=3;if(flag==='socket')w.webSocket={readyState:1};if(flag==='owner')w.currentTurn=8;if(flag==='helpers')delete w.findShortestPath;
  assert.throws(()=>adapter.prepare({kind:'unit',unitId:11}),undefined,flag);
 }
});
test('build offers respect original unit costs, CO multiplier, funds, bans, labs and occupancy',()=>{
 const {w,adapter}=official();w.buildingsInfo[2][7]={buildings_id:50,buildings_players_id:7,buildings_x:2,buildings_y:7,terrain_name:'Base'};
 assert.equal(adapter.prepare({kind:'build',x:2,y:7}).choices.length,2);w.playersInfo[7].players_funds=5000;assert.equal(adapter.prepare({kind:'build',x:2,y:7}).choices.length,1);
 w.findCostMultiplier=()=>2;w.playersInfo[7].players_funds=1000;assert.equal(adapter.prepare({kind:'build',x:2,y:7}).choices.length,0);
 w.findCostMultiplier=()=>1;w.playersInfo[7].players_funds=10000;w.banUnits={Tank:true};w.labUnits={Infantry:true};assert.equal(adapter.prepare({kind:'build',x:2,y:7}).choices.length,0);
 w.unitMap={2:{7:{units_id:11}}};assert.throws(()=>adapter.prepare({kind:'build',x:2,y:7}),/empty/);
});
test('invalid destinations, occupied cells and unsupported teleport paths cannot be sent',()=>{
 const {w,adapter}=official();assert.throws(()=>adapter.prepare({kind:'unit',unitId:11,x:21,y:7}),/outside/);
 w.unitMap={2:{7:{units_id:99}}};assert.throws(()=>adapter.prepare({kind:'unit',unitId:11,x:2,y:7}),/not offered/);w.unitMap={};
 w.findShortestPath=()=>[147,149];assert.throws(()=>adapter.prepare({kind:'unit',unitId:11,x:2,y:7}),/original AWBW/);
});
