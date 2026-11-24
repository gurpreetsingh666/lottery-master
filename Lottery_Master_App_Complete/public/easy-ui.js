(() => {
  'use strict';
  const panel = document.createElement('section');
  panel.id = 'lm-easy-ui';
  panel.setAttribute('aria-label', 'Counter shortcuts');
  panel.innerHTML = `<header class="lm-head"><h2>Your shift</h2></header>
    <p class="shift-hint"></p>
    <div class="lm-actions">
      <button type="button" class="lm-action lm-primary" data-action="next"></button>
      <button type="button" class="lm-action" data-action="close">Review &amp; submit</button>
    </div>
    <details><summary>More tools</summary><div class="lm-subactions">
      <button type="button" class="lm-sub" data-action="scan">Ticket scanner</button>
      <button type="button" class="lm-sub" data-action="inventory">Roll inventory</button>
      <button type="button" class="lm-sub" data-task="reports">Shift reports</button>
      <button type="button" class="lm-sub" data-action="sync">Cloud sync</button>
    </div></details>
    <div role="status" class="lm-status"></div>`;
  const id = value => document.getElementById(value);
  const navigate = view => {
    const nav = document.querySelector('button[data-view="' + view + '"]');
    if (nav && !nav.classList.contains('active')) nav.click();
  };
  function reveal(element) {
    if (!element) return;
    element.scrollIntoView({block: 'center', behavior: 'instant'});
    if (!element.matches('button,input,select')) element.tabIndex = -1;
    element.focus({preventScroll: true});
  }
  panel.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    const status = panel.querySelector('[role="status"]');
    status.textContent = '';
    switch (button.dataset.action) {
      case 'scan':
      case 'inventory':
        navigate(button.dataset.action === 'scan' ? 'scanner' : 'inventory');
        reveal(id('content'));
        break;
      case 'next':
        if (stage() === 'active') {
          id('scanAllBins')?.click();
        } else if (id('quickOpenActiveShift')) {
          id('quickOpenActiveShift').click();
        } else if (id('quickViewLatestShift')) {
          id('quickViewLatestShift').click();
        } else {
          reveal(id('quickNewShiftType') || id('shiftFlow'));
        }
        break;
      case 'close': {
        navigate('sheets');
        const submit = id('submitRecordedShift') || id('flowEnd');
        if (submit && !submit.disabled) submit.click();
        else {
          status.textContent = 'Open an active shift to review its ending numbers.';
          reveal(id('quickOpenActiveShift') || id('newShiftQuickPanel'));
        }
        break;
      }
      case 'sync':
        navigate('settings');
        reveal(id('cloudSyncBanner') || id('content'));
        break;
    }
  });
  const main = id('content');
  if (!main) return;
  main.before(panel);
  function stage() {
    const submit = id('submitRecordedShift') || id('flowEnd');
    if (submit && !submit.disabled && id('quickOpenActiveShift')) return 'active';
    if (id('quickOpenActiveShift')) return 'resume';
    if (id('quickViewLatestShift')) return 'latest';
    return 'start';
  }
  function refresh() {
    panel.hidden = !id('newShiftQuickPanel');
    if (panel.hidden) return;
    const state = stage();
    const options = {
      active: ['Scan bins', 'Scan the bins in order. When you finish, review the ending numbers.'],
      resume: ['Open active shift', 'Return to the shift already in progress.'],
      latest: ['Open latest shift', 'You are viewing a previous shift.'],
      start: ['Start shift', 'Choose Day or Night and check the start date.']
    };
    const [label, hint] = options[state];
    panel.querySelector('[data-action="next"]').textContent = label;
    panel.querySelector('.shift-hint').textContent = hint;
    panel.querySelector('[data-action="close"]').hidden = state !== 'active';
  }
  refresh();
  new MutationObserver(refresh).observe(main, {
    childList: true, subtree: true, attributes: true, attributeFilter: ['disabled']
  });
})();

/* BIN matching: use the active inventory pack ahead of stale shift-row values;
   require existing confirmation for packs not yet assigned. */
(() => {
 if(typeof guideExpected!=='function'||typeof decodeInventorySerial!=='function'||typeof scannerState!=='function')return;
 const previousExpected=guideExpected,previousDecode=decodeInventorySerial;
 let currentScan=null;
 const normalize=(value,width)=>{
  const v=String(value??'').trim();
  return /^\d+$/.test(v)?v.padStart(width,'0'):v;
 };
 decodeInventorySerial=function(...args){
  const result=previousDecode.apply(this,args);
  currentScan=result&&!result.error?result:null;
  Promise.resolve().then(()=>{currentScan=null});
  return result;
 };
 guideExpected=function(si,ri){
  const expected=previousExpected(si,ri);
  const entries=Object.values(scannerState().packs||{}).filter(p=>Number(p.section)===Number(si)&&Number(p.bin)===Number(ri)+1);
  if(entries.length===1&&entries[0].game&&entries[0].pack){
   const active=entries[0];
   return {game:normalize(active.game,4),pack:normalize(active.pack,6),name:expected.name||active.name||''};
  }
  const game=normalize(expected.game,4),pack=normalize(expected.pack,6);
  if(entries.length===0&&!pack&&game&&currentScan&&currentScan.game===game)
   return {game,pack:currentScan.pack,name:expected.name};
  return {...expected,game,pack};
 };
})();
