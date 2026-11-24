'use strict';
const {createHash}=require('node:crypto');
const {put,get,head,BlobPreconditionFailedError}=require('@vercel/blob');
const OK_KEY=/^LM2-[A-Za-z0-9_-]{43}$/;
const REV=/^[a-zA-Z0-9-]{18,65}$/;
const reply=(res,status,value)=>res.status(status).json(value);
const missing=e=>e?.name==='BlobNotFoundError'||e?.code==='blob_not_found'||e?.status===404||e?.statusCode===404;
const conflict=e=>e instanceof BlobPreconditionFailedError||e?.name==='BlobPreconditionFailedError'||e?.name==='BlobAlreadyExistsError'||[409,412].includes(e?.status)||[409,412].includes(e?.statusCode);
async function read(path){
 try{
  const x=await get(path,{access:'private',useCache:false});
  if(!x||!x.stream)return null;
  return {value:JSON.parse(await new Response(x.stream).text()),etag:x.blob?.etag||null};
 }catch(e){if(missing(e))return null;throw e;}
}
async function exists(path){try{return await head(path)}catch(e){if(missing(e))return null;throw e;}}
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store, no-cache, must-revalidate');
 res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='POST'&&req.method!=='GET')return reply(res,405,{error:'Unsupported method.'});
 const key=req.headers['x-lottery-cloud-key'];
 if(typeof key!=='string'||!OK_KEY.test(key))return reply(res,401,{error:'A valid private Cloud Sync Key is required.'});
 if(!process.env.BLOB_READ_WRITE_TOKEN)return reply(res,503,{error:'Private storage is not configured.'});
 const hash=createHash('sha256').update(key).digest('hex');
 const base='lottery-master-private-v2/'+hash+'/';
 const manifestPath=base+'manifest.json';
 const mode=req.method==='POST'?req.body?.mode:req.query?.mode;
 try{
  if(req.method==='GET'){
   if(mode==='meta'){
    const doc=await read(manifestPath);
    return reply(res,200,doc?{exists:true,manifest:doc.value}:{exists:false,manifest:null});
   }
   if(mode==='chunk'){
    const rev=req.query?.rev,idx=Number(req.query?.index);
    if(!REV.test(String(rev||''))||!Number.isSafeInteger(idx)||idx<0||idx>=400)return reply(res,400,{error:'Invalid cloud chunk reference.'});
    const chunk=await read(base+'chunks/'+rev+'/'+idx+'.json');
    return chunk?reply(res,200,chunk.value):reply(res,404,{error:'Encrypted chunk not found.'});
   }
   return reply(res,400,{error:'Unknown Cloud Sync request.'});
  }
  if(mode==='chunk'){
   const {rev,index,payload}=req.body||{};
   if(!REV.test(String(rev||''))||!Number.isSafeInteger(index)||index<0||index>=400||typeof payload!=='string'||payload.length>390000)return reply(res,400,{error:'Invalid or oversized encrypted cloud chunk.'});
   let encrypted;
   try{encrypted=JSON.parse(payload)}catch(e){return reply(res,400,{error:'Invalid encrypted chunk.'})}
   if(!encrypted||typeof encrypted.iv!=='string'||typeof encrypted.data!=='string'||!/^[-_A-Za-z0-9]{16,32}$/.test(encrypted.iv)||!/^[-_A-Za-z0-9]{20,390000}$/.test(encrypted.data))return reply(res,400,{error:'Invalid encrypted chunk format.'});
   const path=base+'chunks/'+rev+'/'+index+'.json';
   try{await put(path,payload,{access:'private',contentType:'application/json',addRandomSuffix:false});}catch(e){if(conflict(e))return reply(res,409,{error:'Chunk already exists. Existing copy was kept.'});throw e;}
   return reply(res,200,{ok:true});
  }
  if(mode==='commit'){
   const {rev,parent,chunkCount,compressed,totalBytes,createdAt,device}=req.body||{};
   if(!REV.test(String(rev||''))||!(parent===null||parent===undefined||REV.test(String(parent)))||!Number.isSafeInteger(chunkCount)||chunkCount<1||chunkCount>400||!Number.isSafeInteger(totalBytes)||totalBytes<1||totalBytes>90000000||typeof compressed!=='boolean')return reply(res,400,{error:'Invalid encrypted cloud manifest.'});
   const old=await read(manifestPath);
   if((old?.value?.rev||null)!==(parent||null))return reply(res,409,{error:'Cloud records changed in another browser. Local records were kept.',manifest:old?.value||null});
   for(let i=0;i<chunkCount;i+=12){
    const group=await Promise.all(Array.from({length:Math.min(12,chunkCount-i)},(_,n)=>exists(base+'chunks/'+rev+'/'+(i+n)+'.json')));
    if(group.some(x=>!x))return reply(res,400,{error:'Cloud upload incomplete. Retry on your original device.'});
   }
   const manifest={rev,chunkCount,compressed,totalBytes,createdAt:typeof createdAt==='string'?createdAt.slice(0,70):new Date().toISOString(),device:typeof device==='string'?device.slice(0,100):'browser'};
   try{await put(manifestPath,JSON.stringify(manifest),{access:'private',contentType:'application/json',addRandomSuffix:false,...(old?{allowOverwrite:true,ifMatch:old.etag}:{})});}
   catch(e){if(conflict(e))return reply(res,409,{error:'Cloud data changed during upload. Local records were kept.',manifest:(await read(manifestPath))?.value||null});throw e;}
   return reply(res,200,{ok:true,manifest});
  }
  return reply(res,400,{error:'Unknown Cloud Sync request.'});
 }catch(e){console.error('Private cloud v2 request failed',e?.name||'error');return reply(res,503,{error:'Cloud storage is temporarily unavailable. Your browser data has not been erased.'});}
};
