const fs=require('node:fs');
require('./patch-live-sync.cjs');
fs.mkdirSync('public',{recursive:true});
fs.copyFileSync('index.html','public/index.html');
for(const name of ['easy-ui.css','easy-ui.js','shift-reports-finder.css'])fs.copyFileSync('assets/'+name,'public/'+name);
const path=require('node:path');
const htmlPath=path.join('public','index.html');
let html=fs.readFileSync(htmlPath,'utf8');
if(!html.includes('lm-pin-locked')&&!html.includes('pin-security.js')){
 const tag='<style>html.lm-pin-locked body>*:not(#lm-pin-shield){visibility:hidden!important;pointer-events:none!important}html.lm-pin-locked body{overflow:hidden!important}</style><script>document.documentElement.classList.add("lm-pin-locked")</script><link rel="stylesheet" href="/pin-security.css"><script defer src="/pin-security.js"></script>';
 if(!html.includes('</head>'))throw Error('Missing HTML head for secure PIN injection');
 html=html.replace('</head>',tag+'</head>');
 fs.writeFileSync(htmlPath,html);
}
fs.copyFileSync('pin-security.js','public/pin-security.js');
fs.copyFileSync('pin-security.css','public/pin-security.css');


const target = 'init();\n})();\n</script>';
if (!html.includes(target)) throw new Error('Shift dashboard mount missing');
html = html.replace(target, () => fs.readFileSync('shifts.js','utf8') + '\n' + fs.readFileSync('shift-clock.js','utf8') + '\n' + target);
html = html.replace('</body>', () => '<style>' + fs.readFileSync('shifts.css','utf8') + "#shiftToday .next-step{background:#e1f3e6;color:#153e30;padding:16px;border-radius:14px;font:650 18px/1.4 system-ui}#shiftToday.ready-to-close .actions{grid-template-columns:1fr}#shiftToday.ready-to-close [data-do=close]{grid-row:1;background:#151920;color:white;font-size:21px}#shiftToday.ready-to-close [data-do=scan]{background:white;color:#151920}#shiftToday .shift-clock{display:flex;align-items:baseline;gap:.65rem;flex-wrap:wrap;color:#151a21;margin:0 0 1rem;font-size:1rem;font-weight:600}#shiftToday .shift-clock time{font-size:1.6rem;font-weight:750;font-variant-numeric:tabular-nums}" + '</style></body>');
fs.writeFileSync(htmlPath,html);
