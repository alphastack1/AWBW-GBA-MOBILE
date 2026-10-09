from browser_config import BROWSER_BASE_URL
"""Ensure a new visitor receives bundled art without importing a pack."""
from pathlib import Path
import hashlib
import json
import shutil
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
catalog=json.loads((ROOT/'assets/catalog.json').read_text())
unique={a['file']:a for a in catalog['assets']}
assert unique, 'Expected bundled assets'
for name, record in unique.items():
    original=(ROOT/name).read_bytes()
    assert hashlib.sha256(original).hexdigest()==record['sha256']
    assert (ROOT/'dist'/name).read_bytes()==original
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path=shutil.which('chromium'),args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':390,'height':844})
    requests=[];page.on('request',lambda r:requests.append(r.url))
    page.goto(BROWSER_BASE_URL + '/asset-library.html')
    page.wait_for_function("document.querySelector('#workbench-status').textContent.includes('Ready to use')")
    assert page.locator('.sprite').count()==len(unique)
    broken=page.evaluate('''async () => { const bad=[]; await Promise.all([...document.querySelectorAll('.sprite img')].map(async img=>{try{await img.decode();}catch{bad.push(img.src);}})); return bad; }''')
    assert not broken, broken
    assert all(url.startswith(BROWSER_BASE_URL + '/') for url in requests)
    page.locator('#asset-search').fill('plain.gif')
    page.locator('.sprite').first.click();page.locator('#fill').click()
    assert page.locator('#sandbox img').count()==160
    page.locator('#asset-search').fill('osinfantry.gif')
    page.locator('.sprite').first.click();page.locator('[data-layer="unit"]').click();page.locator('#paint').click()
    assert page.locator('#sandbox .unit-sprite').count()==1
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.screenshot(path=str(ROOT/'artifacts/bundled-art-mobile.png'),full_page=True)
    browser.close()
print(f'PASS: {len(unique)} bundled files match source hashes and build output; fresh mobile visitor renders all sprites without a ZIP or AWBW request.')
