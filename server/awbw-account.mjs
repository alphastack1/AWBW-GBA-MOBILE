import {randomBytes, createCipheriv, createDecipheriv} from 'node:crypto';
import {CookieJar} from 'tough-cookie';
import {parseHTML} from 'linkedom';
import {parseGamePage,parseGameContext} from './awbw-game.mjs';
import {inspectUnit,forecast} from './awbw-preview.mjs';
import {probeAuthenticatedSocket,submitSingleOrder} from './awbw-socket.mjs';
import {recordHostedRead} from './command-store.mjs';
import {createHostedOrders,OrderError} from './hosted-orders.mjs';

const UPSTREAM='https://awbw.amarriner.com', COOKIE='__Host-fc_session', LIFETIME=8*60*60*1000;
const ALLOWED=new Set(['/','/logincheck.php','/yourgames.php','/game.php','/api/calculator/calculate_new.php']);
export class AccountError extends Error {constructor(status, message){super(message);this.status=status;}}
function keyBytes(secret){const key=Buffer.from(secret||'','base64');if(key.length!==32)throw new AccountError(503,'Sign-in is being prepared. Please try again shortly.');return key;}
export function sealSession(session, secret){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',keyBytes(secret),iv);cipher.setAAD(Buffer.from('field-command-session-v1'));const body=Buffer.concat([cipher.update(JSON.stringify(session),'utf8'),cipher.final()]);const token=Buffer.concat([iv,cipher.getAuthTag(),body]).toString('base64url');if(token.length>3700)throw new AccountError(502,'AWBW returned a session this app cannot retain.');return token;}
export function openSession(token,secret,now=Date.now()){
 try{if(!token||token.length>3700)return null;const data=Buffer.from(token,'base64url');if(data.length<29)return null;const decipher=createDecipheriv('aes-256-gcm',keyBytes(secret),data.subarray(0,12));decipher.setAuthTag(data.subarray(12,28));decipher.setAAD(Buffer.from('field-command-session-v1'));const session=JSON.parse(Buffer.concat([decipher.update(data.subarray(28)),decipher.final()]).toString('utf8'));return session.v===1&&typeof session.username==='string'&&typeof session.csrf==='string'&&session.expires>now&&session.expires<=now+LIFETIME&&session.jar?session:null;}catch{return null;}
}
function cookieValue(request){return (request.headers.get('cookie')||'').split(';').map(p=>p.trim()).find(p=>p.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);}
function sessionCookie(session,secret){return `${COOKIE}=${sealSession(session,secret)}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${Math.max(0,Math.floor((session.expires-Date.now())/1000))}`;}
const clearCookie=()=>`${COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0`;
function reply(data,status=200,cookie){const headers={'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};if(cookie)headers['Set-Cookie']=cookie;return new Response(JSON.stringify(data),{status,headers});}
async function upstream(path,jar,fetcher,body){
 let url=new URL(path,UPSTREAM);if(url.origin!==UPSTREAM||!ALLOWED.has(url.pathname))throw new AccountError(400,'Unsupported AWBW request.');
 for(let attempt=0;attempt<4;attempt++){
  const headers={'Accept':'text/html','User-Agent':'FieldCommand/0.6'};const cookie=await jar.getCookieString(url.href);if(cookie)headers.Cookie=cookie;
  if(body){headers['Content-Type']='application/x-www-form-urlencoded; charset=UTF-8';headers['X-Requested-With']='XMLHttpRequest';headers.Origin=UPSTREAM;headers.Referer=UPSTREAM+'/';}
  const response=await fetcher(url,{method:body?'POST':'GET',body,headers,redirect:'manual',signal:AbortSignal.timeout(15000)});
  const values=response.headers.getSetCookie?.()||[];for(const value of values)await jar.setCookie(value,url.href,{ignoreError:true});
  if([301,302,303,307,308].includes(response.status)){
   const next=new URL(response.headers.get('location')||'',url);await response.body?.cancel();
   if(next.origin!==UPSTREAM||!ALLOWED.has(next.pathname)||body)throw new AccountError(502,'AWBW changed its sign-in response.');url=next;continue;
  }
  if(!response.ok)throw new AccountError(502,'AWBW is unavailable right now. Try again shortly.');
  return (await response.text()).slice(0,1500000);
 }
 throw new AccountError(502,'AWBW could not complete this request.');
}
async function calculateDamage(body,jar,fetcher){
 const url=new URL('/api/calculator/calculate_new.php',UPSTREAM),cookie=await jar.getCookieString(url.href);
 const response=await fetcher(url,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json',Origin:UPSTREAM,Referer:UPSTREAM+'/game.php?games_id='+body.gameId,...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new Error('AWBW’s calculator is unavailable.');const text=await response.text();if(text.length>100000)throw new Error('AWBW calculator response is too large.');return JSON.parse(text);
}
export function isAccountPage(html){const{document}=parseHTML(html);return !document.querySelector('.login-form input[type="password"]')&&[...document.querySelectorAll('a[href]')].some(a=>{try{return new URL(a.getAttribute('href'),UPSTREAM).pathname==='/logout.php';}catch{return false;}});}
export function gameList(html){
 const{document}=parseHTML(html),games=new Map();
 for(const a of document.querySelectorAll('a[href]')){
  let url;try{url=new URL(a.getAttribute('href'),UPSTREAM);}catch{continue;}const id=url.searchParams.get('games_id');
  if(url.origin!==UPSTREAM||url.pathname!=='/game.php'||!/^\d{1,12}$/.test(id||''))continue;
  const text=a.textContent.replace(/\s+/g,' ').trim().slice(0,160);
  if(!games.has(id))games.set(id,{id,title:`AWBW game ${id}`});
  if(text&&!/^(?:view|play|watch|replay|go|\d+)$/i.test(text)&&games.get(id).title.startsWith('AWBW game '))games.get(id).title=text;
  if(games.size>=250)break;
 }
 return [...games.values()];
}
export async function handleAccount(request,{secret=process.env.FIELD_COMMAND_SESSION_KEY,fetcher=fetch,socketProbe=probeAuthenticatedSocket,healthRecorder=recordHostedRead,storeFactory,submit=submitSingleOrder,now=Date.now()}={}){
 let session;
 try{
  keyBytes(secret);session=openSession(cookieValue(request),secret,now);
  const action=new URL(request.url).searchParams.get('action')||'session',method=request.method;
  if(!['session','login','games','game','inspect','forecast','plan','commit','outcome','logout'].includes(action))return reply({message:'Unknown account action.'},404);
  const expected=['login','logout','forecast','plan','commit'].includes(action)?'POST':'GET';if(method!==expected)return reply({message:`Use ${expected} for this action.`},405);
  if(method==='POST'&&request.headers.get('origin')!==new URL(request.url).origin)throw new AccountError(403,'Reload this page and try again.');
  if(action==='session')return reply(session?{ready:true,authenticated:true,username:session.username,csrf:session.csrf}:{ready:true,authenticated:false});
  if(action==='login'){
   if(!/^application\/json(?:;|$)/i.test(request.headers.get('content-type')||''))throw new AccountError(415,'Submit the sign-in form from this app.');
   const text=await request.text();if(text.length>4000)throw new AccountError(400,'Sign-in details are too long.');
   let input;try{input=JSON.parse(text);}catch{throw new AccountError(400,'Check your sign-in details.');}if(!input||typeof input!=='object'||Array.isArray(input))throw new AccountError(400,'Check your sign-in details.');
   const username=typeof input.username==='string'?input.username.trim():'';
   if(!username||username.length>100||typeof input.password!=='string'||!input.password.length||input.password.length>100)throw new AccountError(400,'Enter your AWBW username and password.');
   const jar=new CookieJar();await upstream('/',jar,fetcher);
   const result=await upstream('/logincheck.php',jar,fetcher,new URLSearchParams({username,password:input.password}).toString());
   input.password='';
   if(result.trim()!=='1')throw new AccountError(401,'Username or password did not match.');
   const page=await upstream('/yourgames.php',jar,fetcher);if(!isAccountPage(page))throw new AccountError(502,'AWBW did not establish a signed-in session.');
   session={v:1,username,csrf:randomBytes(24).toString('base64url'),expires:now+LIFETIME,jar:await jar.serialize()};
   return reply({authenticated:true,username,csrf:session.csrf},200,sessionCookie(session,secret));
  }
  if(!session)throw new AccountError(401,'Sign in to AWBW to see your games.');
  if(method==='POST'&&request.headers.get('x-fc-csrf')!==session.csrf)throw new AccountError(403,'Reload this page and try again.');
  if(action==='logout'){
   if(request.headers.get('x-fc-csrf')!==session.csrf)throw new AccountError(403,'Reload this page and try again.');
   return reply({authenticated:false},200,clearCookie());
  }
  const jar=CookieJar.fromJSON(session.jar),html=await upstream('/yourgames.php',jar,fetcher);
  if(!isAccountPage(html))return reply({message:'Your AWBW session expired. Sign in again.'},401,clearCookie());
  if(['game','inspect','forecast','plan','commit','outcome'].includes(action)){
   const gameId=new URL(request.url).searchParams.get('gameId');
   if(!/^\d{1,12}$/.test(gameId||''))throw new AccountError(400,'Choose a valid AWBW game.');
   const game=gameList(html).find(g=>g.id===gameId);if(!game)throw new AccountError(403,'This game is not in your AWBW game list.');
   const page=await upstream('/game.php?games_id='+gameId,jar,fetcher);
   const branch=page.match(/\bwsServerBranch\s*=\s*"([\w-]+)"/)?.[1],cookie=await jar.getCookieString(`https://awbw.amarriner.com/${branch}/game/${gameId}`);
   const orders=createHostedOrders({secret,storeFactory,deliver:({beforeSend})=>submit({gameId,branch,viewerId:parseGamePage(page,{gameId,username:session.username,title:game.title}).game.viewerPlayerId,cookie,beforeSend})});
   if(['plan','commit'].includes(action)){
    if(!/^application\/json(?:;|$)/i.test(request.headers.get('content-type')||''))throw new AccountError(415,'Select an order in the app.');
    const text=await request.text();if(text.length>6000)throw new AccountError(400,'Invalid order request.');let input;try{input=JSON.parse(text);}catch{throw new AccountError(400,'Invalid order request.');}
    const context=parseGameContext(page,{gameId,username:session.username,title:game.title});
    const result=action==='plan'?{plan:await orders.plan(session,context,input)}:await orders.commit(session,gameId,input,async()=>parseGameContext(await upstream('/game.php?games_id='+gameId,jar,fetcher),{gameId,username:session.username,title:game.title}));
    await healthRecorder({parsed:true,activeTurn:context.currentTurn===context.viewerPId,orderOutcome:action==='commit'?result.status:undefined,readbackMatched:action==='commit'?result.readbackMatched:undefined,ordersSubmitted:action==='commit'?(result.submitted===true?1:result.submitted===false?0:null):0});
    return reply(result,200,sessionCookie({...session,jar:await jar.serialize()},secret));
   }
   if(action==='outcome'){const result=await orders.outcome(session,gameId,new URL(request.url).searchParams.get('nonce'));return reply({result},200);}
   if(action==='forecast'){
    if(!/^application\/json(?:;|$)/i.test(request.headers.get('content-type')||''))throw new AccountError(415,'Use the app’s damage preview.');
    const text=await request.text();if(text.length>2000)throw new AccountError(400,'Invalid damage preview.');
    try{const input=JSON.parse(text),context=parseGameContext(page,{gameId,username:session.username,title:game.title}),result=await forecast(context,input,body=>calculateDamage(body,jar,fetcher));
     return reply(result,200,sessionCookie({...session,jar:await jar.serialize()},secret));
    }catch{throw new AccountError(422,'AWBW could not calculate this attack. Refresh and choose an available visible target.');}
   }
   if(action==='inspect'){
    const unitId=Number(new URL(request.url).searchParams.get('unitId'));
    try{const context=parseGameContext(page,{gameId,username:session.username,title:game.title}),inspection=inspectUnit(context,unitId).public;
     return reply(inspection,200,sessionCookie({...session,jar:await jar.serialize()},secret));
    }catch{throw new AccountError(422,'Could not inspect this unit with AWBW’s current rules. Refresh and choose a visible unit.');}
   }
   let data;try{data=parseGamePage(page,{gameId,username:session.username,title:game.title});}catch(error){await healthRecorder({parsed:false,failure:/visibility/i.test(error.message)?'visibility':/terrain/i.test(error.message)?'terrain':/player view/i.test(error.message)?'viewer':/state:/i.test(error.message)?'declarations':'format'});throw new AccountError(502,'AWBW’s game view changed or is incomplete. Please refresh or try again shortly.');}
   data.transport=await socketProbe({gameId,branch,viewerId:data.game.viewerPlayerId,cookie});
   data.capabilities={enabled:true,available:false,locked:false,reason:'Waiting for your turn.'};
   let reconciledOrder;
   try{const context=parseGameContext(page,{gameId,username:session.username,title:game.title}),gate=await orders.state(session,gameId,context);if(gate.reconciled)reconciledOrder={orderOutcome:'observed',readbackMatched:true,ordersSubmitted:gate.ordersSubmitted};data.capabilities={enabled:true,available:data.transport.authenticated&&context.currentTurn===context.viewerPId&&context.freezeGame===false&&!context.gameEndDate&&!gate.locked,locked:gate.locked,revision:context.version,reason:gate.locked?'An earlier order is awaiting its outcome or map update.':!data.transport.authenticated?'AWBW’s connection is unavailable.':context.currentTurn!==context.viewerPId?'Waiting for your turn.':context.gameEndDate?'This game has ended.':''};}catch{data.capabilities.reason='Orders are unavailable. You can inspect this battlefield.';}
   await healthRecorder({parsed:true,socketAuthenticated:data.transport.authenticated,activeTurn:data.game.viewerPlayerId===data.game.currentPlayerId,ordersSubmitted:0,...reconciledOrder});
   session.jar=await jar.serialize();return reply(data,200,sessionCookie(session,secret));
  }
  const turnHTML=await upstream('/yourgames.php?yourTurn=1',jar,fetcher);if(!isAccountPage(turnHTML))return reply({message:'Your AWBW session expired. Sign in again.'},401,clearCookie());
  const turns=new Set(gameList(turnHTML).map(g=>g.id)),games=gameList(html).map(g=>({...g,yourTurn:turns.has(g.id)}));
  session.jar=await jar.serialize();return reply({username:session.username,games},200,sessionCookie(session,secret));
 }catch(error){return reply({message:error instanceof AccountError||error instanceof OrderError?error.message:'AWBW could not be reached. Please try again shortly.'},error instanceof AccountError||error instanceof OrderError?error.status:502);}
}
