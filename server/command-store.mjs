import {getStore} from '@netlify/blobs';
import {randomUUID} from 'node:crypto';
export const commandStore=()=>getStore({name:'field-command-orders',consistency:'strong'});

// Internal health records contain no accounts, game IDs, cookies or board data.
// These let us check a real hosted read without exporting a player's session.
export async function recordHostedRead(result){
 try{const at=new Date().toISOString(),store=commandStore();await store.setJSON('__health/last-game-read',{at,...result});if(result.orderOutcome)await store.setJSON('__health/last-order',{at,outcome:result.orderOutcome,submitted:result.ordersSubmitted,readbackMatched:result.readbackMatched});}catch{}
}
export async function readHostedHealth(){
 try{return await commandStore().get('__health/last-game-read',{type:'json'});}catch{return null;}
}
export async function readOrderHealth(){try{return await commandStore().get('__health/last-order',{type:'json'});}catch{return null;}}
export async function probeCommandStore(storeFactory=commandStore){
 let store,key;
 try{
  store=storeFactory();key='__health/probe/'+randomUUID();
  const first=await store.set(key,'first',{onlyIfNew:true});
  const duplicate=await store.set(key,'duplicate',{onlyIfNew:true});
  const read=await store.get(key,{consistency:'strong'});
  const stale=await store.set(key,'stale',{onlyIfMatch:'invalid-etag'});
  const matched=await store.set(key,'matched',{onlyIfMatch:first.etag});
  return {ready:first.modified&&!!first.etag&&!duplicate.modified&&!stale.modified&&matched.modified&&read==='first',atomicWrites:!duplicate.modified&&!stale.modified&&matched.modified};
 }catch{return {ready:false,atomicWrites:false};}
 finally{if(store&&key)try{await store.delete(key);}catch{}}
}
