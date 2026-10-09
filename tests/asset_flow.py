from browser_config import BROWSER_BASE_URL
"""Verify capture → ZIP → local import → handheld rendering with public image fixtures."""
from pathlib import Path
import base64
import hashlib
import importlib.util
import json
import shutil
import tempfile
import zipfile
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
GIF=base64.b64decode('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7')
# Two-frame GIF fixture: duplicate the frame blocks, retaining a single trailer.
GIF = GIF[:-1] + GIF[19:-1] + b';'
assert GIF.count(b'\x21\xf9\x04') == 2
html='''<html><head><style>.terrain { background-image:url('/terrain/plain.gif'); }</style></head><body><img src="/terrain/plain.gif"><img src="/units/osinfantry.gif"><img src="/private/error.png"><img src="https://other.example/foreign.gif"></body></html>'''
with tempfile.TemporaryDirectory() as temp, sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path=shutil.which('chromium'),args=['--no-sandbox'])
    context=browser.new_context(viewport={'width':390,'height':844},accept_downloads=True)
    context.add_cookies([{'name':'session','value':'fixture-secret','domain':'awbw.amarriner.com','path':'/'}])
    fetched=[]
    def route(r):
        if r.request.resource_type=='fetch': fetched.append(r.request)
        if r.request.url.endswith('.gif'): r.fulfill(status=200,content_type='image/gif',body=GIF)
        elif r.request.url.endswith('.png'):r.fulfill(status=200,content_type='text/html',body='Not an image')
        else:r.fulfill(status=200,content_type='text/html',body=html)
    context.route('https://awbw.amarriner.com/**',route)
    context.route('https://other.example/**',lambda r:r.abort())
    page=context.new_page();page.goto('https://awbw.amarriner.com/game.php?games_id=123')
    page.add_script_tag(content=(ROOT/'asset-collector.user.js').read_text())
    page.locator('#fc-assets-tool summary').click()
    page.locator('#fc-assets-tool #export').click()
    page.wait_for_function("document.querySelector('#fc-assets-tool').shadowRoot.querySelector('#status').textContent.includes('No images captured yet')")
    page.locator('#fc-assets-tool #capture').click()
    page.wait_for_function("document.querySelector('#fc-assets-tool').shadowRoot.querySelector('#status').textContent.startsWith('Pack:')")
    assert 'Pack: 2 images' in page.locator('#fc-assets-tool #status').inner_text()
    assert 'failed 1' in page.locator('#fc-assets-tool #status').inner_text()
    assert all('cookie' not in req.headers and req.method=='GET' for req in fetched)
    with page.expect_download() as download:
        page.locator('#fc-assets-tool #export').click()
    pack_path=Path(temp)/'pack.zip';download.value.save_as(pack_path)
    with zipfile.ZipFile(pack_path) as z:
        manifest=json.loads(z.read('manifest.json'))
        assert len(manifest['assets'])==2
        for record in manifest['assets']:
            assert z.read(record['file'])==GIF
            assert record['sha256']==hashlib.sha256(GIF).hexdigest()
            assert record['mime']=='image/gif'
        assert 'fixture-secret' not in z.read('manifest.json').decode()
    # Capture again: no duplicated downloads or source records.
    page.locator('#fc-assets-tool #capture').click()
    page.wait_for_function("document.querySelector('#fc-assets-tool').shadowRoot.querySelector('#status').textContent.includes('Added 0;')")
    assert len(fetched)==4  # two valid first capture + rejected HTML, then HTML retry
    context.close()
    # Import into a temporary root, never commit fixture art as AWBW assets.
    spec=importlib.util.spec_from_file_location('import_assets',ROOT/'scripts/import_assets.py')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    module.ROOT=Path(temp)/'imported';module.ROOT.mkdir()
    module.import_pack(pack_path)
    assert len(json.loads((module.ROOT/'assets/catalog.json').read_text())['assets'])==2
    for item in manifest['assets']:assert (module.ROOT/item['file']).read_bytes()==GIF
    # Invalid paths fail before any writes.
    invalid=Path(temp)/'invalid.zip'
    manifest['assets'][0]['file']='../escape.gif'
    with zipfile.ZipFile(invalid,'w') as z:z.writestr('manifest.json',json.dumps(manifest))
    try:module.import_pack(invalid);raise AssertionError('Invalid path accepted')
    except ValueError:pass
    assert not (Path(temp)/'escape.gif').exists()
    page=browser.new_page(viewport={'width':390,'height':844})
    page.route('**/assets/catalog.json', lambda r:r.fulfill(status=200,content_type='application/json',body='{"assets":[]}'))
    page.goto(BROWSER_BASE_URL + '/asset-library.html')
    page.wait_for_function("document.querySelector('#workbench-status').textContent.includes('No AWBW files')")
    assert page.locator('.sprite').count()==0
    page.locator('#pack-input').set_input_files(pack_path)
    page.wait_for_function("document.querySelector('#asset-count').textContent==='2 FILES'")
    page.locator('.sprite').first.click();page.locator('#fill').click()
    assert page.locator('#sandbox img').count()==160
    page.locator('[data-layer="unit"]').click();page.locator('#paint').click()
    assert page.locator('#sandbox .unit-sprite').count()==1
    page.locator('#right').click();assert '02 : 01' in page.locator('#coordinates').inner_text()
    page.locator('#paint').click();assert page.locator('#sandbox .unit-sprite').count()==2
    page.locator('#erase').click();assert page.locator('#sandbox .unit-sprite').count()==1
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.screenshot(path=str(ROOT/'artifacts/handheld-fixture-mobile.png'),full_page=True)
    browser.close()
print('PASS: public image capture without cookies, failed/foreign assets excluded, source manifest, byte-preserving ZIP, deduplication, safe local import, empty state, mobile sprite selection, terrain fill, unit layers, D-pad/A/B.')
