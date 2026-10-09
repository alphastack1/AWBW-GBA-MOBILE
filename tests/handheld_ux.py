"""GBA interaction checks against local practice only; never submit live AWBW orders."""
from browser_config import BROWSER_BASE_URL
from pathlib import Path
import shutil,json
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path=shutil.which('chromium'),args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(BROWSER_BASE_URL+'/play.html');page.locator('.map-cell').first.wait_for()
 page.locator('[data-x="3"][data-y="5"]').click()
 page.get_by_role('button',name='Unit details',exact=True).click()
 assert page.locator('#unit-details').is_visible()
 assert '3 points' in page.locator('#unit-details-body').inner_text()
 page.get_by_role('button',name='Close unit details',exact=True).click()
 page.locator('#range-move').click();assert page.locator('.inspect-move').count()>1
 assert page.evaluate("localStorage.getItem('field-command-practice-v1')")==None
 page.locator('#range-attack').click();assert page.locator('.inspect-attack').count()>1
 page.get_by_role('button',name='Move',exact=True).click()
 page.locator('[data-x="5"][data-y="5"]').click()
 assert page.locator('.route-tile').count()==3
 assert page.locator('.destination-ghost').count()==1
 page.get_by_role('button',name='Wait',exact=True).click()
 assert page.locator('#map').get_attribute('aria-busy')=='true'
 assert page.locator('.moving-unit').count()==1
 assert json.loads(page.evaluate("localStorage.getItem('field-command-practice-v1')"))['units'][0]['x']==5
 page.wait_for_function("document.querySelector('#map').getAttribute('aria-busy')==='false'")
 assert page.locator('.moving-unit').count()==0

 # Place an ordinary adjacent enemy in a deterministic practice fixture.
 page.evaluate("""async()=>{const{createPractice}=await import('/tactics.js');const state=createPractice();const enemy=state.units.find(u=>u.id==='ge2');enemy.x=4;enemy.y=4;localStorage.setItem('field-command-practice-v1',JSON.stringify(state));}""")
 page.reload();page.locator('.map-cell').first.wait_for()
 page.locator('[data-x="3"][data-y="5"]').click();page.get_by_role('button',name='Move',exact=True).click();page.locator('[data-x="3"][data-y="4"]').click()
 page.get_by_role('button',name='Attack',exact=True).click();page.locator('[data-x="4"][data-y="4"]').click()
 assert page.locator('#forecast').is_visible()
 assert page.locator('.damage-value').all_text_contents()==['10%','20%']
 before=json.loads(page.evaluate("localStorage.getItem('field-command-practice-v1')"))
 assert before['units'][0]['hp']==10 and before['units'][0]['y']==5
 assert not before['units'][0]['spent']
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 (ROOT/'artifacts').mkdir(exist_ok=True);page.screenshot(path=str(ROOT/'artifacts/gba-forecast-mobile.png'),full_page=True)
 page.get_by_role('button',name='Cancel order',exact=True).click();assert page.locator('#forecast').is_hidden()
 page.locator('[data-x="4"][data-y="4"]').click();page.get_by_role('button',name='Fire',exact=True).click()
 after=json.loads(page.evaluate("localStorage.getItem('field-command-practice-v1')"))
 assert after['units'][0]['hp']==9 and next(u for u in after['units'] if u['id']=='ge2')['hp']==8
 page.wait_for_function("document.querySelector('#map').getAttribute('aria-busy')==='false'")
 page.locator('#menu-open').click();assert '2 READY / 3 UNITS' in page.locator('#menu-summary').inner_text()
 page.get_by_role('tab',name='UNITS',exact=True).click();assert page.locator('.roster-unit').count()==3
 page.screenshot(path=str(ROOT/'artifacts/gba-roster-mobile.png'),full_page=True)
 page.locator('.roster-unit').nth(1).click();assert page.locator('#game-menu').is_hidden()
 assert page.locator('#unit-name').inner_text()=='OS TANK'
 page.locator('#menu-open').click();page.get_by_role('tab',name='RECORD',exact=True).click();assert '20% damage' in page.locator('#battle-log').inner_text()
 page.get_by_role('tab',name='OPTIONS',exact=True).click();page.locator('#motion').click()
 assert json.loads(page.evaluate("localStorage.getItem('field-command-settings-v1')"))['motion']==False
 page.locator('#menu-close').click()
 page.get_by_role('button',name='Move',exact=True).click();page.locator('[data-x="5"][data-y="6"]').click();page.get_by_role('button',name='Wait',exact=True).click()
 assert page.locator('.moving-unit').count()==0
 for width,height in [(320,700),(844,390),(390,844)]:
  page.set_viewport_size({'width':width,'height':height});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 assert not errors,errors
 browser.close()
print('PASS: inspection without orders, movement/threat overlays, traversable route and animation, pre-order damage/counter forecast, terrain cover, B backtracking, Fire commit, roster navigation, history, motion preference and phone widths. Local practice only.')
