import {getStore} from '@netlify/blobs';
import {randomUUID} from 'node:crypto';
export const commandStore=()=>getStore({name:'field-command-orders',consistency:'strong'});

// Internal health records contain no accounts, game IDs, cookies or board data.
// These let us check a real hosted read without exporting a player's session.
export async function recordHostedRead(result){
 try{await commandStore().setJSON('__health/last-game-read',{at:new Date().toISOString(),...result});}catch{}
}
export async function readHostedHealth(){
 try{return await commandStore().get('__health/last-game-read',{type:'json'});}catch{return null;}
}
export async function probeCommandStore(storeFactory=commandStore){
 let store,key;
 try{
  store=storeFactory();key='__health/probe/'+randomUUID();
  const first=await store.set(key,'first',{onlyIfNew:true});
  const duplicate=await store.set(key,'duplicate',{onlyIfNew:true});
  const read=await store.get(key,{consistency:'strong'});
  const stale=await store.set(key,'stale',{onlyIfMatch:'invalid-etag'});
  return {ready:first.modified&&!!first.etag&&!duplicate.modified&&!stale.modified&&read==='first',atomicWrites:!duplicate.modified&&!stale.modified};
 }catch{return {ready:false,atomicWrites:false};}
 finally{if(store&&key)try{await store.delete(key);}catch{}}
}
