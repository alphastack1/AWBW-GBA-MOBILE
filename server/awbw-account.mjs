import {randomBytes, createCipheriv, createDecipheriv} from 'node:crypto';
import {CookieJar} from 'tough-cookie';
import {parseHTML} from 'linkedom';
import {parseGamePage} from './awbw-game.mjs';
import {probeAuthenticatedSocket} from './awbw-socket.mjs';
import {recordHostedRead} from './command-store.mjs';

const UPSTREAM='https://awbw.amarriner.com', COOKIE='__Host-fc_session', LIFETIME=8*60*60*1000;
const ALLOWED=new Set(['/','/logincheck.php','/yourgames.php','/game.php']);
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
export async function handleAccount(request,{secret=process.env.FIELD_COMMAND_SESSION_KEY,fetcher=fetch,socketProbe=probeAuthenticatedSocket,healthRecorder=recordHostedRead,now=Date.now()}={}){
 let session;
 try{
  keyBytes(secret);session=openSession(cookieValue(request),secret,now);
  const action=new URL(request.url).searchParams.get('action')||'session',method=request.method;
  if(!['session','login','games','game','logout'].includes(action))return reply({message:'Unknown account action.'},404);
  const expected=['login','logout'].includes(action)?'POST':'GET';if(method!==expected)return reply({message:`Use ${expected} for this action.`},405);
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
  if(action==='logout'){
   if(request.headers.get('x-fc-csrf')!==session.csrf)throw new AccountError(403,'Reload this page and try again.');
   return reply({authenticated:false},200,clearCookie());
  }
  const jar=CookieJar.fromJSON(session.jar),html=await upstream('/yourgames.php',jar,fetcher);
  if(!isAccountPage(html))return reply({message:'Your AWBW session expired. Sign in again.'},401,clearCookie());
  if(action==='game'){
   const gameId=new URL(request.url).searchParams.get('gameId');
   if(!/^\d{1,12}$/.test(gameId||''))throw new AccountError(400,'Choose a valid AWBW game.');
   const game=gameList(html).find(g=>g.id===gameId);if(!game)throw new AccountError(403,'This game is not in your AWBW game list.');
   const page=await upstream('/game.php?games_id='+gameId,jar,fetcher);
   let data;try{data=parseGamePage(page,{gameId,username:session.username,title:game.title});}catch(error){await healthRecorder({parsed:false,failure:/visibility/i.test(error.message)?'visibility':/terrain/i.test(error.message)?'terrain':/player view/i.test(error.message)?'viewer':/state:/i.test(error.message)?'declarations':'format'});throw new AccountError(502,'AWBW’s game view changed or is incomplete. Please refresh or try again shortly.');}
   const branch=page.match(/\bwsServerBranch\s*=\s*"([\w-]+)"/)?.[1],cookie=await jar.getCookieString(`https://awbw.amarriner.com/${branch}/game/${gameId}`);
   data.transport=await socketProbe({gameId,branch,viewerId:data.game.viewerPlayerId,cookie});
   await healthRecorder({parsed:true,socketAuthenticated:data.transport.authenticated,activeTurn:data.game.viewerPlayerId===data.game.currentPlayerId,ordersSubmitted:0});
   session.jar=await jar.serialize();return reply(data,200,sessionCookie(session,secret));
  }
  const turnHTML=await upstream('/yourgames.php?yourTurn=1',jar,fetcher);if(!isAccountPage(turnHTML))return reply({message:'Your AWBW session expired. Sign in again.'},401,clearCookie());
  const turns=new Set(gameList(turnHTML).map(g=>g.id)),games=gameList(html).map(g=>({...g,yourTurn:turns.has(g.id)}));
  session.jar=await jar.serialize();return reply({username:session.username,games},200,sessionCookie(session,secret));
 }catch(error){return reply({message:error instanceof AccountError?error.message:'AWBW could not be reached. Please try again shortly.'},error instanceof AccountError?error.status:502);}
}
