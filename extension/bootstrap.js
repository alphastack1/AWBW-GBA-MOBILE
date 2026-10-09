// Extension APIs stay in the isolated world; AWBW receives only the UI resource URL.
const fieldCommandUrl=chrome.runtime.getURL('play.html')+'?live=1&embedded=1';
function attach(){if(!document.documentElement)return false;document.documentElement.setAttribute('data-fc-extension-client',fieldCommandUrl);return true;}
if(!attach()){const observer=new MutationObserver(()=>{if(attach())observer.disconnect();});observer.observe(document,{childList:true});}
