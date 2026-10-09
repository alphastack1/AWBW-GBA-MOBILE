import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {parseGameContext} from '../server/awbw-game.mjs';
import {inspectUnit,prepareOrder,forecast} from '../server/awbw-preview.mjs';
import {gamePage} from './fixtures/awbw-game.mjs';
const context=()=>parseGameContext(gamePage(),{gameId:'123',username:'player'});
test('native helpers retain their reviewed public source and dependency checksums',()=>{
 const manifest=JSON.parse(readFileSync(new URL('../vendor/sources.json',import.meta.url)));
 for(const entry of manifest)assert.equal(createHash('sha256').update(readFileSync(new URL('../'+entry.file,import.meta.url))).digest('hex'),entry.sha256,entry.file);
 const module=readFileSync(new URL('../server/awbw-native-rules.mjs',import.meta.url),'utf8');
 for(const [source,names]of [['movement',['getMovementTiles','findTerrainCost','checkTeleportTile','findShortestPath','findBorders']],['game',['findCostMultiplier','checkTargetTile','checkLanding','checkCargo','loopNeighbours','findUnitsInRangeOf','calculateDamage']]]){
  const original=readFileSync(new URL('../vendor/awbw-'+source+'-source.txt',import.meta.url),'utf8');
  for(const name of names){const start=original.indexOf('function '+name+'('),end=/^}/m.exec(original.slice(start));assert.ok(start>=0&&end);assert.ok(module.includes(original.slice(start,start+end.index+1)),name+' changed');}
 }
});
test('forecasts use the native calculator payload and typed luck/counter ranges, including top-left firing positions',async()=>{
 const c=context();Object.assign(c.playersInfo[7],{players_id:7,players_co_id:15,players_co_power_on:'N',cities:1,numProperties:1,towers:0});Object.assign(c.playersInfo[8],{players_id:8,co_name:'Andy',players_co_id:1,countries_name:'Yellow Comet',players_co_power_on:'N',cities:1,numProperties:1,towers:0});
 const nativeResponse={minInfo:{percent:38},maxInfo:{percent:44},minCounterInfo:{minLuck:{counterPercent:20}},maxCounterInfo:{maxLuck:{counterPercent:27}}};let payload;
 const f=await forecast(c,{attackerId:11,defenderId:13},async body=>{payload=body;return nativeResponse;});assert.deepEqual(f.damage,{min:38,max:44});assert.deepEqual(f.counter,{min:20,max:27});assert.equal(payload.attacker.unit.units_id,1);assert.equal(payload.attacker.unit.unit_id,11);assert.equal(payload.attacker.power,'N');assert.equal(f.source,'AWBW calculator');assert.equal(f.readOnly,true);
 await assert.rejects(forecast(c,{attackerId:11,defenderId:12},async()=>assert.fail('Hidden enemy reached calculator')));
 c.unitsInfo[13].units_x=1;c.unitsInfo[13].units_y=0;c.unitMap[1][2]=undefined;c.unitMap[1][0]={units_id:13,team:'8'};
 await forecast(c,{attackerId:11,defenderId:13,x:0,y:0},async body=>{assert.equal(body.attacker.terrain.id,49);return nativeResponse;});
 await assert.rejects(forecast(c,{attackerId:11,defenderId:13},async()=>({minInfo:{percent:NaN},maxInfo:{percent:44}})));
});
test('authenticated inspection uses native terrain costs/fuel and visible enemies, never hidden unit records',()=>{
 const c=context(),i=inspectUnit(c,11).public;
 assert.equal(i.move,3);assert.ok(i.reachable.includes(0));assert.ok(!i.reachable.includes(9)); // Visible enemy at 1:2.
 assert.ok(i.targets.includes(13));assert.ok(!i.targets.includes(12));assert.ok(i.attackRange.includes(15));assert.equal(i.readOnly,true);
 assert.deepEqual(Object.keys(c.unitsInfo),['11','13']);assert.ok(!JSON.stringify(i).includes('opponent'));
 c.unitsInfo[11].units_fuel=1;assert.ok(inspectUnit(c,11).public.reachable.length<i.reachable.length);
 assert.throws(()=>inspectUnit(c,12));
});
test('native previews reject other turns, ownership, spent units, occupied tiles and forged destinations',()=>{
 const c=context();assert.throws(()=>prepareOrder(c,{kind:'unit',unitId:11}));c.currentTurn=7;
 assert.throws(()=>prepareOrder(c,{kind:'unit',unitId:13}));c.unitsInfo[11].units_moved=1;assert.throws(()=>prepareOrder(c,{kind:'unit',unitId:11}));c.unitsInfo[11].units_moved=0;
 for(const destination of [{x:1,y:2},{x:-1,y:0},{x:3,y:3}])assert.throws(()=>prepareOrder(c,{kind:'unit',unitId:11,...destination}));
 const p=prepareOrder(c,{kind:'unit',unitId:11,x:1,y:0});assert.deepEqual(p.preview.path,[5,1]);assert.deepEqual(p.choices.map(c=>c.key),['Move']);assert.deepEqual(p.choices[0].command,{action:'Move',path:[5,1],playerID:7,unitID:11});
});
test('Fire uses the reviewed attacker/defender wire, eligible target, ammo and stationary indirect rules',()=>{
 const c=context();c.currentTurn=7;const p=prepareOrder(c,{kind:'unit',unitId:11,x:1,y:1,defenderId:13});assert.deepEqual(p.choices[0].command,{action:'Fire',attacker:{playerID:7,unitID:11,path:[5]},defender:{playerID:8,unitID:13}});
 assert.throws(()=>prepareOrder(c,{kind:'unit',unitId:11,x:1,y:1,defenderId:12}));assert.throws(()=>prepareOrder(c,{kind:'unit',unitId:11,x:1,y:0,defenderId:13}));
 Object.assign(c.unitsInfo[11],c.genericUnits.Artillery,{units_id:11,units_players_id:7,units_x:1,units_y:1,units_ammo:0});assert.throws(()=>prepareOrder(c,{kind:'unit',unitId:11,x:1,y:1,defenderId:13}));
 c.unitsInfo[11].units_ammo=9;c.unitsInfo[13].units_x=3;c.unitMap[1][2]=undefined;c.unitMap[3]={2:{units_id:13,team:'8'}};
 const indirect=prepareOrder(c,{kind:'unit',unitId:11,x:1,y:1,defenderId:13});assert.deepEqual(indirect.choices[0].command.attacker.path,[]);assert.throws(()=>prepareOrder(c,{kind:'unit',unitId:11,x:1,y:0,defenderId:13}));
});
test('native capture and purchase previews preserve team eligibility, costs, bans and labs',()=>{
 const c=context();c.currentTurn=7;c.buildingsInfo[0][0].buildings_team='8';c.buildingsInfo[0][0].buildings_players_id=8;
 const capture=prepareOrder(c,{kind:'unit',unitId:11,x:0,y:0});assert.ok(capture.choices.some(c=>c.key==='Capt'));
 c.buildingsInfo[0][0].buildings_team='7';c.buildingsInfo[0][0].buildings_players_id=7;assert.ok(!prepareOrder(c,{kind:'unit',unitId:11,x:0,y:0}).choices.some(c=>c.key==='Capt'));
 c.playersInfo[7].players_funds=2500;c.playersInfo[7].co_name='Colin';
 assert.deepEqual(prepareOrder(c,{kind:'build',x:0,y:0}).choices.map(c=>[c.expected.name,c.expected.cost]),[['Infantry',800],['Mech',2400]]);
 c.banUnits.Infantry=1;c.labUnits.Mech=1;c.playersInfo[7].labs=0;assert.equal(prepareOrder(c,{kind:'build',x:0,y:0}).choices.length,0);
});
test('missing/ambiguous weather, team and native rules fail closed',()=>{
 for(const html of [gamePage().replace('name: "clear"','name: "rain"'),gamePage().replace('const moveCosts =','const missingCosts ='),gamePage().replace('"players_team":"7"','"players_team":null')])assert.throws(()=>parseGameContext(html,{gameId:'123',username:'player'}));
});
