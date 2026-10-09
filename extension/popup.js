document.querySelector('#games').onclick=()=>chrome.tabs.create({url:'https://awbw.amarriner.com/yourgames.php'});
document.querySelector('#signin').onclick=()=>chrome.tabs.create({url:'https://awbw.amarriner.com/'});
document.querySelector('#practice').onclick=()=>chrome.tabs.create({url:chrome.runtime.getURL('play.html')});
