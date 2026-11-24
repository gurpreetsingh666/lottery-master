'use strict';
const fs=require('node:fs');
require('./build-pin.cjs');
const path='public/index.html';
let html=fs.readFileSync(path,'utf8');
const changes=[
 ['<span class="nav-text">Roll inventory</span>','<span class="nav-text">Order &amp; Backstock Inventory</span>'],
 ['data-view="inventory"><span aria-hidden="true" style="font-size:20px">📦</span>Stock</button>','data-view="inventory"><span aria-hidden="true" style="font-size:20px">📦</span>Backstock</button>'],
 ['<div class="eyebrow">Unopened roll inventory</div><h2>Your available lottery rolls</h2>','<div class="eyebrow">LOTTERY STOCK &amp; ORDERING REFERENCE</div><h2>Order &amp; Backstock Inventory</h2>'],
 ['<p>See unopened rolls, scan a new pack, and choose its BIN. Saving a shift ending number does not reopen a returned or sold-out pack.</p>','<p>View unopened lottery rolls before ordering. Scan a new pack and choose its BIN. Saving a shift ending number does not reopen a returned or sold-out pack.</p>']
];
for(const [oldText,newText] of changes){const parts=html.split(oldText);if(parts.length!==2)throw Error('Expected exactly one UI label: '+oldText.slice(0,75));html=parts.join(newText)}
if(!html.includes('</head>'))throw Error('Document head missing');
html=html.replace('</head>','<link rel="stylesheet" href="/backstock-visibility.css"></head>');
fs.writeFileSync(path,html);
fs.copyFileSync('backstock-visibility.css','public/backstock-visibility.css');
if(html.includes('employee-security.js')||!html.includes('pin-security.js'))throw Error('PIN security check failed');
console.log('PASS: visibly labeled Order & Backstock Inventory on desktop, mobile and inventory page');
console.log('PASS: preserved original lottery inventory, scanner, PIN and premium application source');
