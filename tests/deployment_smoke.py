"""Render TLS-verified deployed responses in Chromium; no AWBW credentials or orders.

The cloud proxy CA is available to Python's system trust bundle but missing from
Chromium's trust store. Replay the real responses fetched with verified TLS,
including their CSP, without weakening TLS or changing persistent browser trust.
This checks deployed bytes and UI, not Chromium's direct HTTPS transport.
"""
from pathlib import Path
import hashlib,json,sys,urllib.request
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright
import shutil

ROOT=Path(__file__).resolve().parents[1]
site=(sys.argv[1] if len(sys.argv)>1 else 'https://awbw-gba.netlify.app').rstrip('/')
assert urlparse(site).scheme=='https','Use the deployed HTTPS site.'
cache={}
(ROOT/'artifacts').mkdir(exist_ok=True)
def verified_get(url):
 assert urlparse(url).netloc==urlparse(site).netloc,'Unexpected external resource.'
 if url not in cache:
  with urllib.request.urlopen(urllib.request.Request(url,headers={'Accept-Encoding':'identity'}),timeout=30) as r:
   assert urlparse(r.url).netloc==urlparse(site).netloc,'Unexpected redirect.'
   headers={k.lower():v for k,v in r.headers.items() if k.lower() not in ['content-length','transfer-encoding','content-encoding','connection']}
   cache[url]=(r.status,headers,r.read(10000000))
 return cache[url]

with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path=shutil.which('chromium'),args=['--no-sandbox'])
 context=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
 def relay(route):
  assert route.request.method=='GET','Deployment checks never submit orders.'
  status,headers,body=verified_get(route.request.url)
  route.fulfill(status=status,headers=headers,body=body)
 context.route('**/*',relay)
 page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 response=page.goto(site+'/',wait_until='networkidle');assert response.status==200
 assert "script-src 'self'" in response.headers.get('content-security-policy','')
 page.get_by_role('button',name='Sign in to AWBW →',exact=True).wait_for()
 page.wait_for_function("!document.querySelector('#signin').disabled")
 assert page.locator('#signin-status').inner_text()=='Sign in when you’re ready.'
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 page.screenshot(path=str(ROOT/'artifacts/netlify-signin-mobile.png'),full_page=True)
 # The production account API must have its Functions secret and return an
 # anonymous session. This probe never supplies real credentials or signs in.
 status,headers,body=verified_get(site+'/api/awbw/account?action=session')
 assert status==200 and json.loads(body)=={'ready':True,'authenticated':False}
 assert headers.get('cache-control')=='no-store'
 page.get_by_role('link',name='Practice ↗',exact=True).click()
 page.locator('.map-cell').first.wait_for();assert page.locator('.map-cell').count()==252
 assert page.locator('#mode').inner_text()=='LOCAL PRACTICE'
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 assert page.locator('#portrait').evaluate('(image)=>image.complete&&image.naturalWidth>0')
 (ROOT/'artifacts').mkdir(exist_ok=True)
 page.screenshot(path=str(ROOT/'artifacts/netlify-mobile.png'),full_page=True)
 # This is explicitly local practice, so no multiplayer game state is changed.
 page.locator('[data-x="3"][data-y="5"]').click();page.get_by_role('button',name='Move',exact=True).click();page.locator('[data-x="3"][data-y="4"]').click();page.get_by_role('button',name='Wait',exact=True).click()
 assert page.evaluate("JSON.parse(localStorage.getItem('field-command-practice-v1')).units[0].y")==4
 page.locator('#menu-open').click();page.get_by_role('link',name='Connect an AWBW match ↗',exact=True).click()
 page.get_by_role('heading',name='Your AWBW. Handheld.',exact=True).wait_for()
 assert page.get_by_role('link',name='Download the mobile ZIP with installation guide',exact=True).count()==1
 for name in ['index.html','account.html','account.js','account.css','play.js','play.css','handheld-ux.js','awbw-bridge.user.js','field-command-mobile.zip']:
  status,headers,body=verified_get(site+'/'+name);assert status==200,(name,status)
  assert hashlib.sha256(body).digest()==hashlib.sha256((ROOT/name).read_bytes()).digest(),f'Deployed {name} differs from this checkout.'
 assert not errors,errors
 context.close();browser.close()
print('PASS: TLS-verified deployed Netlify responses rendered with their CSP in Chromium; anonymous account API readiness, mobile sign-in form/layout/artwork, practice movement/persistence, setup page and exact client/script/ZIP bytes. Positive real-account sign-in and direct Chromium HTTPS trust are not verified. No live AWBW orders submitted.')
