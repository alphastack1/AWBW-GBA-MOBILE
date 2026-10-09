"""Load the real MV3 package and exercise its isolated bootstrap + MAIN world bridge."""
from pathlib import Path
import ast, json, tempfile, shutil
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
definitions=ast.parse((ROOT/'tests/live_browser.py').read_text())
fixture=next(ast.literal_eval(n.value) for n in definitions.body if isinstance(n,ast.Assign) and isinstance(n.targets[0],ast.Name) and n.targets[0].id=='fixture')
fixture=fixture.replace("window.emitData=(socket,data)=>socket.send(JSON.stringify(data));", "window.__sent=[];window.emitData=(socket,data)=>{__sent.push(data);socket.send(JSON.stringify(data));};")
fixture=fixture.replace("window.webSocket=new WebSocket('wss://awbw.amarriner.com/node/game/1741140');", """window.webSocket=new WebSocket('wss://awbw.amarriner.com/node/game/1741140');webSocket.addEventListener('message',e=>{const data=JSON.parse(e.data);for(const v of Object.values(data)){if(v.action==='Move'){const u=unitsInfo[v.unit.units_id];Object.assign(u,v.unit);const span=document.querySelector(`[data-unit-id="${u.units_id}"]`);span.style.left=`${u.units_x*16}px`;span.style.top=`${u.units_y*16}px`;}if(v.action==='NextTurn'){currentTurn=v.nextPId;gameDay=v.day;document.querySelector('h1').textContent=`Day ${gameDay}`;}}clientLastUpdated++;});""")
with sync_playwright() as p,tempfile.TemporaryDirectory() as profile:
 extension=str(ROOT/'extension-dist')
 c=p.chromium.launch_persistent_context(profile,headless=True,ignore_default_args=['--disable-extensions'],executable_path=shutil.which('chromium'),args=['--no-sandbox','--enable-unsafe-extension-debugging',f'--disable-extensions-except={extension}',f'--load-extension={extension}'],viewport={'width':390,'height':844})
 cdp=c.browser.new_browser_cdp_session();cdp.send('Extensions.loadUnpacked',{'path':extension})
 c.route('https://awbw.amarriner.com/**',lambda r:r.fulfill(status=200,content_type='text/html',body=fixture))
 sockets=[]
 def connect(ws):
  sockets.append(ws)
  def receive(message):
   command=json.loads(message)
   if command['action']=='Move':
    end=command['path'][-1];event={'action':'Move','unit':{'units_id':command['unitID'],'units_players_id':command['playerID'],'units_x':end%21,'units_y':end//21,'units_moved':1}}
   else:event={'action':'NextTurn','day':12,'nextPId':8}
   ws.send(json.dumps({event['action']:event}))
  ws.on_message(receive)
 c.route_web_socket('wss://awbw.amarriner.com/**',connect)
 page=c.pages[0];errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto('https://awbw.amarriner.com/game.php?games_id=1741140')
 frame=page.frame_locator('#fc-handheld iframe')
 try:frame.locator('#mode').get_by_text('AWBW · LIVE ORDERS',exact=True).wait_for(timeout=10000)
 except Exception:
  print('Extension diagnostics:',errors,page.evaluate("({bootstrap:document.documentElement.getAttribute('data-fc-extension-client'),bridge:window.__fieldCommandBridge,frame:document.querySelector('#fc-handheld iframe')?.src,tool:document.querySelector('#fc-bridge-tool')?.shadowRoot?.textContent})"),[(f.url,f.locator('body').inner_text()[:200] if not f.is_detached() else 'detached') for f in page.frames]);raise
 source=page.locator('#fc-handheld iframe').get_attribute('src');assert source.startswith('chrome-extension://')
 assert frame.locator('.map-cell').count()==399
 frame.locator('[data-x="3"][data-y="3"]').click();frame.get_by_role('button',name='Stay here',exact=True).wait_for();frame.locator('[data-x="4"][data-y="3"]').click();frame.get_by_role('button',name='Wait',exact=True).click()
 frame.locator('#message').get_by_text('AWBW returned the matching game event. Review the updated board.',exact=True).wait_for()
 assert page.evaluate('__sent')==[{'action':'Move','path':[66,67],'playerID':7,'unitID':11}]
 frame.locator('#menu-open').click();frame.locator('#end-turn').click();frame.locator('#day').get_by_text('DAY 12',exact=True).wait_for()
 assert page.evaluate('__sent[1]')=={'action':'End','playerID':7};assert len(sockets)==1
 assert frame.locator('#end-turn').is_disabled();assert not errors,errors
 c.close()
print('PASS: installed MV3 extension, isolated resource bootstrap, MAIN world official socket, extension iframe/CSP, bundled assets, direct Move/End and server-event correlation.')
