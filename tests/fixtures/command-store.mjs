export function memoryStore(){
 const entries=new Map();let version=0;
 return {entries,setJSON:async(key,data,options={})=>{const previous=entries.get(key);if(options.onlyIfNew&&previous||options.onlyIfMatch&&options.onlyIfMatch!==previous?.etag)return {modified:false};const etag=String(++version);entries.set(key,{data:structuredClone(data),etag});return {modified:true,etag};},getWithMetadata:async key=>structuredClone(entries.get(key)||null),get:async key=>structuredClone(entries.get(key)?.data||null)};
}
