// Popup UI Logic
const $ = id => document.getElementById(id);

async function sendAction(action, extra = {}) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const resp = await chrome.runtime.sendMessage({ action, ...extra });
  return resp;
}

async function updateStats() {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const groups = new Set(tabs.filter(t => t.groupId !== -1).map(t => t.groupId));
  $('stats').textContent = `${tabs.length} tabs · ${groups.size} groups`;
}

$('autoGroup').onclick = async () => {
  $('autoGroup').textContent = '⏳ Grouping...';
  await sendAction('autoGroup');
  await updateStats();
  $('autoGroup').innerHTML = '<span class="icon">📦</span> Auto-Group Tabs by Domain';
};

$('ungroupAll').onclick = async () => {
  if (!confirm('Ungroup all tabs?')) return;
  await sendAction('ungroupAll');
  await updateStats();
};

$('saveSession').onclick = async () => {
  const resp = await sendAction('saveSession');
  $('saveSession').innerHTML = `<span class="icon">✅</span> Saved ${resp.count} tabs`;
  setTimeout(() => {
    $('saveSession').innerHTML = '<span class="icon">💾</span> Save Current Session';
  }, 2000);
};

$('collapseAll').onclick = async () => {
  await sendAction('collapseAll');
  await updateStats();
};

$('restoreSession').onclick = async () => {
  const resp = await sendAction('restoreSession');
  if (resp.count > 0) {
    $('restoreSession').innerHTML = `<span class="icon">✅</span> Restored ${resp.count} tabs`;
    setTimeout(() => {
      $('restoreSession').innerHTML = '<span class="icon">📂</span> Restore Last Session';
    }, 2000);
  }
};

updateStats();
