
'use strict';
const fs=require('node:fs');
require('./build-premium.cjs');
const path='public/pin-security.js';
let js=fs.readFileSync(path,'utf8');
const rewrites=[
 ["panel('Enter your PIN','Enter your 4-digit owner or staff PIN to open Lottery Master.'","panel('Employee authorization','Enter your authorized 4-digit employee or owner PIN to continue.'"],
 ["settingsBtn.textContent='PIN settings'","settingsBtn.textContent='Employee PIN'"],
 ["panel('PIN settings','Current access: '","panel('Employee PIN settings','Current access: '"],
 ["Create or update staff PIN","Create or update employee PIN"],
 ["Save staff PIN","Authorize employee PIN"],
 ["Lock & sign out","Sign out"],
 ["Staff PIN</option>","Employee PIN</option>"]
];
for(const [from,to] of rewrites){
 if(!js.includes(from))throw Error('PIN UI patch mismatch: '+from);
 js=js.replace(from,to);
}
fs.writeFileSync(path,js);
const page=fs.readFileSync('public/index.html','utf8');
if(!page.includes('pin-security.js')||!page.includes('premium-operations.css'))throw Error('Required PIN or premium UI missing');
if(page.includes('employee-security.js')||page.includes('employee-security.css'))throw Error('Unwanted automatic-lock script present');
if(js.includes('Lock & sign out')||js.includes("settingsBtn.textContent='PIN settings'"))throw Error('Legacy lock control remains');
console.log('PASS: PIN-only employee authorization; no lock button or idle lock');
