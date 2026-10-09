from browser_config import BROWSER_BASE_URL
"""Exercise genuine cross-origin windows, wire messages and the confirmation flow.
The server is a fixture, not an AWBW authentication/server verification claim.
"""
from pathlib import Path
import json, tempfile, shutil
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
stub='''window.__sent=[];window.__socketCount=0;window.WebSocket=class extends EventTarget {
 constructor(url){super();this.url=url;this.readyState=1;window.__socketCount++;}
 send(payload){if(!payload)return;const c=JSON.parse(payload);window.__sent.push(c);
  if(window.testResponse==='timeout')return;
  setTimeout(()=>{
   if(window.testResponse==='reject'){this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify({err:true,message:'Fixture rejection'})}));return;}
   let event;
   if(c.action==='Move'||c.action==='Capt'){
    const u=unitsInfo[c.unitID],n=c.path.at(-1);u.units_x=n%maxX;u.units_y=Math.floor(n/maxX);u.units_moved=1;
    for(const col of Object.values(unitMap))for(const y of Object.keys(col))if(col[y]?.units_id===u.units_id)delete col[y];
    (unitMap[u.units_x]??={})[u.units_y]=u;
    const span=document.querySelector(`[data-unit-id="${u.units_id}"]`);span.style.left=`${u.units_x*16}px`;span.style.top=`${u.units_y*16}px`;
    event=c.action==='Move'?{action:'Move',unit:{...u},path:c.path.map(n=>({x:n%maxX,y:Math.floor(n/maxX)}))}:{action:'Capt',buildingInfo:{...buildingsInfo[u.units_x][u.units_y]}};
   }else if(c.action==='Build'){
    const b=Object.values(buildingsInfo).flatMap(c=>Object.values(c)).find(b=>b.buildings_id===c.buildingID),type=Object.values(genericUnits).find(u=>u.units_id===c.unitID);
    const u={...type,units_id:100+window.__sent.length,units_players_id:c.playerID,units_x:b.buildings_x,units_y:b.buildings_y,units_moved:1,units_hit_points:10,units_fuel:99,units_ammo:0};unitsInfo[u.units_id]=u;(unitMap[u.units_x]??={})[u.units_y]=u;playersInfo[7].players_funds-=type.units_cost;
    window.drawFixtureUnit(u);event={action:'Build',newUnit:{...u}};
   }else if(c.action==='End'){currentTurn=8;gameDay++;document.querySelector('h1').textContent=`Day ${gameDay}`;event={action:'NextTurn',day:gameDay,nextPId:8};}
   clientLastUpdated++;this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify({[event.action]:event})}));
  },80);
 }
};'''
fixture='''<!doctype html><html><body><h1>Day 11</h1><div id="gamemap" style="position:relative;width:336px;height:304px"><canvas id="map-background" width="336" height="304" style="position:absolute;z-index:99"></canvas><canvas id="fog-canvas" width="336" height="304" style="position:absolute;z-index:104"></canvas></div><script>
const maxX=21;const maxY=19;let gameDay=11;let clientLastUpdated=1;let gameEndDate=null;let freezeGame=false;window.ongoingAction=false;window.actionQueue=[];let currentTurn=7;let viewerPId=7;window.getViewerPId=()=>7;let playersInfo={7:{players_funds:10000,players_team:'A',labs:0}};
let unitsInfo={11:{units_id:11,units_players_id:7,units_x:3,units_y:3,units_name:'Infantry',units_movement_type:'F',units_movement_points:3,units_hit_points:10,units_fuel:99,units_ammo:0,units_moved:0}};window.unitMap={3:{3:unitsInfo[11]}};let buildingsInfo={2:{2:{buildings_id:50,buildings_players_id:7,buildings_x:2,buildings_y:2,terrain_name:'Base'}},4:{3:{buildings_id:51,buildings_players_id:8,buildings_x:4,buildings_y:3,terrain_name:'City'}}};const genericUnits={Infantry:{units_id:1,units_name:'Infantry',units_movement_type:'F',units_cost:1000},Tank:{units_id:13,units_name:'Tank',units_movement_type:'T',units_cost:7000}};window.findCostMultiplier=()=>1;window.currentClick={original:true};
window.getMovementTiles=function(width,height,type,mp,start,team,player,draw){if(draw!==false)throw Error('Preview must not draw official overlays');const dist=Array(width*height).fill(Infinity),previous=Array(width*height).fill(null);for(let y=0;y<height;y++)for(let x=0;x<width;x++){const n=y*width+x,d=Math.abs(x-start.x)+Math.abs(y-start.y);if(d<=mp){dist[n]=d;if(d)previous[n]=x!==start.x?n+(x>start.x?-1:1):n+(y>start.y?-width:width);}}return{dist,previous};};
window.findShortestPath=(solved,n)=>{const path=[];for(let i=n;i!==null;i=solved.previous[i])path.push(i);return path.reverse();};
window.checkTargetTile=(x,y)=>[{option:'Wait',clickable:true},...(buildingsInfo[x]?.[y]?.buildings_players_id!==7&&buildingsInfo[x]?.[y]?[{option:'Capt',clickable:true}]:[])];
window.emitData=(socket,data)=>socket.send(JSON.stringify(data));window.webSocket=new WebSocket('wss://awbw.amarriner.com/node/game/1741140');
window.drawFixtureUnit=u=>{const span=document.createElement('span');span.className='game-unit';span.dataset.unitId=u.units_id;span.style.cssText=`position:absolute;z-index:105;width:16px;height:16px;background:#da4422;left:${u.units_x*16}px;top:${u.units_y*16}px`;document.querySelector('#gamemap').append(span);};drawFixtureUnit(unitsInfo[11]);const ctx=document.querySelector('#map-background').getContext('2d');ctx.fillStyle='#70a830';ctx.fillRect(0,0,336,304);
</script></body></html>'''
with sync_playwright() as p,tempfile.TemporaryDirectory() as temp:
 b=p.chromium.launch(headless=True,executable_path=shutil.which('chromium'),args=['--no-sandbox'])
 c=b.new_context(viewport={'width':390,'height':844},accept_downloads=True)
 c.add_init_script(stub+"\ntry{sessionStorage.setItem('field-command-original','1')}catch{};\n"+(ROOT/'awbw-bridge.user.js').read_text())
 c.route('https://awbw.amarriner.com/**',lambda r:r.fulfill(status=200,content_type='text/html',body=fixture))
 original=c.new_page();errors=[];original.on('pageerror',lambda e:errors.append(str(e)))
 original.goto('https://awbw.amarriner.com/game.php?games_id=1741140');original.locator('#fc-bridge-tool summary').click()
 original.on('dialog',lambda d:d.accept(BROWSER_BASE_URL))
 def connect():
  with original.expect_popup() as opened:original.locator('#fc-bridge-tool #open').click()
  view=opened.value;view.on('pageerror',lambda e:errors.append(str(e)));view.wait_for_function("document.querySelector('#mode')?.textContent==='AWBW · LIVE ORDERS'")
  assert original.evaluate('__sent.length')==0
  view.wait_for_function("document.querySelector('#mode').textContent==='AWBW · LIVE ORDERS'")
  return view
 view=connect()
 view.evaluate("window.postMessage({type:'FC_CAPABILITIES',available:true,enabled:true,gameId:'1741140'},'*')")
 assert original.evaluate('__sent.length')==0
 # The real handheld obtains range and then a destination from AWBW helpers.
 view.locator('[data-x="3"][data-y="3"]').click();view.get_by_role('button',name='Stay here',exact=True).wait_for()
 assert view.locator('.reachable').count()>1 and original.evaluate('currentClick.original') is True
 view.locator('[data-x="4"][data-y="3"]').click();view.get_by_role('button',name='Wait',exact=True).wait_for()
 assert view.get_by_role('button',name='Capture',exact=True).count()==1;assert original.evaluate('__sent.length')==0
 view.get_by_role('button',name='Wait',exact=True).click()
 view.wait_for_function("document.querySelector('#message').textContent.includes('matching game event')")
 assert original.evaluate('__sent')==[{'action':'Move','path':[66,67],'playerID':7,'unitID':11}]
 view.wait_for_function("document.querySelector('#commands').textContent.includes('Select a ready unit')")
 # Board refresh preserves the cursor; it never applies a practice move locally.
 assert view.locator('#coords').inner_text()=='FIELD 05 : 04';assert original.evaluate('unitsInfo[11].units_moved')==1
 view.locator('[data-x="2"][data-y="2"]').click();view.get_by_role('button',name='Tank · 7,000 G',exact=True).wait_for()
 view.get_by_role('button',name='Tank · 7,000 G',exact=True).click();view.wait_for_function("document.querySelector('#message').textContent.includes('matching game event')")
 assert original.evaluate('__sent[1]')=={'action':'Build','playerID':7,'unitID':13,'buildingID':50}
 # End is acknowledged by NextTurn and loses permission when the player changes.
 view.locator('#menu-open').click();view.locator('#end-turn').click()
 view.wait_for_function("document.querySelector('#message').textContent.includes('matching game event')")
 assert original.evaluate('__sent[2]')=={'action':'End','playerID':7}
 view.wait_for_function("document.querySelector('#end-turn').disabled && document.querySelector('#day').textContent==='DAY 12'")
 assert original.evaluate('__socketCount')==1 and original.evaluate('__sent.length')==3
 assert view.evaluate('document.documentElement.scrollWidth<=innerWidth')
 # Rejection on a fresh fixture session; clicking an order sends directly.
 view.close();original.reload();original.locator('#fc-bridge-tool summary').click();view=connect()
 view.locator('[data-x="3"][data-y="3"]').click();view.get_by_role('button',name='Stay here',exact=True).click();original.evaluate("window.testResponse='reject'");view.get_by_role('button',name='Wait',exact=True).click()
 view.wait_for_function("document.querySelector('#message').textContent.includes('AWBW rejected')");assert original.evaluate('__sent.length')==1
 assert original.evaluate('unitsInfo[11].units_moved')==0
 # Recorded exports retain actual outcome samples; importing them stays read-only.
 with original.expect_download() as dl:original.locator('#fc-bridge-tool #snapshot').click()
 file=Path(temp)/'snapshot.json';dl.value.save_as(file)
 view.locator('#menu-open').click();view.locator('#snapshot-input').set_input_files(file);view.wait_for_function("document.querySelector('#mode').textContent==='AWBW · SNAPSHOT'");assert view.locator('#end-turn').is_disabled()
 assert not errors,errors
 c.close();b.close()
print('PASS: cross-origin session, official path preview, direct orders, one socket and exact Move/Build/End wires, server events, cursor preservation, turn revocation, rejection and read-only imports.')
