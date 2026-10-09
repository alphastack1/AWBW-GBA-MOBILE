import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createHostedOrders} from '../server/hosted-orders.mjs';
import {submitSingleOrder} from '../server/awbw-socket.mjs';
import {parseGameContext} from '../server/awbw-game.mjs';
import {gamePage} from './fixtures/awbw-game.mjs';
const secret=Buffer.alloc(32,3).toString('base64'),session={username:'player',csrf:'fixture-csrf'},context=()=>{const c=parseGameContext(gamePage().replace('const currentTurn = 8;','const currentTurn = 7;'),{gameId:'123',username:'player'});return c;};
import {memoryStore} from './fixtures/command-store.mjs';

const delivering=async({beforeSend})=>{try{await beforeSend();return {status:'observed',submitted:true,message:'Fixture outcome'};}catch(error){return {status:'not-sent',submitted:false,message:error.message};}};
test('signed previews bind account/session, reject tampering/expiry and accept only native offered actions',async()=>{
 const store=memoryStore();let clock=1000,sends=0;const service=createHostedOrders({secret,storeFactory:()=>store,now:()=>clock,deliver:async options=>{const result=await delivering(options);sends+=result.submitted?1:0;return result;}}),c=context(),p=await service.plan(session,c,{kind:'unit',unitId:11,x:1,y:0,path:[999],command:{action:'End'}});
 await assert.rejects(service.commit({...session,username:'friend'},'123',{token:p.token,choice:'Move'},async()=>c));
 await assert.rejects(service.commit({...session,csrf:'other-login'},'123',{token:p.token,choice:'Move'},async()=>c));
 await assert.rejects(service.commit(session,'123',{token:p.token+'a',choice:'Move'},async()=>c));
 assert.equal(sends,0);clock=61001;await assert.rejects(service.commit(session,'123',{token:p.token,choice:'Move'},async()=>c));clock=1000;
 const invalid=await service.commit(session,'123',{token:p.token,choice:'End'},async()=>c);assert.equal(invalid.status,'not-sent');assert.equal(sends,0);
});
test('persistent gates prevent concurrent and duplicate submission across function instances',async()=>{
 const store=memoryStore(),c=context();let release,sends=0;const waiting=new Promise(resolve=>release=resolve),factory=()=>createHostedOrders({secret,storeFactory:()=>store,deliver:async options=>{await options.beforeSend();sends++;await waiting;Object.assign(c.unitsInfo[11],{units_x:1,units_y:0,units_moved:1});return {status:'observed',submitted:true};}});
 const one=factory(),two=factory(),a=await one.plan(session,c,{kind:'unit',unitId:11,x:1,y:0}),b=await two.plan(session,c,{kind:'unit',unitId:11,x:1,y:0});
 const first=one.commit(session,'123',{token:a.token,choice:'Move'},async()=>c),second=two.commit(session,'123',{token:b.token,choice:'Move'},async()=>c);await new Promise(resolve=>setImmediate(resolve));assert.equal(sends,1);release();const results=await Promise.all([first,second]);assert.deepEqual(results.map(r=>r.status).sort(),['not-sent','observed']);
 const consumed=results[0].status==='observed'?a:b;assert.equal((await one.commit(session,'123',{token:consumed.token,choice:'Move'},async()=>c)).duplicate,true);assert.equal(sends,1);assert.equal((await one.state(session,'123')).locked,false);
});
test('state is re-read immediately before sending; changed state never submits an order',async()=>{
 const c=context(),store=memoryStore();let sends=0;const service=createHostedOrders({secret,storeFactory:()=>store,deliver:async options=>{const result=await delivering(options);sends+=result.submitted?1:0;return result;}}),p=await service.plan(session,c,{kind:'unit',unitId:11,x:1,y:0});
 const result=await service.commit(session,'123',{token:p.token,choice:'Move'},async()=>({...c,version:'changed'}));assert.equal(result.status,'not-sent');assert.equal(sends,0);assert.equal((await service.state(session,'123')).locked,false);
});
test('an observed order waits for fresh battlefield data, then reconciles without resubmission or exposing private readback fields',async()=>{
 const store=memoryStore(),c=context();let sends=0;const factory=()=>createHostedOrders({secret,storeFactory:()=>store,deliver:async options=>{await options.beforeSend();sends++;return {status:'observed',submitted:true};}}),service=factory();
 const p=await service.plan(session,c,{kind:'unit',unitId:11,x:1,y:0}),result=await service.commit(session,'123',{token:p.token,choice:'Move'},async()=>c);
 assert.equal(result.status,'observed');assert.equal(result.readbackMatched,false);assert.equal(result.expected,undefined);assert.equal((await factory().state(session,'123',c)).locked,true);
 await assert.rejects(factory().plan(session,c,{kind:'end'}));
 Object.assign(c.unitsInfo[11],{units_x:1,units_y:0,units_moved:1});
 const state=await factory().state(session,'123',c);assert.equal(state.locked,false);assert.equal(state.reconciled,true);assert.equal(state.ordersSubmitted,1);
 const outcome=await factory().outcome(session,'123',result.nonce);assert.equal(outcome.readbackMatched,true);assert.equal(outcome.expected,undefined);
 const duplicate=await factory().commit(session,'123',{token:p.token,choice:'Move'},async()=>c);assert.equal(duplicate.duplicate,true);assert.equal(duplicate.readbackMatched,true);assert.equal(duplicate.expected,undefined);assert.equal(sends,1);
});
test('uncertain/crashed outcomes remain locked across time and new function instances',async()=>{
 const store=memoryStore(),c=context();let clock=1000,sends=0;const factory=()=>createHostedOrders({secret,storeFactory:()=>store,now:()=>clock,deliver:async options=>{await options.beforeSend();sends++;throw new Error('Interrupted after possible submission');}}),service=factory(),p=await service.plan(session,c,{kind:'unit',unitId:11,x:1,y:0});
 const result=await service.commit(session,'123',{token:p.token,choice:'Move'},async()=>c);assert.equal(result.status,'uncertain');clock+=3600000;Object.assign(c.unitsInfo[11],{units_x:1,units_y:0,units_moved:1});assert.equal((await factory().state(session,'123',c)).locked,true);await assert.rejects(factory().plan(session,c,{kind:'end'}));assert.equal(sends,1);
});
function socketFixture({playerId=7,onSend}={}){
 const sent=[];class Socket extends EventEmitter{constructor(){super();queueMicrotask(()=>this.emit('message',Buffer.from(JSON.stringify({JoinRoom:{action:'JoinRoom',playerId}}))));}send(frame){const command=JSON.parse(frame);sent.push(command);onSend?.(this,command);}terminate(){}}
 return {Socket,sent};
}
const socketInput={gameId:'123',branch:'node',viewerId:7,cookie:'upstream-fixture-session'};
test('single-order transport requires authenticated JoinRoom and sends exactly the native command once',async()=>{
 const c=context(),prepared={command:{action:'Move',playerID:7,unitID:11,path:[5,1]},expected:{x:1,y:0}},fixture=socketFixture({onSend:(socket,command)=>queueMicrotask(()=>socket.emit('message',Buffer.from(JSON.stringify({Move:{action:'Move',unit:{units_id:11,units_players_id:7,units_x:1,units_y:0}}}))))});
 const result=await submitSingleOrder({...socketInput,beforeSend:async()=>prepared},fixture.Socket);assert.equal(result.status,'observed');assert.equal(result.submitted,true);assert.deepEqual(fixture.sent,[prepared.command]);
 const anonymous=socketFixture({playerId:0});let preparedCalls=0;const denied=await submitSingleOrder({...socketInput,beforeSend:()=>{preparedCalls++;}},anonymous.Socket);assert.equal(denied.status,'not-sent');assert.equal(preparedCalls,0);assert.equal(anonymous.sent.length,0);
});
test('native capture/build/end acknowledgements match the selected outcome',async()=>{
 for(const [command,expected,event]of [[{action:'Capt',playerID:7,unitID:11,path:[5,1]},{x:1,y:0},{action:'Capt',buildingInfo:{buildings_x:1,buildings_y:0}}],[{action:'Build',playerID:7,unitID:1,buildingID:5},{x:0,y:0,name:'Infantry'},{action:'Build',newUnit:{units_players_id:7,units_x:0,units_y:0,units_name:'Infantry'}}],[{action:'End',playerID:7},{},{action:'NextTurn',nextPId:8}]]){
  const fixture=socketFixture({onSend:socket=>queueMicrotask(()=>socket.emit('message',Buffer.from(JSON.stringify({event}))))});assert.equal((await submitSingleOrder({...socketInput,beforeSend:async()=>({command,expected})},fixture.Socket)).status,'observed');assert.equal(fixture.sent.length,1);
 }
});
test('Fire matches exact attacker/defender and reports a trapped move without retrying combat',async()=>{
 const prepared={command:{action:'Fire',attacker:{playerID:7,unitID:11,path:[5]},defender:{playerID:8,unitID:13}},expected:{}};
 for(const [event,trapped]of [[{action:'Fire',attacker:{units_id:11,units_players_id:7},defender:{units_id:13}},false],[{action:'Move',trapped:true,unit:{units_id:11,units_players_id:7}},true]]){
  const fixture=socketFixture({onSend:socket=>queueMicrotask(()=>socket.emit('message',Buffer.from(JSON.stringify({event}))))}),result=await submitSingleOrder({...socketInput,beforeSend:async()=>prepared},fixture.Socket);assert.equal(result.status,'observed');assert.equal(result.trapped,trapped);assert.equal(fixture.sent.length,1);
 }
});
test('rejection, disconnect, timeouts and synchronous send failures never retry',async()=>{
 const prepared={command:{action:'End',playerID:7},expected:{}};
 for(const [onSend,status]of [[socket=>queueMicrotask(()=>socket.emit('message',Buffer.from('{"err":"fixture rejection"}'))),'rejected'],[socket=>queueMicrotask(()=>socket.emit('close')),'uncertain'],[()=>{},'uncertain'],[()=>{throw new Error('send failed');},'uncertain']]){
  const fixture=socketFixture({onSend}),result=await submitSingleOrder({...socketInput,beforeSend:async()=>prepared},fixture.Socket,{timeout:10});assert.equal(result.status,status);assert.equal(fixture.sent.length,1);assert.equal(result.submitted,true);
 }
});
test('a timed-out connection cannot send later when its state read eventually finishes',async()=>{
 const fixture=socketFixture(),result=await submitSingleOrder({...socketInput,beforeSend:async()=>{await new Promise(resolve=>setTimeout(resolve,15));return {command:{action:'End',playerID:7},expected:{}};}},fixture.Socket,{timeout:3});
 assert.equal(result.status,'not-sent');assert.equal(result.submitted,false);await new Promise(resolve=>setTimeout(resolve,20));assert.equal(fixture.sent.length,0);
});
