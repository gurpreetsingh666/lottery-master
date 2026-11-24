'use strict';
const crypto=require('node:crypto');
const {list,put,get}=require('@vercel/blob');
const KEY=Buffer.from(process.env.PIN_AUTH_SECRET||'','hex');
const OWNER=(process.env.PIN_OWNER_EMAIL||'').trim().toLowerCase();
const PREFIX='lottery-master-pin-security/'+(process.env.VERCEL_ENV==='production'?'production':'preview')+'/state-';
const COOKIE='lm_pin_auth_v1';
const NOW=()=>Date.now();
const hmac=(x)=>crypto.createHmac('sha256',KEY).update(String(x)).digest('hex');
const compare=(a,b)=>{const x=Buffer.from(a||''),y=Buffer.from(b||'');return x.length===y.length&&crypto.timingSafeEqual(x,y)};
function enc(value){const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',KEY,iv);const d=Buffer.concat([c.update(JSON.stringify(value)),c.final()]);return Buffer.concat([iv,c.getAuthTag(),d]).toString('base64')}
function dec(raw){const b=Buffer.from(raw,'base64'),d=crypto.createDecipheriv('aes-256-gcm',KEY,b.subarray(0,12));d.setAuthTag(b.subarray(12,28));return JSON.parse(Buffer.concat([d.update(b.subarray(28)),d.final()]).toString())}
async function load(){const results=[];let cursor;do{const page=await list({prefix:PREFIX,limit:1000,...(cursor?{cursor}:{})});results.push(...page.blobs);cursor=page.hasMore?page.cursor:null;}while(cursor&&results.length<10000);if(!results.length)return {pins:{},challenge:null,sends:[],failures:{},version:1};results.sort((a,b)=>b.pathname.localeCompare(a.pathname));const file=await get(results[0].pathname,{access:'private',useCache:false});if(!file||!file.stream)throw Error('PIN state unavailable');return dec(await new Response(file.stream).text())}
async function save(state){await put(PREFIX+String(NOW()).padStart(14,'0')+'-'+crypto.randomBytes(8).toString('hex')+'.txt',enc(state),{access:'private',addRandomSuffix:false,contentType:'text/plain'})}
function pinHash(pin){const salt=crypto.randomBytes(16).toString('hex');return salt+':'+hmac('pin:'+salt+':'+pin)}
function pinMatch(pin,stored){if(!stored)return false;const [salt,digest]=stored.split(':');return compare(hmac('pin:'+salt+':'+pin),digest)}
function validPin(pin){return typeof pin==='string'&&/^\d{4}$/.test(pin)}
function validCode(code){return typeof code==='string'&&/^\d{6}$/.test(code)}
function cookies(req){return Object.fromEntries((req.headers.cookie||'').split(';').map(x=>x.trim().split('=').map(decodeURIComponent)).filter(x=>x.length===2))}
function session(req,state){const raw=cookies(req)[COOKIE];if(!raw)return null;const [b,sig]=raw.split('.');if(!b||!sig||!compare(sig,hmac('session:'+b)))return null;try{const o=JSON.parse(Buffer.from(b,'base64url').toString());return o.exp>NOW()&&o.ver===state.version&&['owner','staff'].includes(o.role)?o.role:null}catch{return null}}
function issue(res,role,state){const b=Buffer.from(JSON.stringify({role,ver:state.version,exp:NOW()+12*3600000})).toString('base64url');res.setHeader('Set-Cookie',COOKIE+'='+b+'.'+hmac('session:'+b)+'; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=43200')}
function json(res,status,data){res.statusCode=status;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.end(JSON.stringify(data))}
function mask(email){const [name,domain]=email.split('@');return name.slice(0,2)+'***@'+domain}
async function sendEmail(code,role){const resp=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+process.env.RESEND_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({from:process.env.PIN_EMAIL_FROM||'Lottery Master <onboarding@resend.dev>',to:[OWNER],subject:'Lottery Master PIN verification',text:'Lottery Master '+(role==='owner'?'owner':'staff')+' PIN verification code: '+code+'\n\nThis code expires in 10 minutes. If you did not request it, ignore this email.'})});if(!resp.ok){const txt=await resp.text();throw Error('Email provider rejected request ('+resp.status+'): '+txt.slice(0,180))}}
module.exports=async function handler(req,res){
 if(req.method!=='POST')return json(res,405,{error:'POST required'});
 if(!KEY||KEY.length!==32||!OWNER||!process.env.RESEND_API_KEY||!process.env.BLOB_READ_WRITE_TOKEN)return json(res,503,{error:'PIN security is not configured'});
 const host=req.headers.host||'',origin=req.headers.origin;if(origin){let u;try{u=new URL(origin)}catch{return json(res,403,{error:'Origin rejected'})}if(u.host!==host||u.protocol!=='https:')return json(res,403,{error:'Origin rejected'})}
 let body;try{body=typeof req.body==='object'&&req.body?req.body:JSON.parse(req.body||'{}')}catch{return json(res,400,{error:'Invalid request'})}
 if(JSON.stringify(body).length>1500)return json(res,413,{error:'Request too large'});
 try{
 const state=await load(),role=session(req,state),action=String(body.action||'');
 if(action==='status')return json(res,200,{ok:true,setup:!!state.pins.owner,staffEnabled:!!state.pins.staff,role,email:mask(OWNER)});
 if(action==='logout'){res.setHeader('Set-Cookie',COOKIE+'=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0');return json(res,200,{ok:true})}
 if(action==='login'){
 if(!validPin(body.pin))return json(res,400,{error:'Enter a 4-digit PIN'});
 const ip=hmac('ip:'+String(req.headers['x-vercel-forwarded-for']||req.headers['x-forwarded-for']||'unknown').slice(0,128));
 state.failures=state.failures||{};const old=(state.failures[ip]||[]).filter(t=>NOW()-t<10*60000);if(old.length>=5)return json(res,429,{error:'Too many attempts. Try again in 10 minutes.'});
 const who=pinMatch(body.pin,state.pins.owner)?'owner':pinMatch(body.pin,state.pins.staff)?'staff':null;
 if(!who){state.failures[ip]=old.concat(NOW());await save(state);return json(res,401,{error:'Incorrect PIN'})}
 delete state.failures[ip];await save(state);issue(res,who,state);return json(res,200,{ok:true,role:who})
 }
 if(action==='request_code'){
 const purpose=String(body.purpose||'reset_owner');if(!['setup_owner','reset_owner','reset_staff'].includes(purpose))return json(res,400,{error:'Invalid request'});
 if(purpose==='setup_owner'&&state.pins.owner)return json(res,409,{error:'Owner PIN already configured'});
 if(purpose!=='setup_owner'&&!state.pins.owner)return json(res,400,{error:'Set up owner PIN first'});
 state.sends=(state.sends||[]).filter(t=>NOW()-t<3600000);if(state.sends.length>=5)return json(res,429,{error:'Too many emails. Try again later.'});
 if(state.challenge&&NOW()-state.challenge.sent<60000)return json(res,429,{error:'Please wait 60 seconds before requesting another code'});
 const code=String(crypto.randomInt(0,1000000)).padStart(6,'0'),id=crypto.randomBytes(16).toString('hex');
 state.challenge={id,purpose,codeHash:hmac('code:'+id+':'+code),expiry:NOW()+600000,sent:NOW(),attempts:0};state.sends.push(NOW());await save(state);
 try{await sendEmail(code,purpose==='reset_staff'?'staff':'owner')}catch(e){state.challenge=null;await save(state);return json(res,502,{error:'Email could not be sent. Verify the Resend sender domain.'})}
 return json(res,200,{ok:true,challengeId:id,email:mask(OWNER),expiresIn:600})
 }
 if(action==='verify_code'){
 const ch=state.challenge;if(!ch||ch.id!==body.challengeId||ch.expiry<NOW())return json(res,400,{error:'Code expired. Request a new code.'});
 if(ch.attempts>=5)return json(res,429,{error:'Too many attempts. Request a new code.'});
 if(!validCode(body.code)||!compare(ch.codeHash,hmac('code:'+ch.id+':'+body.code))){ch.attempts++;await save(state);return json(res,400,{error:'Incorrect verification code'})}
 if(!validPin(body.newPin))return json(res,400,{error:'New PIN must be exactly 4 digits'});
 const which=ch.purpose==='reset_staff'?'staff':'owner';
 if(which==='staff'&&pinMatch(body.newPin,state.pins.owner))return json(res,400,{error:'Staff PIN must differ from owner PIN'});
 if(which==='owner'&&pinMatch(body.newPin,state.pins.staff))return json(res,400,{error:'Owner PIN must differ from staff PIN'});
 state.pins[which]=pinHash(body.newPin);state.challenge=null;state.version=(state.version||0)+1;await save(state);issue(res,'owner',state);return json(res,200,{ok:true,role:'owner'})
 }
 if(action==='set_staff'){
 if(role!=='owner')return json(res,403,{error:'Owner access required'});
 if(!validPin(body.newPin)||pinMatch(body.newPin,state.pins.owner))return json(res,400,{error:'Choose a different 4-digit staff PIN'});
 state.pins.staff=pinHash(body.newPin);state.version++;await save(state);issue(res,'owner',state);return json(res,200,{ok:true,role:'owner'})
 }
 return json(res,400,{error:'Unknown action'})
 }catch(e){console.error('PIN security error',e?.message);return json(res,503,{error:'PIN service temporarily unavailable'})}
};
