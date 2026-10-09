import {createHmac,randomUUID,timingSafeEqual} from 'node:crypto';
import {prepareOrder} from './awbw-preview.mjs';
import {commandStore} from './command-store.mjs';

export class OrderError extends Error{constructor(message,status=409){super(message);this.status=status;}}
const mac=(secret,value)=>createHmac('sha256',Buffer.from(secret,'base64')).update('field-command-order-v1:'+value).digest('base64url');
const scope=(secret,session,gameId)=>mac(secret,session.username.toLowerCase()+':'+gameId);
function inputOnly(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||!['unit','build','end'].includes(input.kind))throw new OrderError('Choose a supported order.',400);
 const result={kind:input.kind};for(const key of ['unitId','x','y','defenderId'])if(input[key]!==undefined){if(!Number.isInteger(input[key])||Math.abs(input[key])>1e12)throw new OrderError('Invalid order selection.',400);result[key]=input[key];}return result;
}
function decode(token,secret){
 if(typeof token!=='string'||token.length>4000)throw new OrderError('Choose a fresh order preview.');const [body,signature,...extra]=token.split('.');
 const expected=Buffer.from(mac(secret,body)),actual=Buffer.from(signature||'');if(extra.length||actual.length!==expected.length||!timingSafeEqual(actual,expected))throw new OrderError('Choose a fresh order preview.');
 try{const result=JSON.parse(Buffer.from(body,'base64url').toString());if(result.v!==1||!/^[-\w]{36}$/.test(result.nonce)||typeof result.scope!=='string')throw 0;return result;}catch{throw new OrderError('Choose a fresh order preview.');}
}
function visibleOutcome(context,expected){
 const u=context.unitsInfo[expected.unitId];
 if(expected.action==='End')return context.currentTurn!==context.viewerPId||!!context.gameEndDate;
 if(expected.action==='Build')return !!u&&u.units_players_id===context.viewerPId&&u.units_name===expected.name&&u.units_x===expected.x&&u.units_y===expected.y;
 if(expected.action==='Fire'){const defender=context.unitsInfo[expected.defenderId];return (!u||u.units_moved===1)&&(!defender||defender.units_hit_points<=expected.defenderHP);}
 if(!u||u.units_players_id!==context.viewerPId||u.units_moved!==1||u.units_x!==expected.x||u.units_y!==expected.y)return false;
 if(expected.action==='Move')return true;
 const b=context.buildingsInfo[expected.x]?.[expected.y];return expected.action==='Capt'&&!!b&&(b.buildings_players_id!==expected.beforeOwner||b.buildings_capture!==expected.beforeCapture);
}
function publicResult(result){if(!result)return result;const {expected,...publicFields}=result;return publicFields;}
export function createHostedOrders({secret,storeFactory=commandStore,deliver,now=()=>Date.now()}){
 function bound(token,session,gameId){const p=decode(token,secret);if(p.scope!==scope(secret,session,gameId)||p.session!==mac(secret,session.csrf))throw new OrderError('This preview belongs to a different sign-in.',403);return p;}
 async function getGate(store,key){return store.getWithMetadata(key,{type:'json',consistency:'strong'});}
 return {
  async state(session,gameId,context){
   const store=storeFactory(),account=scope(secret,session,gameId),key='gates/'+account,gate=await getGate(store,key);
   if(gate?.data.status==='pending'&&context){const receiptKey='receipts/'+account+'/'+gate.data.nonce,result=await store.get(receiptKey,{type:'json',consistency:'strong'});
    if(result?.status==='observed'&&result.expected&&visibleOutcome(context,result.expected)){
     const released=await store.setJSON(key,{status:'idle',lastNonce:gate.data.nonce,at:now()},{onlyIfMatch:gate.etag});if(released.modified){await store.setJSON(receiptKey,{...result,readbackMatched:true});return {locked:false,reconciled:true,ordersSubmitted:result.submitted===true?1:null};}
    }
   }
   return {locked:!!gate&&gate.data.status!=='idle',nonce:gate?.data.nonce};
  },
  async plan(session,context,input){
   const clean=inputOnly(input),prepared=prepareOrder(context,clean),account=scope(secret,session,context.gameId),store=storeFactory();
   const gate=await getGate(store,'gates/'+account);if(gate&&gate.data.status!=='idle')throw new OrderError('An earlier order is awaiting its outcome. Refresh the battlefield.');
   const proposal={v:1,scope:account,session:mac(secret,session.csrf),nonce:randomUUID(),input:clean,version:context.version,expires:now()+60000,choices:mac(secret,JSON.stringify(prepared.choices))};
   const body=Buffer.from(JSON.stringify(proposal)).toString('base64url');return {...prepared.preview,token:body+'.'+mac(secret,body),expires:proposal.expires,revision:context.version,choices:prepared.choices.map(({key,label})=>({key,label}))};
  },
  async commit(session,gameId,{token,choice},loadContext){
   const p=bound(token,session,gameId);if(now()>p.expires)throw new OrderError('This preview expired. Select the order again.');
   if(typeof choice!=='string'||choice.length>80)throw new OrderError('Choose an offered order.',400);
   const store=storeFactory(),receiptKey='receipts/'+p.scope+'/'+p.nonce,gateKey='gates/'+p.scope;
   const reservation=await store.setJSON(receiptKey,{status:'reserved',at:now()},{onlyIfNew:true});
   if(!reservation.modified){const receipt=await store.get(receiptKey,{type:'json',consistency:'strong'});return {...publicResult(receipt),nonce:p.nonce,duplicate:true};}
   const previous=await getGate(store,gateKey);
   if(previous&&!previous.etag)throw new OrderError('The order lock is unavailable. No order sent.',503);
   if(previous&&previous.data.status!=='idle'){const result={status:'not-sent',message:'An earlier order is still awaiting its outcome.'};await store.setJSON(receiptKey,result);return {...result,nonce:p.nonce};}
   const claim=await store.setJSON(gateKey,{status:'pending',nonce:p.nonce,at:now()},previous?{onlyIfMatch:previous.etag}:{onlyIfNew:true});
   if(!claim.modified){const result={status:'not-sent',message:'Another order was selected at the same time. Refresh before continuing.'};await store.setJSON(receiptKey,result);return {...result,nonce:p.nonce};}
   if(!claim.etag)throw new OrderError('The order lock is unavailable. No order sent.',503);
   let result,expected;
   try{
    result=await deliver({beforeSend:async()=>{
     const context=await loadContext();if(context.version!==p.version||now()>p.expires)throw new OrderError('AWBW changed. Select a fresh order preview.');
     const prepared=prepareOrder(context,p.input);if(mac(secret,JSON.stringify(prepared.choices))!==p.choices)throw new OrderError('This order changed. Select it again.');
     const selected=prepared.choices.find(c=>c.key===choice);if(!selected)throw new OrderError('This order was not offered by AWBW.');
     expected={...selected.expected,action:selected.command.action,unitId:selected.command.unitID??selected.command.attacker?.unitID};
     if(expected.action==='Capt'){const b=context.buildingsInfo[expected.x][expected.y];expected.beforeOwner=b.buildings_players_id;expected.beforeCapture=b.buildings_capture;}
     if(expected.action==='Fire'){expected.defenderId=selected.command.defender.unitID;expected.defenderHP=context.unitsInfo[expected.defenderId].units_hit_points;}
     return selected;
    }});
    if(!['not-sent','observed','rejected','uncertain'].includes(result?.status))throw new Error('Unknown transport outcome');
    if(result.status==='observed'){
     if(result.action==='Build')expected.unitId=result.nativeUnitId;
     if(result.trapped){expected.action='Move';expected.x=result.position?.x;expected.y=result.position?.y;}
     try{result.readbackMatched=visibleOutcome(await loadContext(),expected);}catch{result.readbackMatched=false;}
     if(!result.readbackMatched)result.message='AWBW returned the order event. Waiting for the battlefield to sync.';
    }
   }catch{result={status:'uncertain',message:'The connection outcome is uncertain. Refresh and check AWBW before continuing.'};}
   // A crashed function leaves the persistent gate pending. A timeout never
   // authorizes a retry. Only a known unsent/rejected/matching event releases it.
   try{
    await store.setJSON(receiptKey,{...result,...(expected?{expected}:{})});
    if(result.status!=='uncertain'&&(result.status!=='observed'||result.readbackMatched)){
     const released=await store.setJSON(gateKey,{status:'idle',lastNonce:p.nonce,at:now()},{onlyIfMatch:claim.etag});
     if(!released.modified){const current=await getGate(store,gateKey);if(current?.data.nonce===p.nonce)throw new Error('Gate changed');}
    }
   }catch{return {status:'uncertain',nonce:p.nonce,message:'The result could not be retained. Check AWBW before continuing.'};}
   return {...result,nonce:p.nonce};
  },
  async outcome(session,gameId,nonce){if(!/^[-\w]{36}$/.test(nonce||''))throw new OrderError('Invalid order result.',400);return publicResult(await storeFactory().get('receipts/'+scope(secret,session,gameId)+'/'+nonce,{type:'json',consistency:'strong'}));}
 };
}
