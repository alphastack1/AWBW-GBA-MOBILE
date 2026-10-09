import test from 'node:test';
import assert from 'node:assert/strict';
import {schema,responseSample,requestSample} from '../inspection.js';

test('game samples preserve coordinates, HP, funds, ownership, and explicit outcomes',()=>{
 const data={game:{games_id:123,day:4,units:{7:{units_id:7,units_x:3,units_y:4,hp:8,fuel:70,army:'os',type:'infantry'}},players:[{players_id:9,funds:8000}],success:false},authToken:'secret',session:'secret',csrf:'secret'};
 const s=responseSample(data);assert.equal(s.game.units[7].units_x,3);assert.equal(s.game.units[7].hp,8);assert.equal(s.game.players[0].funds,8000);assert.equal(s.game.success,false);assert.ok(!('authToken' in s));
 const events=responseSample({Build:{action:'Build',newUnit:{units_id:11,units_players_id:7,units_name:'Tank',units_x:2,units_y:3,sessionToken:'secret'}},Capt:{action:'Capt',buildingInfo:{buildings_id:50,buildings_x:2,buildings_y:3}},NextTurn:{action:'NextTurn',day:12,nextPId:8}});
 assert.equal(events.Build.newUnit.units_players_id,7);assert.equal(events.Capt.buildingInfo.buildings_id,50);assert.equal(events.NextTurn.nextPId,8);assert.ok(!JSON.stringify(events).includes('secret'));
});
test('nested credentials, arbitrary strings, email, and dynamic secrets are excluded',()=>{
 const data={data:{units:[{id:7,token:'secret',privateKey:'secret',password:'secret',name:'private-username',health:9}],players:[{email:'secret@example.com',name:'someone',id:1}],message:'Bearer secret',unexpected:'secret'}};
 const output=JSON.stringify(responseSample(data));assert.ok(!output.includes('secret'));assert.ok(!output.includes('someone'));assert.ok(!output.includes('private-username'));
 assert.equal(responseSample({units:[{id:7}]}).units[0].id,7);
});
test('request samples retain only whitelisted game fields from query and forms',()=>{
 const form=new URLSearchParams({action:'move',units_id:'7',x:'3',y:'4',csrf:'secret',password:'secret',cookie:'secret',other:'secret'});
 assert.deepEqual(requestSample(form,'https://awbw.amarriner.com/order.php?games_id=123&session=secret'),{games_id:'123',action:'move',units_id:'7',x:'3',y:'4'});
 const body=JSON.stringify({action:'attack',unit_id:7,destination:{x:3,y:4},auth:'secret'});
 assert.deepEqual(requestSample(body,'/order.php'),{action:'attack',unit_id:7,destination:{x:3,y:4}});
});
test('schemas record types and omit sensitive field names',()=>{
 assert.deepEqual(schema({units:[{id:7,hp:9,csrf:'secret'}],token:'secret'}),{units:{array:{id:'number',hp:'number'}}});
});
