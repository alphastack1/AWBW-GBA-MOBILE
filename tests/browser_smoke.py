from browser_config import BROWSER_BASE_URL
"""Browser integration checks with AWBW-shaped fixtures; no real game mutations."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import shutil

ROOT = Path(__file__).resolve().parents[1]
script = (ROOT / 'field-command.user.js').read_text()
all_games = '''<!doctype html><html><head></head><body><h1>Original games</h1>
<a href="game.php?games_id=123">Twin Rivers</a>
<a href="game.php?games_id=123">View</a>
<a href="/game.php?games_id=456">&lt;img src=x onerror=alert(1)&gt;</a>
<a href="https://evil.example/game.php?games_id=789">Untrusted</a>
<a href="game.php?games_id=bad">Invalid ID</a></body></html>'''
turn_games = '<html><body><a href="game.php?games_id=123">Twin Rivers</a></body></html>'

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path=shutil.which('chromium'), args=['--no-sandbox'])
    page = browser.new_page(viewport={'width': 1440, 'height': 1000})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(BROWSER_BASE_URL + '/operations.html')
    page.locator('.game-card').first.wait_for()
    assert page.locator('.game-card').count() == 3
    page.locator('[data-filter="turn"]').click()
    assert page.locator('.game-card').count() == 2
    page.locator('[data-filter="waiting"]').click()
    assert page.locator('.game-card').count() == 1
    page.locator('[data-filter="all"]').click()
    (ROOT / 'artifacts').mkdir(exist_ok=True)
    page.screenshot(path=str(ROOT / 'artifacts/desktop.png'), full_page=True)
    page.set_viewport_size({'width':390,'height':844})
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.screenshot(path=str(ROOT / 'artifacts/mobile.png'), full_page=True)
    page.locator('#new-game').click()
    assert page.locator('a[href="play.html"]').is_visible()
    assert page.request.get(BROWSER_BASE_URL + '/field-command.user.js').status == 200
    assert not errors, errors
    page.close()

    # Live harness: intercept same-origin AWBW pages; never contact AWBW.
    context = browser.new_context(viewport={'width':390,'height':844})
    calls=[]
    def route(req):
        url=req.request.url
        calls.append((req.request.method,url))
        if '/game.php?' in url:
            html='<html><body><button id="original-control">Original AWBW control</button></body></html>'
        else:
            html=turn_games if 'yourTurn=1' in url else all_games
        req.fulfill(status=200,content_type='text/html',body=html)
    context.route('https://awbw.amarriner.com/**',route)
    page=context.new_page()
    page.goto('https://awbw.amarriner.com/yourgames.php')
    page.add_script_tag(content=script)
    page.locator('#fc-root .game-card').first.wait_for()
    assert page.locator('#fc-root .game-card').count()==2
    assert page.locator('#fc-root h2').all_text_contents()==['Twin Rivers','<img src=x onerror=alert(1)>']
    assert page.locator('#fc-root img').count()==0
    assert page.locator('#fc-root [data-filter="turn"] span').inner_text()=='1'
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.screenshot(path=str(ROOT / 'artifacts/live-fixture-mobile.png'),full_page=True)
    page.locator('#fc-root [data-filter="turn"]').click()
    assert page.locator('#fc-root .game-card').count()==1
    page.locator('#fc-root [data-game="123"]').click()
    assert page.locator('#fc-root iframe').get_attribute('src')=='https://awbw.amarriner.com/game.php?games_id=123'
    frame=page.frame_locator('#fc-root iframe')
    assert frame.locator('#original-control').is_visible()
    # Simulate userscript managers injecting the script into subframes; no recursion.
    for child in page.frames[1:]:
        child.evaluate(script)
        assert child.locator('#fc-root').count()==0
    page.locator('#fc-root .header-right [data-fc="exit"]').click()
    assert page.locator('#fc-root').count()==0
    assert page.evaluate('document.body.style.overflow')==''
    assert all(method=='GET' for method,url in calls)
    context.close()

    # Network failures remain recoverable.
    context=browser.new_context()
    context.route('https://awbw.amarriner.com/**',lambda r:r.fulfill(status=503,content_type='text/html',body='<html><head></head><body>Unavailable</body></html>'))
    page=context.new_page();page.goto('https://awbw.amarriner.com/yourgames.php');page.add_script_tag(content=script)
    page.locator('#fc-root [role="alert"]').wait_for()
    assert '503' in page.locator('#fc-root [role="alert"]').inner_text()
    assert page.locator('#fc-root [data-fc="exit"]').first.is_visible()
    context.close();browser.close()
print('PASS: preview desktop/mobile, filters, installation link, same-origin game extraction, deduplication, escaping, turn ownership, frame controls, recursion guard, restore original, GET-only reads, recoverable failures.')
