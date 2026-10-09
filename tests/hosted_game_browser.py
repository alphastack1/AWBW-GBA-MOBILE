"""The actual hosted game-card route, native terrain rendering and account view.
Controlled account responses only; never sign in to or issue orders to AWBW.
"""
from browser_config import BROWSER_BASE_URL
from pathlib import Path
import json,subprocess,shutil
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
data=json.loads(subprocess.check_output(['node','--input-type=module','-e',"import{gamePage}from'./tests/fixtures/awbw-game.mjs';import{parseGamePage}from'./server/awbw-game.mjs';console.log(JSON.stringify(parseGamePage(gamePage(),{gameId:'123',username:'player',title:'River & Road'})));"],cwd=ROOT,text=True))
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path=shutil.which('chromium'),args=['--no-sandbox'])
 context=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
 calls=[]
 def api(route):
  request=route.request;calls.append((request.method,request.url));assert request.method=='GET'
  if 'action=session' in request.url:body={'ready':True,'authenticated':True,'username':'player','csrf':'fixture-csrf'}
  elif 'action=games' in request.url:body={'username':'player','games':[{'id':'123','title':'River & Road','yourTurn':True}]}
  elif 'action=game&gameId=123' in request.url:body=data
  else:raise AssertionError(request.url)
  route.fulfill(status=200,content_type='application/json',body=json.dumps(body))
 context.route('**/api/awbw/account?*',api)
 page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(BROWSER_BASE_URL+'/');page.locator('.game-card').first.wait_for();page.locator('.game-card').click()
 page.wait_for_function("document.querySelectorAll('.map-cell').length===16")
 assert page.url==BROWSER_BASE_URL+'/play.html?game=123'
 assert page.locator('#mode').inner_text()=='AWBW · ONLINE READ-ONLY'
 assert page.locator('#funds').inner_text()=='800 G'
 assert page.locator('#operation').inner_text()=='ADDER'
 assert 'data:image/png;base64' in page.locator('#map').get_attribute('style')
 assert page.locator('.live-layer.unit').count()==2
 assert page.locator('#portrait').evaluate('i=>i.complete&&i.naturalWidth>0')
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 assert page.locator('.battle-space').bounding_box()['height']==844
 # Own Infantry is selectable for inspection; no practice/local orders appear.
 page.locator('[data-x="1"][data-y="1"]').click()
 assert page.locator('#unit-name').inner_text()=='Infantry'
 assert page.get_by_role('button',name='Move',exact=True).count()==0
 page.locator('#unit-info').click();assert 'Fuel' in page.locator('#unit-details-body').inner_text();page.locator('#unit-details-close').click()
 (ROOT/'artifacts').mkdir(exist_ok=True);page.screenshot(path=str(ROOT/'artifacts/hosted-battlefield-mobile.png'))
 page.get_by_role('button',name='Refresh',exact=True).click();page.wait_for_function("document.querySelector('#message').textContent.includes('battlefield is open')")
 page.locator('#menu-open').click();assert page.locator('#end-turn').is_disabled();assert page.get_by_role('link',name='Connect an AWBW match ↗').is_hidden();page.locator('#menu-close').click()
 assert page.evaluate("localStorage.getItem('field-command-practice-v1')") is None
 assert not errors,errors;assert all(method=='GET' for method,url in calls)
 context.close()
 # A failed read must not turn the practice field into a fake online game.
 context=browser.new_context();context.route('**/api/awbw/account?*',lambda r:r.fulfill(status=502,content_type='application/json',body=json.dumps({'message':'AWBW view is incomplete.'})))
 page=context.new_page();page.goto(BROWSER_BASE_URL+'/play.html?game=123');page.get_by_text('AWBW view is incomplete.',exact=True).wait_for()
 assert page.locator('#map').is_hidden();assert page.locator('#commands button').first.is_disabled();assert page.locator('#end-turn').is_disabled()
 context.close();browser.close()
print('PASS: sign-in lobby game card stays in the app, viewer-specific map/funds/CO, native terrain renderer, visible units, inspection, refresh, GET-only transport and fail-closed loading. Controlled account responses; live hosted orders remain disabled.')
