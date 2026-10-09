from browser_config import BROWSER_BASE_URL
"""Practice interaction and read-only bridge integration, with intercepted AWBW pages."""
from pathlib import Path
import json
import shutil
import tempfile
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
with sync_playwright() as p, tempfile.TemporaryDirectory() as temp:
    browser=p.chromium.launch(headless=True,executable_path=shutil.which('chromium'),args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':390,'height':844})
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(BROWSER_BASE_URL + '/play.html')
    page.locator('#map .map-cell').first.wait_for()
    assert page.locator('.map-cell').count()==252
    page.locator('[data-x="3"][data-y="5"]').click()
    page.get_by_role('button',name='Move',exact=True).click()
    assert page.locator('.reachable').count()>1
    page.locator('[data-x="3"][data-y="4"]').click()
    page.get_by_role('button',name='Wait',exact=True).click()
    saved=json.loads(page.evaluate("localStorage.getItem('field-command-practice-v1')"))
    assert saved['units'][0]['y']==4 and saved['units'][0]['spent']
    page.reload();page.locator('.map-cell').first.wait_for()
    assert json.loads(page.evaluate("localStorage.getItem('field-command-practice-v1')"))['units'][0]['y']==4
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.screenshot(path=str(ROOT/'artifacts/handheld-mobile.png'),full_page=True)
    page.set_viewport_size({'width':1440,'height':1050});page.screenshot(path=str(ROOT/'artifacts/handheld-desktop.png'),full_page=True)
    assert not errors,errors
    page.close()

    cells=''.join('<div class="tile" style="width:16px;height:16px;background-image:url(/terrain/ani/plain.gif)"></div>' for _ in range(160))
    html='<html><head><link rel="stylesheet" href="/game.css"><script src="/game.js"></script></head><body><h1>Day 11</h1><div id="map" style="display:grid;grid-template-columns:repeat(16,16px);width:256px;height:160px">'+cells+'</div></body></html>'
    calls=[]
    def route(r):
        calls.append((r.request.method,r.request.url))
        url=r.request.url
        if url.endswith('.gif'):r.fulfill(status=200,content_type='image/gif',body=(ROOT/'assets/b9a5c81617a9ee6e-plain.gif').read_bytes())
        elif url.endswith('/game.js'):r.fulfill(status=200,content_type='text/javascript',body='/* public client fixture */')
        elif url.endswith('/game.css'):r.fulfill(status=200,content_type='text/css',body='.tile{position:relative}')
        elif '/order.php' in url:r.fulfill(status=409,content_type='application/json',body=json.dumps({'success':False,'state':{'day':11},'authToken':'fixture-secret'}))
        elif '/state.php' in url:r.fulfill(status=200,content_type='application/json',body=json.dumps({'units':[{'id':7,'hp':10}],'authToken':'fixture-secret','csrf':'private'}))
        else:r.fulfill(status=200,content_type='text/html',body=html)
    context=browser.new_context(accept_downloads=True)
    context.route('https://awbw.amarriner.com/**',route)
    awbw=context.new_page()
    # Run at document-start as the userscript manager would.
    context.add_init_script("try{sessionStorage.setItem('field-command-original','1')}catch{};\n"+(ROOT/'awbw-bridge.user.js').read_text())
    awbw.goto('https://awbw.amarriner.com/game.php?games_id=1741140')
    awbw.locator('#fc-bridge-tool summary').click()
    awbw.evaluate("fetch('/state.php?games_id=1741140', {headers:{Authorization:'fixture-secret'}}).then(r=>r.json())")
    with awbw.expect_download() as downloaded:
        awbw.locator('#fc-bridge-tool #snapshot').click()
    snapshot_path=Path(temp)/'snapshot.json';downloaded.value.save_as(snapshot_path)
    awbw.evaluate("fetch('/order.php?games_id=1741140',{method:'POST',body:new URLSearchParams({action:'move',units_id:'7',x:'3',y:'4',csrf:'fixture-secret'})}).then(r=>r.json())")
    snapshot=json.loads(snapshot_path.read_text());assert snapshot['map']['width']==16 and snapshot['map']['height']==10
    assert len(snapshot['map']['layers'])==160
    with awbw.expect_download() as downloaded:
        awbw.locator('#fc-bridge-tool #inspect').click()
    inspection_path=Path(temp)/'inspection.json';downloaded.value.save_as(inspection_path)
    inspection=json.loads(inspection_path.read_text());assert inspection['format']=='field-command-inspection-v2';assert len(inspection['publicFiles'])==2
    assert 'fixture-secret' not in inspection_path.read_text() and 'private' not in inspection_path.read_text()
    assert inspection['contracts'][0]['path']=='/state.php'
    assert inspection['contracts'][0]['responseSchema']['units']['array']['hp']=='number'
    assert len([1 for method,url in calls if method=='POST'])==1  # issued only by the fixture official page
    move=next(c for c in inspection['contracts'] if c['path']=='/order.php')
    assert move['status']==409 and move['responseSample']['success'] is False
    assert move['requestSample']=={'games_id':'1741140','action':'move','units_id':'7','x':'3','y':'4'}
    # Load snapshot in the handheld; real orders remain disabled.
    field=context.new_page();field.goto(BROWSER_BASE_URL + '/play.html')
    field.locator('.map-cell').first.wait_for();field.locator('#menu-open').click();field.locator('#snapshot-input').set_input_files(snapshot_path)
    field.wait_for_function("document.querySelector('#mode').textContent==='AWBW · SNAPSHOT'")
    assert field.locator('.map-cell').count()==160
    assert field.locator('#end-turn').is_disabled()
    assert field.locator('#commands').inner_text()=='AWBW controls ↗'
    # Connect actual cross-origin windows and verify source/origin handshake.
    awbw.on('dialog',lambda dialog:dialog.accept(BROWSER_BASE_URL))
    with awbw.expect_popup() as opened:
        awbw.locator('#fc-bridge-tool #open').click()
    live=opened.value;live.wait_for_function("document.querySelector('#mode')?.textContent==='AWBW · LIVE READ-ONLY'")
    assert live.locator('.map-cell').count()==160
    assert live.locator('#end-turn').is_disabled()
    before=live.locator('#operation').inner_text()
    live.evaluate("window.postMessage({type:'FC_SNAPSHOT',snapshot:{format:'bad'}}, '*')")
    assert live.locator('#operation').inner_text()==before
    context.close();browser.close()
print('PASS: touch movement/commit, practice persistence, mobile overflow, read-only DOM capture, public code/contract export without auth values, imported map, disabled live orders, cross-origin handshake, untrusted messages ignored.')
