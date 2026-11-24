'use strict';
const {createHash,timingSafeEqual}=require('node:crypto');
const {BlobNotFoundError,BlobPreconditionFailedError}=require('@vercel/blob');
const getSDK=()=>require('@vercel/blob');
const okRev=x=>typeof x==='string'&&/^[a-z0-9-]{18,65}$/i.test(x);
const okIndex=x=>Number.isSafeInteger(Number(x))&&Number(x)>=0&&Number(x)<3000;
const notFound=e=>e?.name==='BlobNotFoundError'||e?.code==='blob_not_found'||e?.status===404||e?.statusCode===404;
const conflict=e=>e?.name==='BlobPreconditionFailedError'||e?.name==='BlobAlreadyExistsError'||e?.status===409||e?.status===412||e?.statusCode===412;
const respond=(r,status,data)=>r.status(status).json(data);
function workspace(req){
 const key=req.headers['x-lottery-cloud-key'];
 if(typeof key!=='string'||!/^LM1-[A-Za-z0-9_-]{43}$/.test(key))return null;
 const digest=createHash('sha256').update(key).digest('hex');
 for(const [env,folder] of [['LM_CLOUD_OWNER_HASH','v1'],['LM_CLOUD_TEST_HASH','test-v1']]){
  const expected=process.env[env];
  if(expected&&/^[0-9a-f]{64}$/.test(expected)&&timingSafeEqual(Buffer.from(expected,'hex'),Buffer.from(digest,'hex')))
   return 'lottery-master-private/'+folder+'/';
 }
 return null;
}
async function current(base){
 const {get}=getSDK();
 try{
  const result=await get(base+'latest.json',{access:'private',useCache:false});
  if(!result)return null;
  const value=JSON.parse(await new Response(result.stream).text());
  return{value,etag:result.blob?.etag||null};
 }catch(e){if(notFound(e))return null;throw e}
}
module.exports=async function(req,res){
 res.setHeader('Cache-Control','private, no-store, max-age=0');
 res.setHeader('X-Content-Type-Options','nosniff');
 const base=workspace(req);
 if(!base)return respond(res,401,{error:'Connect the correct private Cloud Sync Key.'});
 const mode=req.method==='GET'?String(req.query.mode||'meta'):String(req.body?.mode||'');
 const path=(rev,index)=>base+'chunks/'+rev+'/'+index+'.txt';
 try{
  if(req.method==='GET'&&mode==='meta'){
   const result=await current(base);
   return respond(res,200,{exists:!!result,manifest:result?.value||null});
  }
  if(req.method==='GET'&&mode==='chunk'){
   const rev=String(req.query.rev||''),index=Number(req.query.index);
   if(!okRev(rev)||!okIndex(index))return respond(res,400,{error:'Invalid cloud chunk reference.'});
   const {get}=getSDK();
   const found=await get(path(rev,index),{access:'private',useCache:false});
   if(!found)return respond(res,404,{error:'Backup chunk is unavailable.'});
   res.setHeader('Content-Type','application/json; charset=utf-8');
   return res.status(200).send(await new Response(found.stream).text());
  }
  if(req.method==='POST'&&mode==='chunk'){
   const {rev,index,payload}=req.body||{};
   if(!okRev(rev)||!okIndex(index)||typeof payload!=='string'||payload.length<20||payload.length>540000)
    return respond(res,400,{error:'Invalid encrypted backup part.'});
   const {put}=getSDK();
   try{
    await put(path(rev,index),payload,{access:'private',contentType:'application/json',addRandomSuffix:false,allowOverwrite:false});
   }catch(e){if(!conflict(e))throw e}
   return respond(res,200,{ok:true,part:index});
  }
  if(req.method==='POST'&&mode==='commit'){
   const {rev,parent,chunkCount,compressed,createdAt,totalBytes,device}=req.body||{};
   if(!okRev(rev)||!(parent===null||okRev(parent))||!Number.isSafeInteger(chunkCount)||chunkCount<1||chunkCount>3000||typeof compressed!=='boolean'||!Number.isSafeInteger(totalBytes)||totalBytes<1||totalBytes>750000000)
    return respond(res,400,{error:'Invalid cloud manifest.'});
   const old=await current(base);
   if((old?.value?.rev||null)!==parent)return respond(res,409,{error:'Another browser updated the cloud. Refresh to merge, not overwrite.',manifest:old?.value||null});
   const {put,head}=getSDK();
   for(let i=0;i<chunkCount;i++){
    try{await head(path(rev,i))}
    catch(e){if(notFound(e))return respond(res,409,{error:'Backup is missing encrypted part '+(i+1)});throw e}
   }
   const manifest={v:1,rev,parent,chunkCount,compressed,totalBytes,createdAt:typeof createdAt==='string'?createdAt:new Date().toISOString(),device:typeof device==='string'?device.slice(0,70):'',committedAt:new Date().toISOString()};
   const body=JSON.stringify(manifest);
   await put(base+'history/'+rev+'.json',body,{access:'private',contentType:'application/json',allowOverwrite:false});
   try{
    await put(base+'latest.json',body,{access:'private',contentType:'application/json',allowOverwrite:!!old,...(old?.etag?{ifMatch:old.etag}:{}),cacheControlMaxAge:60});
   }catch(e){if(conflict(e))return respond(res,409,{error:'Another browser updated the cloud during save. Your original records are safe.'});throw e}
   return respond(res,200,{ok:true,manifest});
  }
  return respond(res,405,{error:'Unknown cloud request.'});
 }catch(e){return respond(res,503,{error:'Private cloud temporarily unavailable. Data remains saved on this device.',type:String(e?.name||'storage_error')})}
};
