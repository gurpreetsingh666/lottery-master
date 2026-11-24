// Upload each saved change and keep a receiving request open while the app is visible.
let cloudWatchController = null;
let cloudWatchRetry = null;
let cloudWatchFailures = 0;
let cloudReceivePending = false;
let cloudChangeQueued = false;
let cloudUploadRetry = null;
let cloudUploadFailures = 0;

cloudChanged = function () {
  if (!cloudKey) return;
  cloudMutation++;
  cloudDirty = true;
  cloudLocalSet(CLOUD_DIRTY, '1');
  clearTimeout(cloudSaveTimer);
  cloudSaveTimer = null;
  cloudMessage('Change saved on this device. Sending to cloud…');
  if (cloudBusy) {
    cloudSyncDue = true;
    return;
  }
  if (cloudChangeQueued) return;
  cloudChangeQueued = true;
  queueMicrotask(() => {
    cloudChangeQueued = false;
    if (navigator.onLine !== false) void cloudSync(false);
  });
};

function cloudReceivingCanApply() {
  const active = document.activeElement;
  return !active || !(active.matches('input, textarea, select') || active.isContentEditable);
}

function cloudWatchStop() {
  clearTimeout(cloudWatchRetry);
  cloudWatchRetry = null;
  if (cloudWatchController) cloudWatchController.abort();
}

async function cloudWatchStart() {
  if (cloudWatchController || !cloudKey || cloudConflict ||
      document.hidden || navigator.onLine === false) return;
  if (cloudReceivePending && !cloudReceivingCanApply()) return;
  const key = cloudKey;
  const controller = new AbortController();
  cloudWatchController = controller;
  let retryDelay = 0;
  try {
    if (cloudReceivePending) {
      cloudReceivePending = false;
      await cloudSync(false);
    }
    while (!controller.signal.aborted && key === cloudKey && !document.hidden && !cloudConflict) {
      const response = await fetch('/api/cloud-watch?rev=' + encodeURIComponent(cloudRev || ''), {
        headers: { 'X-Lottery-Cloud-Key': key },
        cache: 'no-store',
        signal: controller.signal
      });
      if (!response.ok) throw new Error('Receiving connection interrupted.');
      const message = await response.json();
      if (key !== cloudKey || controller.signal.aborted) break;
      cloudWatchFailures = 0;
      if (!message.changed) continue;
      if (!cloudReceivingCanApply()) {
        cloudReceivePending = true;
        cloudMessage('An update is ready. Finish this field to receive it.');
        break;
      }
      if (cloudBusy) {
        cloudReceivePending = true;
        cloudSyncDue = true;
        break;
      }
      await cloudSync(false);
    }
  } catch (error) {
    if (error.name !== 'AbortError') {
      cloudWatchFailures++;
      retryDelay = Math.min(30000, 1000 * 2 ** Math.min(cloudWatchFailures, 5));
      cloudMessage('Receiving connection interrupted. Reconnecting automatically…');
    }
  } finally {
    if (cloudWatchController === controller) cloudWatchController = null;
    if (!document.hidden && navigator.onLine !== false && cloudKey && !cloudConflict &&
        (!cloudReceivePending || cloudReceivingCanApply())) {
      cloudWatchRetry = setTimeout(() => void cloudWatchStart(), retryDelay || 250);
    }
  }
}

const cloudSyncBeforeLiveReceive = cloudSync;
cloudSync = async function (force = false) {
  if (cloudBusy) {
    cloudSyncDue = true;
    return;
  }
  clearTimeout(cloudUploadRetry);
  await cloudSyncBeforeLiveReceive(force);
  if (cloudDirty && !cloudConflict && cloudKey && navigator.onLine !== false) {
    cloudUploadFailures++;
    const delay = Math.min(30000, 1000 * 2 ** Math.min(cloudUploadFailures, 5));
    cloudUploadRetry = setTimeout(() => void cloudSync(false), delay);
  } else {
    cloudUploadFailures = 0;
  }
  void cloudWatchStart();
};

const cloudConnectBeforeLiveReceive = cloudConnect;
cloudConnect = async function (entry) {
  if (cloudBusy) {
    showToast('Wait for the current sync to finish before changing the cloud key.');
    return;
  }
  cloudWatchStop();
  clearTimeout(cloudUploadRetry);
  cloudReceivePending = false;
  cloudConflict = false;
  await cloudConnectBeforeLiveReceive(entry);
  void cloudWatchStart();
};

window.addEventListener('offline', cloudWatchStop);
window.addEventListener('online', () => {
  cloudWatchFailures = 0;
  if (cloudKey) void cloudSync(false);
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) cloudWatchStop();
  else if (cloudKey) void cloudSync(false);
});
document.addEventListener('focusout', () => {
  if (cloudReceivePending) queueMicrotask(() => void cloudWatchStart());
});
