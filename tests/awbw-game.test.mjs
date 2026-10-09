import test from 'node:test';
import assert from 'node:assert/strict';
import {parseGamePage,declaration} from '../server/awbw-game.mjs';
import {handleArt} from '../server/awbw-art.mjs';
import {gamePage} from './fixtures/awbw-game.mjs';
test('native JSON declarations are read without executing expressions',()=>{
 assert.deepEqual(declaration('const x = {"title":"a; } title","path":[1,2]};','x'),{title:'a; } title',path:[1,2]});
 assert.throws(()=>declaration('const x = {"value":1}; malicious();\nconst x = 2;','x'));
 assert.throws(()=>declaration('const x = fetch("https://other.example");','x'));
 assert.throws(()=>declaration('const x = {"value":1} + fetch("https://other.example");','x'));
});
test('viewer-specific game data preserves map, actual funds and native weather; excludes hidden enemies and cargo',()=>{
 const g=parseGamePage(gamePage(),{gameId:'123',username:'player',title:'River & Road'});
 assert.equal(g.width,4);assert.equal(g.game.viewerPlayerId,7);assert.equal(g.game.currentPlayerId,8);assert.equal(g.game.funds,800);
 assert.equal(g.weather,'clear');assert.equal(g.title,'River & Road');assert.equal(g.commander.name,'Adder');
 assert.deepEqual(g.game.units.map(u=>u.id),[11,13]);assert.equal(g.fog[15],true);assert.equal(g.terrainDetails[0].defense,3);
 assert.equal(g.game.canSendOrders,false);assert.ok(!JSON.stringify(g).includes('opponent'));assert.ok(!JSON.stringify(g).includes('users_id'));
});
test('wrong account, wrong game, missing visibility and incomplete terrain fail closed',()=>{
 for(const [html,options]of [[gamePage(),{gameId:'456',username:'player'}],[gamePage('friend'),{gameId:'123',username:'player'}],[gamePage().replace('const fogInfo =','const missingFog ='),{gameId:'123',username:'player'}],[gamePage().replaceAll('"terrain_id":1','"terrain_id":null'),{gameId:'123',username:'player'}]])assert.throws(()=>parseGamePage(html,options));
});
test('sprite requests use fixed public paths without player cookies',async()=>{
 const calls=[],request=new Request('https://awbw-gba.netlify.app/api/awbw/art?army=gs&unit=infantry',{headers:{Cookie:'private-cookie'}});
 const r=await handleArt(request,{fetcher:async(url,options)=>{calls.push({url,options});return new Response('GIF89aDATA');}});
 assert.equal(r.status,200);assert.deepEqual(calls.map(c=>c.url),['https://awbw.amarriner.com/terrain/aw2/gsinfantry.gif']);assert.equal(calls[0].options.credentials,'omit');assert.equal(calls[0].options.headers,undefined);assert.equal(r.headers.get('content-type'),'image/gif');
});
test('unknown sprite paths and writes are rejected; nonimage responses are never served as artwork',async()=>{
 let calls=0;const fetcher=async()=>{calls++;return new Response('<html>Not an image</html>');};
 for(const query of ['army=../../other&unit=infantry','army=os&unit=../../login','army=os&unit=unknown'])assert.equal((await handleArt(new Request('https://awbw-gba.netlify.app/api/awbw/art?'+query),{fetcher})).status,400);
 assert.equal(calls,0);assert.equal((await handleArt(new Request('https://awbw-gba.netlify.app/api/awbw/art?army=os&unit=infantry',{method:'POST'}),{fetcher})).status,405);
 assert.equal((await handleArt(new Request('https://awbw-gba.netlify.app/api/awbw/art?army=os&unit=infantry'),{fetcher})).status,502);
});
