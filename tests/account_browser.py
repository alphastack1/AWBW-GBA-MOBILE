"""Hosted sign-in UX with controlled API responses; no real account credentials."""
from browser_config import BROWSER_BASE_URL
from pathlib import Path
import json,shutil
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path=shutil.which('chromium'),args=['--no-sandbox'])
 context=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
 requests=[];signed=False
 def api(route):
  global signed
  request=route.request;action=request.url.split('action=')[-1];requests.append(action)
  if action=='session':data={'ready':True,'authenticated':False}
  elif action=='login':
   body=json.loads(request.post_data);assert body=={'username':'commander','password':'fixture-password'}
   signed=True;data={'authenticated':True,'username':'commander','csrf':'fixture-csrf'}
  elif action=='games':
   assert signed;data={'username':'commander','games':[{'id':'123','title':'River & Road','yourTurn':True},{'id':'456','title':'<img src=x onerror=alert(1)>','yourTurn':False}]}
  elif action=='logout':
   assert request.headers['x-fc-csrf']=='fixture-csrf';signed=False;data={'authenticated':False}
  else:raise AssertionError(action)
  route.fulfill(status=200,content_type='application/json',body=json.dumps(data))
 context.route('**/api/awbw/account?*',api);page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(BROWSER_BASE_URL+'/');page.get_by_role('button',name='Sign in to AWBW →',exact=True).wait_for()
 assert not page.locator('#signin').is_disabled();assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 assert page.locator('.army-scene img').evaluate('i=>i.complete&&i.naturalWidth>0')
 (ROOT/'artifacts').mkdir(exist_ok=True);page.screenshot(path=str(ROOT/'artifacts/account-signin-mobile.png'),full_page=True)
 page.locator('#username').fill('commander');page.locator('#password').fill('fixture-password');page.locator('#show-password').click();assert page.locator('#password').get_attribute('type')=='text'
 page.locator('#signin').click();page.locator('.game-card').first.wait_for();assert page.locator('#account-name').inner_text()=='commander'
 assert page.locator('#password').input_value()=='';assert page.evaluate('localStorage.length')==0
 assert page.locator('.game-card').count()==1;page.get_by_role('tab',name='ALL GAMES 2').click();assert page.locator('.game-card').count()==2
 assert page.locator('#games img').count()==0;assert page.locator('.game-card').nth(1).get_attribute('href')=='/play.html?game=456'
 page.screenshot(path=str(ROOT/'artifacts/account-games-mobile.png'),full_page=True)
 page.locator('#signout').click();page.locator('#signin-view').wait_for(state='visible');assert page.locator('#games-view').is_hidden()
 assert page.locator('#password').get_attribute('type')=='password';assert requests==['session','login','games','logout']
 assert not errors,errors;context.close()
 # Missing configuration must not present a working form; bad credentials stay on sign-in.
 context=browser.new_context(viewport={'width':320,'height':700});context.route('**/api/awbw/account?*',lambda r:r.fulfill(status=503,content_type='application/json',body=json.dumps({'message':'Sign-in is being prepared. Please try again shortly.'})))
 page=context.new_page();page.goto(BROWSER_BASE_URL+'/account.html');page.get_by_text('Sign-in is being prepared. Please try again shortly.',exact=True).wait_for();assert page.locator('#signin').is_disabled();assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');context.close()
 context=browser.new_context();context.route('**/api/awbw/account?*',lambda r:r.fulfill(status=401 if 'action=login' in r.request.url else 200,content_type='application/json',body=json.dumps({'message':'Username or password did not match.'} if 'action=login' in r.request.url else {'ready':True,'authenticated':False})))
 page=context.new_page();page.goto(BROWSER_BASE_URL+'/account.html');page.locator('#username').fill('commander');page.locator('#password').fill('wrong-password');page.locator('#signin').click();page.get_by_text('Username or password did not match.',exact=True).wait_for();assert page.locator('#password').input_value()=='';assert page.locator('#games-view').is_hidden();context.close();browser.close()
print('PASS: phone sign-in, password visibility/clearing, no credential storage, real-list-shaped turn filters, escaped titles, logout, missing configuration and rejection. Controlled API fixtures only.')
