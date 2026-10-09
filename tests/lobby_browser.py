"""Read the player's existing games, in the mobile interface, without an account proxy."""
from pathlib import Path
import shutil
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
all_games='''<html><body><a href="game.php?games_id=1741140">My game &lt;script&gt;unsafe&lt;/script&gt;</a><a href="game.php?games_id=1741140">Duplicate</a><a href="game.php?games_id=1741141">Other game</a><a href="https://evil.example/game.php?games_id=12">Hostile</a></body></html>'''
with sync_playwright() as p:
 b=p.chromium.launch(headless=True,executable_path=shutil.which('chromium'),args=['--no-sandbox'])
 c=b.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
 c.add_init_script((ROOT/'awbw-bridge.user.js').read_text());requests=[]
 def route(r):
  requests.append((r.request.method,r.request.url));body='<html><body><a href="game.php?games_id=1741140">My game</a></body></html>' if 'yourTurn=1' in r.request.url else all_games
  r.fulfill(status=200,content_type='text/html',body=body)
 c.route('https://awbw.amarriner.com/**',route)
 page=c.new_page();page.goto('https://awbw.amarriner.com/yourgames.php');page.locator('#fc-lobby #status').get_by_text('2 games · 1 awaiting your move',exact=True).wait_for()
 assert page.locator('#fc-lobby .game-link').count()==2
 assert page.locator('#fc-lobby .game-link').first.get_attribute('href')=='https://awbw.amarriner.com/game.php?games_id=1741140'
 assert '<script>unsafe</script>' in page.locator('#fc-lobby .game-link').first.inner_text()
 assert page.locator('#fc-lobby script').count()==0
 assert all(method=='GET' for method,_ in requests)
 assert page.evaluate('innerWidth')==390
 page.locator('#fc-lobby #original').click();assert page.locator('#fc-lobby').count()==0
 assert page.locator('meta[name="viewport"]').count()==0 and page.evaluate('document.body.style.overflow')==''
 c.close();b.close()
print('PASS: phone-sized lobby, real same-origin game/turn reads, deduplication, hostile-link exclusion, escaped titles, GET-only behavior and original viewport restoration.')
