// ==UserScript==
// @name         Field Command — AWBW asset collector
// @namespace    field-command-awbw-assets
// @version      0.1.0
// @description  Save publicly accessible images loaded by AWBW pages into a source-tracked asset ZIP.
// @match        https://awbw.amarriner.com/*
// @grant        none
// @run-at       document-idle
// @noframes
// ==/UserScript==
(() => {
  'use strict';
  if (window.top !== window.self || document.getElementById('fc-assets-tool')) return;
  const host = document.createElement('div'); host.id = 'fc-assets-tool';
  host.style.cssText = 'position:fixed;right:12px;bottom:85px;z-index:2147483646;max-width:calc(100vw - 24px)';
  const ui = host.attachShadow({mode:'open'});
  ui.innerHTML = `<style>:host{font:13px system-ui;color:#e5eccd}details{background:#162017;border:1px solid #8faa63;border-radius:10px;padding:12px;max-width:330px;box-shadow:0 5px 30px #0008}summary{cursor:pointer;color:#c2ed78;font-weight:bold}p{font-size:12px;line-height:1.5}button{font:inherit;min-height:44px;padding:10px 12px;margin:4px 4px 0 0;border:0;border-radius:5px;background:#c2ed78;color:#1b2817;cursor:pointer}button:disabled{opacity:.5}#status{white-space:pre-wrap;font-size:11px;overflow-wrap:anywhere}.subtle{background:#31402c;color:#dae6c3}</style><details><summary>Field Command · Asset pack</summary><p>Open a game or map, then capture its loaded images. Repeat on other pages to grow the pack. Files stay in this browser until you export.</p><button id="capture">Capture this page</button><button id="export">Export ZIP</button><button id="clear" class="subtle">Clear pack</button><p id="status" role="status">Images only. No account data, cookies, or game actions are exported.</p></details>`;
  document.body.append(host);
  const status = ui.querySelector('#status');
  const dbPromise = new Promise((resolve,reject) => {
    const request = indexedDB.open('field-command-public-assets-v1',1);
    request.onupgradeneeded = () => request.result.createObjectStore('images',{keyPath:'source'});
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  async function records() {
    const db=await dbPromise;
    return new Promise((resolve,reject)=>{const req=db.transaction('images').objectStore('images').getAll();req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
  }
  async function put(record) {
    const db=await dbPromise;
    return new Promise((resolve,reject)=>{const tx=db.transaction('images','readwrite');tx.objectStore('images').put(record);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});
  }
  function publicImageUrl(raw,base=location.href) {
    try {
      const url=new URL(raw,base);
      if(url.origin!==location.origin || !/\.(png|gif|jpe?g|webp|svg|avif|bmp)$/i.test(url.pathname))return null;
      url.hash='';return url.href;
    } catch { return null; }
  }
  function urlsInCss(text,base,set) {
    for(const match of text.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)){const url=publicImageUrl(match[1].trim(),base);if(url)set.add(url);}
  }
  async function discover() {
    const urls=new Set();
    for(const image of document.images){const url=publicImageUrl(image.currentSrc||image.src);if(url)urls.add(url);}
    for(const entry of performance.getEntriesByType('resource')){const url=publicImageUrl(entry.name);if(url)urls.add(url);}
    for(const node of document.querySelectorAll('[style],style'))urlsInCss(node.tagName==='STYLE'?node.textContent:node.getAttribute('style'),location.href,urls);
    for(const sheet of document.styleSheets){try{for(const rule of sheet.cssRules)urlsInCss(rule.cssText,sheet.href||location.href,urls);}catch{/* Cross-origin stylesheets are intentionally skipped. */}}
    return [...urls];
  }
  async function capture() {
    const urls=await discover(),existing=await records(),known=new Set(existing.map(r=>r.source));
    let total=existing.reduce((n,r)=>n+r.bytes.byteLength,0),saved=0,failed=0,skipped=0,cursor=0;
    const queue=urls.filter(url=>!known.has(url));
    status.textContent=`Found ${urls.length} images; ${queue.length} new. Downloading public image files…`;
    async function worker(){while(cursor<queue.length){const source=queue[cursor++];try{
      const response=await fetch(source,{credentials:'omit',signal:AbortSignal.timeout(15000)});
      if(!response.ok||new URL(response.url).origin!==location.origin)throw new Error('Unavailable');
      const mime=response.headers.get('content-type')?.split(';')[0].trim();
      if(!mime?.startsWith('image/'))throw new Error('Not an image');
      const bytes=new Uint8Array(await response.arrayBuffer());
      if(bytes.length>2*1024*1024||total+bytes.length>64*1024*1024){skipped++;continue;}
      total+=bytes.length;
      const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(b=>b.toString(16).padStart(2,'0')).join('');
      const path=new URL(source).pathname;const basename=decodeURIComponent(path.split('/').pop()).replace(/[^a-zA-Z0-9._-]/g,'_');
      await put({source,file:`assets/${digest.slice(0,16)}-${basename}`,mime,sha256:digest,bytes,capturedAt:new Date().toISOString()});saved++;
    }catch{failed++;}status.textContent=`Saved ${saved}/${queue.length} new images. ${failed} failed; ${skipped} skipped.`;}}
    await Promise.all([worker(),worker(),worker(),worker()]);
    const count=(await records()).length;
    status.textContent=`Pack: ${count} images. Added ${saved}; already captured ${urls.length-queue.length}; failed ${failed}; size-limit skips ${skipped}.\nExport ZIP when ready. Animated GIF files retain their original bytes.`;
  }
  const encoder=new TextEncoder();
  function crc32(bytes){let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let k=0;k<8;k++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return(crc^0xffffffff)>>>0;}
  function zip(entries){const parts=[],central=[];let offset=0;
    for(const entry of entries){const name=encoder.encode(entry.name),data=entry.bytes,crc=crc32(data),header=new Uint8Array(30+name.length),h=new DataView(header.buffer);h.setUint32(0,0x04034b50,true);h.setUint16(4,20,true);h.setUint16(6,0x0800,true);h.setUint16(12,33,true);h.setUint32(14,crc,true);h.setUint32(18,data.length,true);h.setUint32(22,data.length,true);h.setUint16(26,name.length,true);header.set(name,30);parts.push(header,data);
      const record=new Uint8Array(46+name.length),r=new DataView(record.buffer);r.setUint32(0,0x02014b50,true);r.setUint16(4,20,true);r.setUint16(6,20,true);r.setUint16(8,0x0800,true);r.setUint16(14,33,true);r.setUint32(16,crc,true);r.setUint32(20,data.length,true);r.setUint32(24,data.length,true);r.setUint16(28,name.length,true);r.setUint32(42,offset,true);record.set(name,46);central.push(record);offset+=header.length+data.length;}
    const centralSize=central.reduce((n,p)=>n+p.length,0),end=new Uint8Array(22),e=new DataView(end.buffer);e.setUint32(0,0x06054b50,true);e.setUint16(8,entries.length,true);e.setUint16(10,entries.length,true);e.setUint32(12,centralSize,true);e.setUint32(16,offset,true);return new Blob([...parts,...central,end],{type:'application/zip'});
  }
  async function exportPack(){const images=await records();if(!images.length){status.textContent='No images captured yet. Open an AWBW game or map and capture the page first.';return;}
    const manifest={format:'field-command-assets-v1',sourceOrigin:location.origin,exportedAt:new Date().toISOString(),attribution:'Images retrieved from AWBW. Original authors and reuse terms have not been verified.',assets:images.map(({bytes,...r})=>({...r,size:bytes.length}))};
    const unique=new Map(images.map(r=>[r.file,r]));
    const blob=zip([{name:'manifest.json',bytes:encoder.encode(JSON.stringify(manifest,null,2))},...Array.from(unique.values(),r=>({name:r.file,bytes:r.bytes}))]);
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='awbw-assets.zip';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);status.textContent=`Exported ${images.length} source records and ${unique.size} unique files. Import this ZIP into Field Command.`;
  }
  async function run(fn){ui.querySelectorAll('button').forEach(b=>b.disabled=true);try{await fn();}catch(e){status.textContent='Could not complete: '+e.message;}finally{ui.querySelectorAll('button').forEach(b=>b.disabled=false);}}
  ui.querySelector('#capture').onclick=()=>run(capture);
  ui.querySelector('#export').onclick=()=>run(exportPack);
  ui.querySelector('#clear').onclick=()=>run(async()=>{if(!confirm('Clear the captured image pack from this browser?'))return;const db=await dbPromise;await new Promise((resolve,reject)=>{const tx=db.transaction('images','readwrite');tx.objectStore('images').clear();tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});status.textContent='Local image pack cleared.';});
})();
