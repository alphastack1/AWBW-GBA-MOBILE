import { mkdir, copyFile, readFile, writeFile, cp, rm } from 'node:fs/promises';
const metadata=`// ==UserScript==
// @name         Field Command — AWBW harness
// @namespace    field-command-awbw
// @version      0.1.0
// @description  A mobile-first dashboard for your existing AWBW account, with original game controls.
// @match        https://awbw.amarriner.com/yourgames.php*
// @grant        none
// @run-at       document-idle
// @noframes
// ==/UserScript==
`;
const css=await readFile('styles.css','utf8'),source=await readFile('harness.js','utf8');
await writeFile('field-command.user.js',metadata+'\n(() => { const FIELD_COMMAND_CSS = '+JSON.stringify(css)+';\n'+source+'\n})();\n');

const inspectorHelpers=(await readFile('inspection.js','utf8')).replace(/export function /g,'function ');
const bridgeSource=await readFile('awbw-bridge.js','utf8');
const metaEnd=bridgeSource.indexOf('// ==/UserScript==')+'// ==/UserScript=='.length;
const orderHelpers=(await readFile('live-orders.js','utf8')).replace(/export function /g,'function ')+'\n'+(await readFile('awbw-orders.js','utf8')).replace(/export function /g,'function ');
const ordersBundle='\nconst FC_ORDERS=(()=>{'+orderHelpers+';return {createOrderGate,createOfficialAdapter};})();\n';
const inspectorBundle='\nconst FC_INSPECTION=(()=>{'+inspectorHelpers+';return {schema,responseSample,requestSample};})();\n';
const handheldCss=await readFile('play.css','utf8');
const packedCatalog=JSON.parse(await readFile('assets/catalog.json','utf8'));
for(const entry of packedCatalog.assets)entry.file=`data:${entry.mime};base64,${(await readFile(entry.file)).toString('base64')}`;
const tactics=(await readFile('tactics.js','utf8')).replace(/export (function|const) /g,'$1 ');
const validator=(await readFile('snapshot.js','utf8')).replace(/export function /g,'function ');
const player=(await readFile('play.js','utf8')).replace(/^import .+;\n/gm,'');
const playerBundle=`const {createPractice,unitAt,reachable,targets,order,buy,endTurn,stats}=(()=>{${tactics};return {createPractice,unitAt,reachable,targets,order,buy,endTurn,stats};})();\n${validator}\n${player}`;
const embeddedHtml=(await readFile('play.html','utf8')).replace('<link rel="stylesheet" href="play.css">',`<style>${handheldCss}</style>`).replace('<link rel="icon" href="favicon.svg">','').replace('class="game-logo" href="/"','class="game-logo" href="https://awbw.amarriner.com/yourgames.php" target="_top"').replace('<script type="module" src="play.js"></script>',`<script>window.FC_EMBEDDED=true;window.FC_CATALOG=${JSON.stringify(packedCatalog).replace(/</g,'\\u003c')};</script><script type="module">${playerBundle.replace(/<\/script/gi,'<\\/script')}</script>`);
const lobby=(await readFile('handheld-lobby.js','utf8')).replace(/export function /g,'function ');
const handheldBundle='\nconst FC_HANDHELD_HTML='+JSON.stringify(embeddedHtml)+';\nconst FC_LOBBY=(()=>{'+lobby+';return{mount:()=>mountLobby('+JSON.stringify(handheldCss)+')};})();\n';
await writeFile('awbw-bridge.user.js',bridgeSource.slice(0,metaEnd)+'\n(()=>{'+inspectorBundle+ordersBundle+handheldBundle+bridgeSource.slice(metaEnd)+'\n})();');

await rm('dist',{recursive:true,force:true});
await mkdir('dist',{recursive:true});
for(const file of ['index.html','styles.css','app.js','favicon.svg','field-command.user.js','asset-collector.user.js','asset-library.html','asset-library.js','asset-library.css','operations.html','play.html','play.css','play.js','tactics.js','snapshot.js','bridge.html','awbw-bridge.user.js','inspection.js','live-orders.js','awbw-orders.js','_headers'])await copyFile(file,`dist/${file}`);
for(const file of ['field-command-mobile.zip','field-command-chrome.zip'])await copyFile(file,`dist/${file}`);
console.log('Built installation site and self-contained userscript in dist/');

await cp('assets','dist/assets',{recursive:true});

// Optional desktop packaging uses an extension page, so its scripts obey MV3 CSP.
await rm('extension-dist',{recursive:true,force:true});
await cp('extension','extension-dist',{recursive:true});
for(const file of ['play.html','play.css','play.js','tactics.js','snapshot.js','favicon.svg','bridge.html','styles.css'])await copyFile(file,`extension-dist/${file}`);
await cp('assets','extension-dist/assets',{recursive:true});
const extensionBundle=bridgeSource.slice(0,metaEnd)+'\n(()=>{'+inspectorBundle+ordersBundle+'\nconst FC_HANDHELD_HTML="";\nconst FC_LOBBY=(()=>{'+lobby+';return{mount:()=>mountLobby('+JSON.stringify(handheldCss)+')};})();\n'+bridgeSource.slice(metaEnd)+'\n})();';
await writeFile('extension-dist/bridge.js',extensionBundle);
