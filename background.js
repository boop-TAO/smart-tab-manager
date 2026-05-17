// Smart Tab Manager - Background Service Worker
const STORAGE_KEY = 'tab_groups_backup';

// Auto-group tabs by domain
async function autoGroupTabs() {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const domainMap = new Map();
  
  for (const tab of tabs) {
    if (!tab.url || tab.url.startsWith('chrome://')) continue;
    try {
      const url = new URL(tab.url);
      const domain = url.hostname;
      if (!domainMap.has(domain)) domainMap.set(domain, []);
      domainMap.get(domain).push(tab.id);
    } catch (e) {}
  }
  
  // Group domains with 3+ tabs
  for (const [domain, tabIds] of domainMap) {
    if (tabIds.length >= 3) {
      try {
        const group = await chrome.tabs.group({ tabIds });
        await chrome.tabGroups.update(group, { 
          title: domain.replace('www.', ''), 
          collapsed: true,
          color: getColorForDomain(domain)
        });
      } catch (e) {}
    }
  }
}

function getColorForDomain(domain) {
  const colors = ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan'];
  let hash = 0;
  for (let i = 0; i < domain.length; i++) {
    hash = domain.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

// Ungroup all tabs
async function ungroupAll() {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  for (const tab of tabs) {
    if (tab.groupId !== -1) {
      try {
        await chrome.tabs.ungroup(tab.id);
      } catch (e) {}
    }
  }
}

// Save current session
async function saveSession() {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const session = {
    timestamp: Date.now(),
    tabs: tabs.map(t => ({ url: t.url, title: t.title }))
  };
  const sessions = await chrome.storage.local.get(STORAGE_KEY);
  const list = sessions[STORAGE_KEY] || [];
  list.push(session);
  await chrome.storage.local.set({ [STORAGE_KEY]: list.slice(-20) });
  return session;
}

// Collapse all groups
async function collapseAll() {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const groups = new Set();
  for (const tab of tabs) {
    if (tab.groupId !== -1) groups.add(tab.groupId);
  }
  for (const groupId of groups) {
    try {
      await chrome.tabGroups.update(groupId, { collapsed: true });
    } catch (e) {}
  }
}

// Restore saved session
async function restoreSession(index = -1) {
  const sessions = await chrome.storage.local.get(STORAGE_KEY);
  const list = sessions[STORAGE_KEY] || [];
  if (list.length === 0) return null;
  
  const session = list[index === -1 ? list.length - 1 : index];
  for (const tab of session.tabs) {
    await chrome.tabs.create({ url: tab.url, active: false });
  }
  return session;
}

// Message handler
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    switch (msg.action) {
      case 'autoGroup': await autoGroupTabs(); sendResponse({ ok: true }); break;
      case 'ungroupAll': await ungroupAll(); sendResponse({ ok: true }); break;
      case 'saveSession': const s = await saveSession(); sendResponse({ ok: true, count: s.tabs.length }); break;
      case 'collapseAll': await collapseAll(); sendResponse({ ok: true }); break;
      case 'restoreSession': const r = await restoreSession(msg.index); sendResponse({ ok: true, count: r?.tabs?.length || 0 }); break;
      case 'getSessions': const sessions = await chrome.storage.local.get(STORAGE_KEY); sendResponse({ sessions: sessions[STORAGE_KEY] || [] }); break;
      default: sendResponse({ error: 'unknown action' });
    }
  })();
  return true;
});

// Context menu
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'smart-tab-group',
    title: 'Smart Group Tabs',
    contexts: ['action']
  });
});

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId === 'smart-tab-group') {
    await autoGroupTabs();
  }
});

console.log('Smart Tab Manager ready');
