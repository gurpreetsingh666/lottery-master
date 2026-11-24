const URL='https://hoosierlottery.com/games/scratch-off/scratch-off-stats/';
const plain=s=>String(s||'').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/&#39;|&apos;/gi,"'").replace(/&quot;/gi,'"').replace(/\s+/g,' ').trim();
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','public, s-maxage=21600, stale-while-revalidate=3600');
 res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'GET only'})}
 try{
  const response=await fetch(URL,{headers:{Accept:'text/html'},signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error('Upstream status '+response.status);
  const body=await response.text(),games={};
  for(const row of body.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)||[]){
   const cells=Array.from(row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi),m=>plain(m[1]));
   if(cells.length<6||!/^\d{4}$/.test(cells[1]))continue;
   const price=Number(cells[5].replace(/[^\d.]/g,''));
   if(price<1||price>100||!Number.isFinite(price))continue;
   const number=cells[1];games[number]={number,name:cells[0].slice(0,100),price,source:'Hoosier Lottery Scratch-off Stats'};
   if(cells[2])games[number].topPrize=cells[2];
   if(cells[6])games[number].onSaleDate=cells[6];
   if(cells[7])games[number].estimatedOdds=cells[7];
  }
  if(Object.keys(games).length<5)throw Error('Unable to parse public games table');
  return res.status(200).json({games,source:URL,updatedAt:new Date().toISOString()});
 }catch(err){return res.status(502).json({error:'Unable to load official Hoosier Lottery game stats',message:err?.message||'Unknown upstream error'})}
};
