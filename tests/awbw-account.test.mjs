import test from 'node:test';
import assert from 'node:assert/strict';
import {handleAccount,sealSession,openSession,gameList,isAccountPage} from '../server/awbw-account.mjs';
const secret=Buffer.alloc(32,7).toString('base64'),origin='https://awbw-gba.netlify.app';
const signedPage=name=>`<html><a href="logout.php">Log out</a><a href="profile.php?username=${name}">${name}</a><a href="game.php?games_id=123">River &amp; Road</a><a href="game.php?games_id=123">View</a><a href="https://other.example/game.php?games_id=456">Foreign</a></html>`;
function fakeAWBW(){const calls=[];return {calls,fetcher:async(url,options)=>{calls.push({url:String(url),options});if(url.pathname==='/logincheck.php'){const p=new URLSearchParams(options.body);if(p.get('password')!=='fixture-password')return new Response('0');const headers=new Headers();headers.append('Set-Cookie',`AWBWUser=${p.get('username')}; Path=/; HttpOnly; Secure`);return new Response('1',{headers});}const name=/AWBWUser=([^;]+)/.exec(options.headers.Cookie||'')?.[1];return new Response(name?signedPage(name):'<form class="login-form"><input type="password"></form>');}};}
function req(action,{method='GET',cookie,csrf,body,from=origin}={}){const headers={};if(cookie)headers.Cookie=cookie;if(method==='POST')headers.Origin=from;if(csrf)headers['X-FC-CSRF']=csrf;if(body!==undefined)headers['Content-Type']='application/json';return new Request(origin+'/api/awbw/account?action='+action,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});}
async function login(name,upstream){const response=await handleAccount(req('login',{method:'POST',body:{username:name,password:'fixture-password'}}),{secret,fetcher:upstream.fetcher});assert.equal(response.status,200);return {response,body:await response.json(),cookie:response.headers.get('set-cookie').split(';')[0]};}
test('encrypted sessions reject tampering, expiry and a different deployment key',()=>{
 const now=Date.now(),session={v:1,username:'player',csrf:'fixture-csrf',expires:now+100000,jar:{cookies:[]}},token=sealSession(session,secret);
 assert.equal(openSession(token,secret,now).username,'player');assert.equal(openSession(token,secret,now+100001),null);
 assert.equal(openSession(token,Buffer.alloc(32,8).toString('base64')),null);assert.equal(openSession(token.slice(0,-8)+'AAAAAAAA',secret),null);assert.ok(!token.includes('fixture-csrf'));
});
test('missing deployment key fails closed without requesting AWBW',async()=>{
 const u=fakeAWBW(),r=await handleAccount(req('session'),{secret:'',fetcher:u.fetcher});assert.equal(r.status,503);assert.equal(u.calls.length,0);
});
test('real login contract is form-encoded POST; only encrypted HttpOnly cookies and username are returned',async()=>{
 const u=fakeAWBW(),a=await login('player-one',u),post=u.calls.find(c=>c.url.endsWith('logincheck.php'));
 assert.equal(post.options.method,'POST');assert.equal(new URLSearchParams(post.options.body).get('username'),'player-one');assert.equal(post.options.headers['X-Requested-With'],'XMLHttpRequest');
 assert.match(a.response.headers.get('set-cookie'),/Secure; HttpOnly; SameSite=Lax/);assert.equal(a.body.authenticated,true);
 assert.ok(!JSON.stringify(a.body).includes('fixture-password'));assert.ok(!a.cookie.includes('AWBWUser'));
 const s=await handleAccount(req('session',{cookie:a.cookie}),{secret,fetcher:u.fetcher});assert.equal((await s.json()).username,'player-one');
});
test('each friend gets separate upstream cookies and game-list requests',async()=>{
 const u=fakeAWBW(),a=await login('player-one',u),b=await login('player-two',u);
 assert.notEqual(a.cookie,b.cookie);
 const one=await handleAccount(req('games',{cookie:a.cookie}),{secret,fetcher:u.fetcher});const two=await handleAccount(req('games',{cookie:b.cookie}),{secret,fetcher:u.fetcher});
 assert.equal((await one.json()).username,'player-one');assert.equal((await two.json()).username,'player-two');
 assert.ok(u.calls.at(-1).options.headers.Cookie.includes('player-two'));assert.ok(!u.calls.at(-1).options.headers.Cookie.includes('player-one'));
});
test('an HTTP/login-check success alone cannot establish an authenticated session',async()=>{
 const r=await handleAccount(req('login',{method:'POST',body:{username:'player',password:'fixture-password'}}),{secret,fetcher:async url=>new Response(url.pathname==='/logincheck.php'?'1':'<form class="login-form"><input type="password"></form>')});
 assert.equal(r.status,502);assert.equal(r.headers.get('set-cookie'),null);
});
test('rejected credentials never create an app session or expose the password',async()=>{
 const u=fakeAWBW(),r=await handleAccount(req('login',{method:'POST',body:{username:'player',password:'wrong-private-password'}}),{secret,fetcher:u.fetcher});assert.equal(r.status,401);assert.equal(r.headers.get('set-cookie'),null);assert.ok(!(await r.text()).includes('wrong-private-password'));
});
test('cross-origin sign-in and invalid payloads are rejected before contacting AWBW',async()=>{
 const u=fakeAWBW();for(const [body,from,status]of [[{username:'player',password:'fixture-password'},'https://other.example',403],[null,origin,400],[{username:'',password:''},origin,400]]){const r=await handleAccount(req('login',{method:'POST',body,from}),{secret,fetcher:u.fetcher});assert.equal(r.status,status);}assert.equal(u.calls.length,0);
});
test('logout requires the signed session token and clears only this app cookie',async()=>{
 const u=fakeAWBW(),a=await login('player-one',u);
 const bad=await handleAccount(req('logout',{method:'POST',cookie:a.cookie,csrf:'incorrect'}),{secret,fetcher:u.fetcher});assert.equal(bad.status,403);
 const good=await handleAccount(req('logout',{method:'POST',cookie:a.cookie,csrf:a.body.csrf}),{secret,fetcher:u.fetcher});assert.equal(good.status,200);assert.match(good.headers.get('set-cookie'),/Max-Age=0/);
});
test('game lists exclude foreign/invalid links, deduplicate and decode text without trusting markup',()=>{
 const g=gameList(signedPage('player')+'<a href="game.php?games_id=bad">Invalid</a>');assert.deepEqual(g,[{id:'123',title:'River & Road'}]);assert.equal(isAccountPage(signedPage('player')),true);
});
test('an upstream redirect cannot send AWBW credentials or cookies to another host',async()=>{
 let calls=0;const r=await handleAccount(req('login',{method:'POST',body:{username:'player',password:'fixture-password'}}),{secret,fetcher:async()=>{calls++;return new Response('',{status:302,headers:{Location:'https://other.example/private'}});}});assert.equal(r.status,502);assert.equal(calls,1);
});
