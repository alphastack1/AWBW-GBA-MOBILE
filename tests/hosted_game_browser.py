"""The actual hosted game-card route, native terrain rendering and account view.
Controlled account responses only; never sign in to or issue orders to AWBW.
"""
from browser_config import BROWSER_BASE_URL
from pathlib import Path
import json,subprocess,shutil
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
models=json.loads(subprocess.check_output(['node','--input-type=module','-e',"import{gamePage}from'./tests/fixtures/awbw-game.mjs';import{parseGamePage,parseGameContext}from'./server/awbw-game.mjs';import{inspectUnit,prepareOrder}from'./server/awbw-preview.mjs';const options={gameId:'123',username:'player',title:'River & Road'},c=parseGameContext(gamePage(),options),live=parseGameContext(gamePage().replace('const currentTurn = 8;','const currentTurn = 7;'),options);live.playersInfo[7].players_funds=10000;console.log(JSON.stringify({data:parseGamePage(gamePage(),options),inspection:inspectUnit(c,11).public,plans:{select:prepareOrder(live,{kind:'unit',unitId:11}),move:prepareOrder(live,{kind:'unit',unitId:11,x:1,y:0}),stay:prepareOrder(live,{kind:'unit',unitId:11,x:1,y:1}),build:prepareOrder(live,{kind:'build',x:0,y:0}),end:prepareOrder(live,{kind:'end'}),fire:prepareOrder(live,{kind:'unit',unitId:11,x:1,y:1,defenderId:13})}}));"],cwd=ROOT,text=True))
data=models['data']
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path=shutil.which('chromium'),args=['--no-sandbox'])
 context=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
 calls=[]
 def api(route):
  request=route.request;calls.append((request.method,request.url));assert request.method=='GET' or 'action=forecast' in request.url
  if 'action=session' in request.url:body={'ready':True,'authenticated':True,'username':'player','csrf':'fixture-csrf'}
  elif 'action=games' in request.url:body={'username':'player','games':[{'id':'123','title':'River & Road','yourTurn':True}]}
  elif 'action=game&gameId=123' in request.url:body=data
  elif 'action=inspect&' in request.url:body=models['inspection']
  elif 'action=forecast&' in request.url:
   assert request.post_data_json=={'attackerId':11,'defenderId':13};assert request.headers['x-fc-csrf']=='fixture-csrf'
   body={'attackerId':11,'defenderId':13,'damage':{'min':49,'max':57},'counter':{'min':24,'max':34},'source':'AWBW calculator','readOnly':True}
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
 page.locator('#range-move').click();page.locator('.inspect-move').first.wait_for();assert page.locator('.inspect-move').count()==len(models['inspection']['reachable'])
 page.locator('#range-attack').click();assert page.locator('.inspect-attack').count()==len(models['inspection']['attackRange'])
 assert page.evaluate("localStorage.getItem('field-command-practice-v1')") is None
 page.get_by_role('button',name='Damage check',exact=True).click();page.locator('[data-x="1"][data-y="2"]').click();page.locator('#forecast').wait_for(state='visible');assert page.locator('.damage-value').all_text_contents()==['24–34%','49–57%'];assert page.get_by_role('button',name='Fire',exact=True).count()==0
 page.locator('#cancel').click();assert page.locator('#forecast').is_hidden();page.locator('#cancel').click()
 (ROOT/'artifacts').mkdir(exist_ok=True);page.screenshot(path=str(ROOT/'artifacts/hosted-battlefield-mobile.png'))
 page.get_by_role('button',name='Refresh',exact=True).click();page.wait_for_function("document.querySelector('#message').textContent.includes('battlefield is open')")
 page.locator('#menu-open').click();assert page.locator('#end-turn').is_disabled();assert page.get_by_role('link',name='Connect an AWBW match ↗').is_hidden();page.locator('#menu-close').click()
 assert page.evaluate("localStorage.getItem('field-command-practice-v1')") is None
 assert not errors,errors;assert all(method=='GET' or 'action=forecast' in url for method,url in calls)
 context.close()
 # A failed read must not turn the practice field into a fake online game.
 context=browser.new_context();context.route('**/api/awbw/account?*',lambda r:r.fulfill(status=502,content_type='application/json',body=json.dumps({'message':'AWBW view is incomplete.'})))
 page=context.new_page();page.goto(BROWSER_BASE_URL+'/play.html?game=123');page.get_by_text('AWBW view is incomplete.',exact=True).wait_for()
 assert page.locator('#map').is_hidden();assert page.locator('#commands button').first.is_disabled();assert page.locator('#end-turn').is_disabled()
 context.close()
 # Hosted order UI uses native previews, one commit and authoritative updates.
 # These responses are fixtures, including the simulated accepted event.
 import copy
 online=copy.deepcopy(data);online['game']['currentPlayerId']=7;online['game']['funds']=10000;online['capabilities']={'available':True,'enabled':True,'locked':False,'revision':'fixture-version'}
 context=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True);commits=[];online_calls=[]
 def online_api(route):
  request=route.request;online_calls.append((request.method,request.url))
  if 'action=session' in request.url:body={'ready':True,'authenticated':True,'username':'player','csrf':'fixture-csrf'}
  elif 'action=game&' in request.url:body=online
  elif 'action=plan&' in request.url:
   selected=request.post_data_json
   key='fire' if 'defenderId' in selected else selected['kind'] if selected['kind']!='unit' else 'select' if 'x' not in selected else 'stay' if selected['y']==1 else 'move'
   prepared=copy.deepcopy(models['plans'][key]);body={'plan':{**prepared['preview'],'token':'fixture-plan-'+key,'revision':'fixture-version','choices':[{'key':c['key'],'label':c['label']} for c in prepared['choices']]}}
  elif 'action=forecast&' in request.url:body={'attackerId':11,'defenderId':13,'damage':{'min':49,'max':57},'counter':{'min':24,'max':34},'source':'AWBW calculator','version':'fixture-version'}
  elif 'action=commit&' in request.url:
   assert request.headers['x-fc-csrf']=='fixture-csrf';commits.append(request.post_data_json);choice=commits[-1]['choice']
   if choice=='Move':online['game']['units'][0].update({'x':1,'y':0,'spent':True,'hp':7})
   elif choice=='Fire':online['game']['units'][0].update({'spent':True,'hp':9});online['game']['units'][1]['hp']=4
   elif choice=='End':online['capabilities'].update({'available':False,'reason':'Waiting for your turn.'});online['game']['currentPlayerId']=8
   elif choice.startswith('Build:'):online['game']['units'].append({'id':99,'owner':7,'x':0,'y':0,'name':'Infantry','army':'ge','hp':10,'fuel':99,'ammo':0,'spent':True})
   body={'status':'observed','submitted':True,'message':'AWBW returned the matching game event.'}
  else:raise AssertionError(request.url)
  route.fulfill(status=200,content_type='application/json',body=json.dumps(body))
 context.route('**/api/awbw/account?*',online_api);page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.goto(BROWSER_BASE_URL+'/play.html?game=123');page.wait_for_function("document.querySelector('#mode').textContent==='AWBW · YOUR TURN'")
 # Select → destination → B → choose again; no order has yet been issued.
 page.locator('[data-x="1"][data-y="1"]').click();page.get_by_role('button',name='Stay here',exact=True).wait_for();assert page.locator('.reachable').count()>1
 page.locator('[data-x="1"][data-y="0"]').click();page.get_by_role('button',name='Wait',exact=True).wait_for();assert page.locator('.route-tile').count()==2
 page.locator('#cancel').click();page.get_by_role('button',name='Stay here',exact=True).wait_for();assert not commits
 page.locator('[data-x="1"][data-y="0"]').click();page.get_by_role('button',name='Wait',exact=True).wait_for()
 page.evaluate("const button=[...document.querySelectorAll('#commands button')].find(b=>b.textContent==='Wait');button.click();button.click();")
 page.wait_for_function("document.querySelector('#unit-stats').textContent.includes('HP 7/10')");page.wait_for_function("document.querySelector('#map').getAttribute('aria-busy')==='false'");assert len(commits)==1;assert page.locator('[data-x="1"][data-y="0"] .health').inner_text()=='7'
 # Build and End use the same preview transport with no confirmation dialog.
 page.locator('[data-x="0"][data-y="0"]').click();page.get_by_role('button',name='Infantry · 1,000 G',exact=True).wait_for();page.get_by_role('button',name='Infantry · 1,000 G',exact=True).click();page.wait_for_function("document.querySelector('#menu-summary').textContent.includes('/ 2 UNITS')");assert len(commits)==2
 # Begin a fresh fixture turn and check damage → B → target → Fire.
 online['game']['units'][0].update({'x':1,'y':1,'spent':False,'hp':10});page.locator('#menu-open').click();page.locator('#refresh-game').click();page.wait_for_function("document.querySelector('#menu-summary').textContent.startsWith('1 READY')")
 page.locator('[data-x="1"][data-y="1"]').click();page.get_by_role('button',name='Stay here',exact=True).wait_for();page.get_by_role('button',name='Stay here',exact=True).click();page.get_by_role('button',name='Damage check',exact=True).wait_for();page.get_by_role('button',name='Damage check',exact=True).click();page.locator('[data-x="1"][data-y="2"]').click();page.get_by_role('button',name='Fire',exact=True).wait_for();assert len(commits)==2
 page.locator('#cancel').click();assert page.locator('#forecast').is_hidden();page.locator('[data-x="1"][data-y="2"]').click();page.get_by_role('button',name='Fire',exact=True).wait_for();page.locator('#select').click();page.wait_for_function("document.querySelector('#unit-stats').textContent.includes('HP 4/10')");assert commits[-1]['choice']=='Fire';assert len(commits)==3
 page.wait_for_function("document.querySelector('#map').getAttribute('aria-busy')==='false'")
 # A failed refresh retains the field but revokes cached order eligibility.
 page.route('**/api/awbw/account?action=game&*',lambda r:r.fulfill(status=502,content_type='application/json',body=json.dumps({'message':'AWBW connection interrupted.'})))
 page.locator('#menu-open').click();page.locator('#refresh-game').click();page.get_by_text('AWBW connection interrupted.',exact=True).wait_for();assert page.locator('#end-turn').is_disabled();assert len(commits)==3;assert page.locator('.map-cell').count()==16
 page.unroute('**/api/awbw/account?action=game&*');page.locator('#menu-open').click();page.locator('#refresh-game').click();page.wait_for_function("document.querySelector('#mode').textContent==='AWBW · YOUR TURN'");page.wait_for_function("!document.querySelector('#end-turn').disabled")
 page.locator('#menu-open').click();page.locator('#end-turn').click();page.wait_for_function("document.querySelector('#mode').textContent==='AWBW · WAITING'");assert len(commits)==4;assert page.locator('#end-turn').is_disabled()
 # B closes the topmost menu, and controls stay reachable in landscape.
 page.locator('#menu-open').click();page.keyboard.press('b');assert not page.locator('#game-menu').is_visible()
 for width,height in [(320,700),(844,390),(390,844)]:
  page.set_viewport_size({'width':width,'height':height});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');assert page.locator('#map-scroll').bounding_box()['height']==height
  for control in ['#menu-open','#cancel','#select']:
   box=page.locator(control).bounding_box();assert box['x']>=0 and box['y']>=0 and box['x']+box['width']<=width and box['y']+box['height']<=height
 assert not errors,errors;context.close()
 big=copy.deepcopy(online);big['width']=18;big['height']=24;big['terrain']={str(x):{str(y):{'terrain_id':1} for y in range(24)} for x in range(18)};big['terrainDetails']=[{'name':'Plain','defense':1,'visible':True} for _ in range(18*24)];big['fog']=[False]*(18*24);big['buildings']={};big['game']['units']=[{**data['game']['units'][0],'x':7,'y':7}]
 context=browser.new_context(viewport={'width':390,'height':844});context.route('**/api/awbw/account?*',lambda r:r.fulfill(status=200,content_type='application/json',body=json.dumps(big)));page=context.new_page();page.goto(BROWSER_BASE_URL+'/play.html?game=123');page.wait_for_function("document.querySelectorAll('.map-cell').length===432")
 page.locator('#map-scroll').evaluate('field=>field.scrollTo(91,120)');assert page.locator('#map-scroll').evaluate('f=>[f.scrollLeft,f.scrollTop]')==[91,120]
 big['day']=13;page.evaluate("document.dispatchEvent(new Event('visibilitychange'))");page.wait_for_function("document.querySelector('#army').textContent.includes('DAY 13')");assert page.locator('#map-scroll').evaluate('f=>[f.scrollLeft,f.scrollTop]')==[91,120]
 context.close()
 # Session expiry remembers the game and opens the hosted sign-in screen.
 context=browser.new_context()
 def expired_api(route):
  expired='action=game&' in route.request.url
  route.fulfill(status=401 if expired else 200,content_type='application/json',body=json.dumps({'message':'Your AWBW session expired.'} if expired else {'ready':True,'authenticated':False}))
 context.route('**/api/awbw/account?*',expired_api);page=context.new_page();page.goto(BROWSER_BASE_URL+'/play.html?game=123');page.wait_for_url(BROWSER_BASE_URL+'/?returnGame=123');page.locator('#signin-view').wait_for(state='visible');assert page.locator('#password').input_value()==''
 context.close();browser.close()
print('PASS: sign-in lobby game card stays in the app, viewer-specific map/funds/CO, native terrain renderer, visible units, native ranges/damage, B navigation, refresh, one Move/Build/Fire/End submission and turn revocation and fail-closed loading. Controlled account responses; no real AWBW orders were issued.')
