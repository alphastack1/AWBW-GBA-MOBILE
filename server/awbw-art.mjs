const countries=new Set('aa ab ar bd bh bm ci ge gs js ne os pc pl rf sc tg uw wn yc'.split(' '));
const units=new Set('infantry mech tank md.tank neotank megatank recon apc artillery rocket missile anti-air b-copter t-copter fighter bomber stealth lander cruiser battleship sub carrier blackboat blackbomb piperunner'.split(' '));
export async function handleArt(request,{fetcher=fetch}={}){
 if(request.method!=='GET')return new Response('',{status:405});
 const url=new URL(request.url),army=url.searchParams.get('army'),unit=url.searchParams.get('unit');
 if(!countries.has(army)||!units.has(unit))return new Response('',{status:400});
 try{
  for(const directory of ['aw2/','']){
   const response=await fetcher(`https://awbw.amarriner.com/terrain/${directory}${army}${unit}.gif`,{method:'GET',redirect:'error',credentials:'omit',signal:AbortSignal.timeout(7000)});
   if(!response.ok){await response.body?.cancel();continue;}
   const bytes=new Uint8Array(await response.arrayBuffer());
   if(bytes.length>120000||!['GIF87a','GIF89a'].includes(new TextDecoder().decode(bytes.subarray(0,6))))continue;
   return new Response(bytes,{headers:{'Content-Type':'image/gif','Cache-Control':'public, max-age=604800','X-Content-Type-Options':'nosniff'}});
  }
 }catch{}
 return new Response('',{status:502,headers:{'Cache-Control':'no-store'}});
}
