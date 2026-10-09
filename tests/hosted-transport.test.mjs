import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {probeAuthenticatedSocket} from '../server/awbw-socket.mjs';
import {probeCommandStore} from '../server/command-store.mjs';

test('authenticated socket verification requires this viewer’s JoinRoom, not just open/101',async()=>{
 let ended=0;
 class Socket extends EventEmitter{constructor(url,options){super();assert.equal(url,'wss://awbw.amarriner.com/node/game/123');assert.equal(options.origin,'https://awbw.amarriner.com');assert.equal(options.headers.Cookie,'upstream-fixture-session');queueMicrotask(()=>{this.emit('open');this.emit('message',Buffer.from(JSON.stringify({JoinRoom:{action:'JoinRoom',playerId:7}})));});}send(){assert.fail('Probe must not send game frames.');}terminate(){ended++;}}
 const result=await probeAuthenticatedSocket({gameId:'123',branch:'node',viewerId:7,cookie:'upstream-fixture-session'},Socket);
 assert.deepEqual(result,{authenticated:true,ordersSubmitted:0});assert.equal(ended,1);
});
test('anonymous/wrong-player sockets cannot be called authenticated',async()=>{
 class Socket extends EventEmitter{constructor(){super();queueMicrotask(()=>this.emit('message',Buffer.from(JSON.stringify({JoinRoom:{action:'JoinRoom',playerId:0}}))));}send(){assert.fail('No game frames');}terminate(){}}
 const result=await probeAuthenticatedSocket({gameId:'123',branch:'node',viewerId:7,cookie:'upstream-fixture-session'},Socket);assert.equal(result.authenticated,false);assert.equal(result.ordersSubmitted,0);
});
test('untrusted socket paths are rejected before any connection',async()=>{
 let calls=0;class Socket{constructor(){calls++;}}
 for(const branch of ['../other','https://other.example',''])assert.equal((await probeAuthenticatedSocket({gameId:'123',branch,viewerId:7,cookie:'fixture'},Socket)).authenticated,false);
 assert.equal(calls,0);
});
test('command-store health exercises duplicate/stale atomic writes and cleans its own probe',async()=>{
 const entries=new Map();let deletes=0,conditions=[];
 const store={set:async(key,value,options)=>{conditions.push(options);if(options.onlyIfMatch||options.onlyIfNew&&entries.has(key))return{modified:false};entries.set(key,value);return{modified:true,etag:'fixture-etag'};},get:async(key,options)=>{assert.equal(options.consistency,'strong');return entries.get(key);},delete:async key=>{entries.delete(key);deletes++;}};
 assert.deepEqual(await probeCommandStore(()=>store),{ready:true,atomicWrites:true});assert.equal(entries.size,0);assert.equal(deletes,1);assert.deepEqual(conditions,[{onlyIfNew:true},{onlyIfNew:true},{onlyIfMatch:'invalid-etag'}]);
});
test('a store that overwrites duplicates is not safe for game submission',async()=>{
 let value;const store={set:async(key,next)=>{value=next;return{modified:true,etag:'etag'};},get:async()=>value,delete:async()=>{}};
 assert.equal((await probeCommandStore(()=>store)).ready,false);assert.equal((await probeCommandStore(()=>{throw new Error('No runtime binding');})).ready,false);
});
