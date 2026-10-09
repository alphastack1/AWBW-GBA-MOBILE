from browser_config import BROWSER_BASE_URL
"""Regression fixture modeled on AWBW's exported game.js and game.css contracts."""
from pathlib import Path
import json
import tempfile
import shutil
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
html='''<html><body><h1>Day 11</h1><div id="gamemap" style="position:relative;width:304px;height:272px"><canvas id="map-background" width="304" height="272" style="position:absolute;left:0;top:0;z-index:99"></canvas><canvas id="fog-canvas" width="304" height="272" style="position:absolute;left:0;top:0;z-index:104"></canvas></div><div id="sidebar"><img src="/terrain/ani/osinfantry.gif"></div></body></html>'''
stub='''window.__openedSockets=0;window.__sent=[];window.WebSocket=class extends EventTarget{constructor(url){super();this.url=url;window.__openedSockets++;}send(data){window.__sent.push(data);}};'''
with sync_playwright() as p,tempfile.TemporaryDirectory() as temp:
 b=p.chromium.launch(headless=True,executable_path=shutil.which('chromium'),args=['--no-sandbox'])
 c=b.new_context(accept_downloads=True)
 c.add_init_script(stub+"\ntry{sessionStorage.setItem('field-command-original','1')}catch{};\n"+(ROOT/'awbw-bridge.user.js').read_text())
 c.route('https://awbw.amarriner.com/**',lambda r:r.fulfill(status=200,content_type='text/html',body=html))
 page=c.new_page();page.goto('https://awbw.amarriner.com/game.php?games_id=1741140')
 page.evaluate("""() => {const terrain=document.querySelector('#map-background').getContext('2d');terrain.fillStyle='#44aa22';terrain.fillRect(0,0,304,272);const fog=document.querySelector('#fog-canvas').getContext('2d');fog.fillStyle='#182030';fog.fillRect(0,0,16,16);} """)
 page.evaluate("""() => {
 window.viewerPId=7;window.currentTurn=8;window.unitsInfo={11:{units_id:11,units_players_id:7,units_x:3,units_y:3,units_name:'Infantry',units_hit_points:8,units_fuel:42,units_ammo:null,units_moved:1},12:{units_id:12,units_players_id:8,units_x:6,units_y:2,units_name:'Tank',units_hit_points:9,units_fuel:70,units_ammo:5,units_moved:0}};
 const root=document.querySelector('#gamemap');for(const [id,x,y,z] of [[11,3,3,105],[12,6,2,103]]){const span=document.createElement('span');span.className='game-unit';span.dataset.unitId=id;span.style.cssText=`position:absolute;width:16px;height:16px;left:${x*16}px;top:${y*16}px;z-index:${z}`;root.append(span);}
 const fog=document.querySelector('#fog-canvas').getContext('2d');fog.fillStyle='rgba(0,0,0,.3)';fog.fillRect(96,32,16,16);
}""")
 assert page.evaluate('window.__openedSockets')==0
 page.evaluate("""() => {window.officialSocket=new WebSocket('wss://awbw.amarriner.com/prod/game/1741140');officialSocket.send(JSON.stringify({action:'Move',playerID:7,unitID:8,path:[0,1,2],authToken:'secret'}));officialSocket.dispatchEvent(new MessageEvent('message',{data:JSON.stringify({0:{action:'Move',unit:{units_id:8,units_x:2,units_y:0,units_hit_points:9,units_players_id:7},sessionToken:'secret'}})}));}""")
 assert page.evaluate('window.__openedSockets')==1
 assert len(page.evaluate('window.__sent'))==1
 page.locator('#fc-bridge-tool summary').click()
 with page.expect_download() as dl:page.locator('#fc-bridge-tool #snapshot').click()
 file=Path(temp)/'snapshot.json';dl.value.save_as(file);snapshot=json.loads(file.read_text())
 assert snapshot['format']=='field-command-snapshot-v2'
 assert snapshot['map']['width']==19 and snapshot['map']['height']==17
 assert snapshot['map']['layers']==[]
 assert len(snapshot['game']['units'])==1
 assert snapshot['game']['units'][0]['id']==11 and snapshot['game']['units'][0]['ammo'] is None
 assert snapshot['game']['currentPlayerId']==8 and snapshot['game']['canSendOrders'] is False
 assert snapshot['map']['frame'].startswith('data:image/png;base64,')
 with page.expect_download() as dl:page.locator('#fc-bridge-tool #inspect').click()
 inspection=Path(temp)/'inspection.json';dl.value.save_as(inspection);evidence=json.loads(inspection.read_text())
 assert 'secret' not in inspection.read_text()
 outgoing=next(r for r in evidence['contracts'] if r.get('direction')=='outgoing')
 incoming=next(r for r in evidence['contracts'] if r.get('direction')=='incoming')
 assert outgoing['requestSample']=={'action':'Move','playerID':7,'unitID':8,'path':[0,1,2]}
 assert incoming['responseSample']['0']['unit']['units_hit_points']==9
 assert page.evaluate('window.__sent.length')==1  # exporter did not add any action
 view=c.new_page();view.goto(BROWSER_BASE_URL + '/play.html');view.locator('.map-cell').first.wait_for();view.locator('#menu-open').click();view.locator('#snapshot-input').set_input_files(file)
 view.wait_for_function("document.querySelector('#mode').textContent==='AWBW · SNAPSHOT'")
 assert view.locator('.map-cell.raster').count()==323
 assert view.locator('#end-turn').is_disabled()
 view.locator('[data-x="3"][data-y="3"]').click()
 assert view.locator('#unit-name').inner_text()=='Infantry'
 assert 'HP 8/10' in view.locator('#unit-stats').inner_text()
 # Verify captured fog stays opaque and ground stays visible outside it.
 pixels=view.evaluate("""async () => {const image=new Image();image.src=JSON.parse(document.querySelector('#map').style.backgroundImage.slice(4,-1)).replace(/^data:/,'data:');await image.decode();const canvas=document.createElement('canvas');canvas.width=304;canvas.height=272;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);return [Array.from(ctx.getImageData(0,0,1,1).data),Array.from(ctx.getImageData(32,32,1,1).data)];}""")
 assert pixels[0][:3]==[24,32,48] and pixels[1][:3]==[68,170,34]
 c.close();b.close()
print('PASS: actual AWBW canvas selectors/dimensions, fog stacking, sidebar exclusion, native WebSocket order/ack observation, secret removal, no inspector-originated socket/order, read-only frame import.')
