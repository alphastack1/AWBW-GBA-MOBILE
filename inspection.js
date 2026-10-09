// Read-only evidence sanitizers shared by the userscript build and local tests.
const secretKey=/auth|token|secret|password|cookie|session|csrf|nonce|signature|hash|email|chat|message|private|account|key/i;
const safeField=/^(?:id|x|y|hp|health|fuel|ammo|army|owner|type|name|capture|movement|moved|attacked|finished|version|turn|day|funds|weather|fog|success|error|status|result|action|unit|player|gameId|stateTime|playerID|unitID|buildingID|buildingInfo|newUnit|newIncome|nextPId|nextFunds|attacker|defender|err|Move|Fire|Capt|Build|NextTurn|End|coordinates|destination|path|moves|game|gameData|game_data|data|response|state|units|players|map|terrain|buildings|properties|active_player|current_turn|current_player|(?:games?|units?|players?|maps?|terrain|buildings?)_(?:id|x|y|hp|hit_points|players_id|team|health|fuel|ammo|army|owner|type|name|capture|movement|movement_points|moved|attacked|finished|version|turn|day|funds|fog))$/i;
const safeRequestField=/^(?:x|y|action|type|destination|path|moves|turn|day|gameId|stateTime|playerID|unitID|buildingID|attacker|defender|(?:games?|units?|players?|turn)_(?:id|x|y))$/i;
const enumValue=/^(?:move|fire|capt|end|nextturn|attack|capture|wait|end[ _-]?turn|build|buy|purchase|infantry|mech|tank|md[ ._-]?tank|neotank|megatank|recon|apc|artillery|rocket|missile|anti[ -]?air|b[ -]?copter|t[ -]?copter|fighter|bomber|cruiser|battleship|lander|sub|carrier|plain|forest|mountain|road|bridge|sea|river|city|base|airport|port|hq|snow|rain|clear|fog|success|error|ok|os|ge|bm|yc|bh)$/i;
export function schema(value,depth=0){
 if(depth>4)return '…';
 if(Array.isArray(value))return{array:value.length?schema(value[0],depth+1):'empty'};
 if(value&&typeof value==='object'){const out={};for(const key of Object.keys(value).slice(0,80)){if(secretKey.test(key))continue;out[key]=schema(value[key],depth+1);}return out;}
 return value===null?'null':typeof value;
}
export function responseSample(value,depth=0){
 if(depth>8)return undefined;
 if(value===null||typeof value==='boolean')return value;
 if(typeof value==='number')return Number.isFinite(value)?value:undefined;
 if(typeof value==='string'){if(/^-?\d+(?:\.\d+)?$/.test(value)&&value.length<16)return value;if(enumValue.test(value))return value;return undefined;}
 if(Array.isArray(value))return value.slice(0,400).map(item=>responseSample(item,depth+1)).filter(item=>item!==undefined);
 if(value&&typeof value==='object'){const out={};for(const key of Object.keys(value).slice(0,500)){if(secretKey.test(key)||(!safeField.test(key)&&!/^\d{1,12}$/.test(key)))continue;const item=responseSample(value[key],depth+1);if(item!==undefined)out[key]=item;}return out;}
 return undefined;
}
function bodyObject(body){
 try{if(body instanceof URLSearchParams)return Object.fromEntries(body);if(typeof FormData!=='undefined'&&body instanceof FormData)return Object.fromEntries([...body].filter(([,v])=>typeof v==='string'));if(typeof body==='string'){return body.trim().startsWith('{')?JSON.parse(body):Object.fromEntries(new URLSearchParams(body));}}catch{}
 return {};
}
export function requestSample(body,url){
 const out={};const values={...Object.fromEntries(new URL(url,'https://awbw.amarriner.com').searchParams),...bodyObject(body)};
 for(const[key,value]of Object.entries(values)){if(secretKey.test(key)||!safeRequestField.test(key))continue;const item=responseSample(value);if(item!==undefined)out[key]=item;}
 return out;
}
