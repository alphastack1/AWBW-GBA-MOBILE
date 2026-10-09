import test from 'node:test';
import assert from 'node:assert/strict';
import {createPractice,reachable,order,buy,endTurn,unitAt} from '../tactics.js';
import {validateSnapshot} from '../snapshot.js';

test('movement respects water, occupied squares, and movement budget',()=>{
 const s=createPractice(),u=s.units[0],r=reachable(s,u);
 assert.ok(r.has('3,5'));assert.ok(!r.has('8,5'));assert.ok(!r.has('4,6'));assert.ok(!r.has('17,13'));
});
test('invalid order does not mutate practice state',()=>{
 const s=createPractice(),before=JSON.stringify(s);
 assert.throws(()=>order(s,'os1',{x:17,y:13},'wait'),/reachable/);
 assert.equal(JSON.stringify(s),before);
 assert.throws(()=>order(s,'os1',{x:3,y:5},'attack','ge3'),/adjacent/);
 assert.equal(JSON.stringify(s),before);
});
test('movement is committed once and cannot be repeated',()=>{
 const s=createPractice();order(s,'os1',{x:3,y:4},'wait');assert.equal(s.units[0].y,4);assert.ok(s.units[0].spent);
 assert.throws(()=>order(s,'os1',{x:3,y:5},'wait'),/cannot act/);
});
test('capture completes over two friendly turns and changes owner',()=>{
 const s=createPractice(),u=s.units[0];u.x=5;u.y=8;
 order(s,u.id,{x:5,y:8},'capture');assert.equal(s.terrain[8*s.width+5].capture,10);
 endTurn(s);endTurn(s);order(s,u.id,{x:5,y:8},'capture');assert.equal(s.terrain[8*s.width+5].owner,'os');
});
test('buy validates funds and occupied bases before mutation',()=>{
 const s=createPractice(),initial=s.funds.os;buy(s,2,5,'tank');assert.equal(s.funds.os,initial-7000);assert.equal(unitAt(s,2,5).type,'tank');assert.ok(unitAt(s,2,5).spent);
 const before=JSON.stringify(s);assert.throws(()=>buy(s,2,5,'infantry'));assert.equal(JSON.stringify(s),before);
});
test('combat removes defeated units and round advances after both players',()=>{
 const s=createPractice(),enemy=s.units.find(u=>u.id==='ge2');enemy.x=3;enemy.y=4;enemy.hp=1;
 order(s,'os1',{x:3,y:5},'attack','ge2');assert.ok(!s.units.some(u=>u.id==='ge2'));
 endTurn(s);assert.equal(s.day,1);assert.equal(s.army,'ge');endTurn(s);assert.equal(s.day,2);assert.equal(s.army,'os');assert.ok(!s.units[0].spent);
});
const snapshot={format:'field-command-snapshot-v1',gameId:'123',map:{width:1,height:1,layers:[{x:0,y:0,source:'https://awbw.amarriner.com/terrain/ani/plain.gif',width:16,height:16}]}};
test('snapshot rejects untrusted sources and out-of-range sprites',()=>{
 assert.equal(validateSnapshot(snapshot).gameId,'123');
 assert.throws(()=>validateSnapshot({...snapshot,map:{...snapshot.map,layers:[{...snapshot.map.layers[0],source:'https://evil.example/terrain/plain.gif'}]}}),/source/);
 assert.throws(()=>validateSnapshot({...snapshot,map:{...snapshot.map,layers:[{...snapshot.map.layers[0],x:5}]}}),/outside/);
});

test('untrusted snapshot cannot enable live orders or supply out-of-bounds unit details',()=>{
 const live={...snapshot,game:{canSendOrders:true,readOnly:false,currentPlayerId:7,viewerPlayerId:7,units:[{id:8,owner:7,x:0,y:0,name:'Infantry',hp:8,fuel:40,ammo:null,spent:false}]}};
 const verified=validateSnapshot(live);
 assert.equal(verified.game.canSendOrders,false);assert.equal(verified.game.readOnly,true);assert.equal(verified.game.units[0].hp,8);assert.equal(verified.game.units[0].ammo,null);
 assert.throws(()=>validateSnapshot({...live,game:{...live.game,units:[{...live.game.units[0],x:10}]}}),/visible unit/);
});
