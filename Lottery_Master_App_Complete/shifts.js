// The dashboard runs in the app scope so every displayed count uses the ledger calculation.
const todayPanel = document.createElement('section');
todayPanel.id = 'shiftToday';
todayPanel.innerHTML = `<p class="caption">Shifts</p><h1>Today</h1>
<div class="sales-card"><p class="caption">Ticket Sales This Shift</p><strong class="amount"></strong><p class="since"></p></div>
<p class="next-step" role="status"></p><div class="actions"><button data-do="scan">Scan Tickets</button><button data-do="close">Close Shift</button></div>
<button data-do="add" hidden>Start New Shift</button><p class="caption sold-label">Tickets Sold</p><div class="price-list"></div>
<button data-do="ledger">View Shift Details</button>`;
$('content').before(todayPanel);
const activeIndex = () => shiftActiveIndices().at(-1);
let lastCloseReminder;
function refreshToday() {
 const visible = view === 'sheets';
 document.body.classList.toggle('show-shift-today',visible);
 todayPanel.hidden = !visible;
 if (!visible) return;
 const index = activeIndex(), current = data.sheets[index];
 todayPanel.querySelector('[data-do=add]').hidden = Boolean(current);
 const quickPanel = $('newShiftQuickPanel');
 if (current && quickPanel?.querySelector('#quickOpenActiveShift')) {
   const title = quickPanel.querySelector('h3');
   if (title.textContent !== 'Current Shift') {
     title.textContent = 'Current Shift';
     quickPanel.querySelector('.panel-title p').textContent = 'Your shift is open.';
     quickPanel.querySelector('.shift-flow-status').textContent = 'Continue working on this shift.';
   }
 }
 const summary = current && index === data.current ? recordedShiftEndings() : null;
 const ready = Boolean(summary?.required.length && !summary.missing.length);
 const next = summary?.missing[0];
 const message = !current ? 'Tap Start New Shift to begin.' : ready ? 'Your shift is still open. Tap Close Shift.' : next ? 'Check the ticket in '+explainBin(next.si,next.ri)+'. Tap Scan Tickets.' : summary ? 'No active bins. Tap Close Shift to review.' : 'Tap Scan Tickets to open your shift.';
 todayPanel.querySelector('h1').textContent = current?.shiftType || (current ? 'Current Shift' : 'Start a Shift');
 todayPanel.querySelector('.next-step').textContent = message;
 todayPanel.classList.toggle('ready-to-close',ready || Boolean(summary && !summary.required.length));
 if (ready && !guidedMode && lastCloseReminder !== current.id && guideVoiceOn && guideSpeechAvailable()) {
   lastCloseReminder = current.id;
   try {
     const reminder = new window.SpeechSynthesisUtterance(message);
     reminder.lang = 'en-US';
     window.speechSynthesis.speak(reminder);
   } catch (_) {}
 }
 const counts = new Map([1,2,3,5,10,20,30,50].map(price=>[price,0]));
 let revenue = 0;
 current?.sections.forEach((rows,si)=>rows.forEach((row,ri)=>{
   const value = sale(index,si,ri);
   revenue += value.total;
   let pending = value.count || 0;
   function add(price,count){if(price>0 && count>0) counts.set(price,(counts.get(price)||0)+count);}
   for(const item of row.closures || []){
     if(!['sold_roll','agent_return','bin_move'].includes(item?.kind)||!Number.isSafeInteger(item.count)||item.count<=0)continue;
     add(Number(item.total)/item.count,item.count);
     pending -= item.count;
   }
   add(Number(row.price),pending);
 }));
 todayPanel.querySelector('.amount').textContent = revenue.toLocaleString('en-US',{style:'currency',currency:'USD'});
 todayPanel.querySelector('.since').textContent = current ? 'Started at '+new Intl.DateTimeFormat('en-US',{timeZone:STORE_SHIFT_TIME_ZONE,hour:'numeric',minute:'2-digit'}).format(new Date(current.startedAt)) : 'No open shift';
 todayPanel.querySelector('[data-do=close]').disabled = !current;
 todayPanel.querySelector('.price-list').innerHTML = Array.from(counts).sort((a,b)=>a[0]-b[0]).map(([price,count])=>'<div><span>$'+price+' tickets</span><strong>'+count+' sold</strong></div>').join('');
}
new MutationObserver(refreshToday).observe($('content'),{childList:true,subtree:true,characterData:true});
todayPanel.addEventListener('click',event=>{
 const op=event.target.closest('button')?.dataset.do;
 if(!op)return;
 const index=activeIndex();
 if(op==='add' && index!==undefined){shiftResume(index);return;}
 if(op==='add'||op==='ledger'){
   const el=$(op==='add'?'newShiftQuickPanel':'content');
   el?.scrollIntoView({block:'start'});
   (op==='add'?el?.querySelector('select,button'):null)?.focus({preventScroll:true});
 } else if(op==='scan'){
   if(index!==undefined && data.current!==index)shiftResume(index);
   const scan=index!==undefined && $('scanAllBins');
   if(scan)scan.click();else document.querySelector('[data-view="scanner"]').click();
 } else if(op==='close' && index!==undefined){
   if(data.current!==index)shiftResume(index);
   const saved=$('submitRecordedShift');
   const submit=saved && !saved.disabled ? saved : $('flowEnd');
   if(submit && !submit.disabled)submit.click();else $('shiftFlow')?.scrollIntoView();
 }
});
const mobileNav=document.querySelector('.mobile-nav');
const glyphs={sheets:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',inventory:'<path d="m12 2 9 5v10l-9 5-9-5V7zm-9 5 9 5 9-5m-9 5v10"/>',pos:'<path d="M5 3h14v18l-3-2-4 2-4-2-3 2zm3 5h8m-8 4h7"/>',settings:'<circle cx="4" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="20" cy="12" r="1.5"/>'};
for(const [dest,path] of Object.entries(glyphs)){
 const b=mobileNav.querySelector('[data-view="'+dest+'"]');
 const name={sheets:'Shifts',inventory:'Stock',pos:'POS',settings:'More'}[dest];
 b.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round">'+path+'</svg>'+name;
}
const more=mobileNav.querySelector('[data-view=settings]');
const menu=document.createElement('div');
menu.id='shiftMore';menu.hidden=true;
menu.innerHTML='<button data-route="gallery">Photo gallery</button><button data-route="settings">Settings &amp; backup</button>';
mobileNav.before(menu);
more.addEventListener('click',e=>{e.stopImmediatePropagation();menu.hidden=!menu.hidden;more.setAttribute('aria-expanded',String(!menu.hidden));},true);
menu.addEventListener('click',e=>{const route=e.target.closest('button')?.dataset.route;if(route)document.querySelector('#desktopNav [data-view="'+route+'"]').click();menu.hidden=true;more.setAttribute('aria-expanded','false');});
document.addEventListener('click',e=>{if(!menu.contains(e.target)&&!more.contains(e.target)){menu.hidden=true;more.setAttribute('aria-expanded','false');}});
