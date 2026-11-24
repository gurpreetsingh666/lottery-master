const fs = require('node:fs');
let html = fs.readFileSync('index.html', 'utf8');
function replaceOnce(from, to) {
  if (!html.includes(from) || html.indexOf(from) !== html.lastIndexOf(from)) {
    throw new Error('The current source does not match the verified sync patch.');
  }
  html = html.replace(from, to);
}

// Preserve local changes made while the remote snapshot or safety copy is saving.
replaceOnce(
  "async function cloudAdopt(remote,manifest){\n if(!validBackup(remote))",
  "async function cloudAdopt(remote,manifest){\n const mutationBeforeAdopt=cloudMutation;\n if(!validBackup(remote))"
);
replaceOnce(
  ' data=remote;data.current=Math.min(Math.max(data.current|0,0),data.sheets.length-1);',
  " if(mutationBeforeAdopt!==cloudMutation){cloudSyncDue=true;throw Error('A new local entry is being synced before receiving this update.')}\n data=remote;data.current=Math.min(Math.max(data.current|0,0),data.sheets.length-1);"
);
replaceOnce(
  " await idbSet(data);\n cloudRev=manifest.rev;cloudLocalSet(CLOUD_REV,cloudRev);\n cloudDirty=false;cloudLocalSet(CLOUD_DIRTY,'0');",
  " cloudRev=manifest.rev;cloudLocalSet(CLOUD_REV,cloudRev);\n cloudDirty=false;cloudLocalSet(CLOUD_DIRTY,'0');\n await idbSet(data);"
);
replaceOnce(
  'if(retryDue && cloudDirty && !cloudConflict && cloudKey)void cloudSync(false);',
  'if(retryDue && !cloudConflict && cloudKey)queueMicrotask(()=>void cloudSync(false));'
);
replaceOnce(
  "cloudMessage('Saved to private cloud at '+cloudLastSave+'. Open your private link in another browser to see the same records.');",
  "cloudMessage('Sent to cloud at '+cloudLastSave+'. Connected devices receive changes automatically.');"
);
replaceOnce('\ninit();', '\n' + fs.readFileSync('live-sync.js', 'utf8') + '\ninit();');
fs.writeFileSync('index.html', html);
