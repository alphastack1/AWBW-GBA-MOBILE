"""Mobile-sized, same-tab userscript installation with no hosted client or asset import."""
from pathlib import Path
import ast, shutil
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
definitions=ast.parse((ROOT/'tests/live_browser.py').read_text())
values={n.targets[0].id:ast.literal_eval(n.value) for n in definitions.body if isinstance(n,ast.Assign) and isinstance(n.targets[0],ast.Name) and n.targets[0].id in ['stub','fixture']}
with sync_playwright() as p:
 b=p.chromium.launch(headless=True,executable_path=shutil.which('chromium'),args=['--no-sandbox'])
 c=b.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
 c.add_init_script(values['stub']+'\n'+(ROOT/'awbw-bridge.user.js').read_text())
 requests=[];errors=[]
 c.route('https://awbw.amarriner.com/**',lambda r:r.fulfill(status=200,content_type='text/html',body=values['fixture']))
 page=c.new_page();page.on('request',lambda r:requests.append(r.url));page.on('pageerror',lambda e:errors.append(str(e)));page.goto('https://awbw.amarriner.com/game.php?games_id=1741140')
 frame=page.frame_locator('#fc-handheld iframe');frame.locator('.map-cell').first.wait_for();frame.locator('#mode').get_by_text('AWBW · LIVE ORDERS',exact=True).wait_for()
 assert frame.locator('.map-cell').count()==399
 assert page.evaluate('__socketCount')==1 and page.evaluate('__sent.length')==0
 assert page.frames[1].evaluate('document.documentElement.scrollWidth<=innerWidth')
 assert page.frames[1].evaluate('innerWidth')==390
 assert not any('/terrain/' in u or 'localhost' in u for u in requests),requests
 frame.locator('[data-x="3"][data-y="3"]').click();frame.get_by_role('button',name='Stay here',exact=True).wait_for();frame.locator('[data-x="4"][data-y="3"]').click();frame.get_by_role('button',name='Capture',exact=True).wait_for()
 page.screenshot(path=str(ROOT/'artifacts/mobile-live-orders.png'))
 # A repeated event on the old button still submits only once.
 frame.get_by_role('button',name='Capture',exact=True).evaluate('(button)=>{button.click();button.click();}')
 frame.locator('#message').get_by_text('AWBW returned the matching game event. Review the updated board.',exact=True).wait_for()
 assert page.evaluate('__sent')==[{'action':'Capt','path':[66,67],'playerID':7,'unitID':11}]
 frame.get_by_role('button',name='AWBW controls ↗',exact=True).click();page.wait_for_function("!document.querySelector('#fc-handheld')");assert page.locator('#fc-handheld').count()==0
 assert page.evaluate("sessionStorage.getItem('field-command-original')")=='1'
 # Manual reopen has no opt-in or confirmation modal.
 page.locator('#fc-bridge-tool summary').click();page.locator('#fc-bridge-tool #embedded').click();frame=page.frame_locator('#fc-handheld iframe');frame.locator('#mode').get_by_text('AWBW · LIVE ORDERS',exact=True).wait_for();assert frame.locator('#order-confirm').count()==0
 assert not errors,errors
 c.close()
 # A manager that injects after the game's scripts still reuses the existing socket.
 late=b.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
 late.add_init_script(values['stub']);late.route('https://awbw.amarriner.com/**',lambda r:r.fulfill(status=200,content_type='text/html',body=values['fixture']))
 page=late.new_page();page.goto('https://awbw.amarriner.com/game.php?games_id=1741140');assert page.evaluate('__socketCount')==1
 page.evaluate((ROOT/'awbw-bridge.user.js').read_text());frame=page.frame_locator('#fc-handheld iframe');frame.locator('#mode').get_by_text('AWBW · LIVE ORDERS',exact=True).wait_for()
 frame.locator('[data-x="3"][data-y="3"]').click();frame.get_by_role('button',name='Stay here',exact=True).click();frame.get_by_role('button',name='Wait',exact=True).click();frame.locator('#message').get_by_text('AWBW returned the matching game event. Review the updated board.',exact=True).wait_for()
 assert page.evaluate('__socketCount')==1 and page.evaluate('__sent.length')==1
 late.close();b.close()
print('PASS: one-file mobile-sized installation, same-tab AWBW session, bundled artwork/no asset requests, direct Capture, duplicate click blocked, return/reopen original controls, no confirmation dialogs, late-injected existing-socket reuse.')
