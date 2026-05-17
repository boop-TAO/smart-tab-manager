// Smart Tab Manager - Background Service Worker
const STORAGE_KEY = 'tab_groups_backup';
const STATS_KEY = 'tab_stats';

// ── Auto-group tabs by domain ──
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
  
  let grouped = 0;
  for (const [domain, tabIds] of domainMap) {
    if (tabIds.length >= 3) {
      try {
        const group = await chrome.tabs.group({ tabIds });
        await chrome.tabGroups.update(group, { 
          title: domain.replace('www.', ''), 
          collapsed: true,
          color: getColorForDomain(domain)
        });
        grouped++;
      } catch (e) {}
    }
  }
  return grouped;
}

function getColorForDomain(domain) {
  const colors = ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan'];
  let hash = 0;
  for (let i = 0; i < domain.length; i++) {
    hash = domain.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

// ── Duplicate tab detection ──
async function findDuplicates() {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const urlMap = new Map();
  const duplicates = [];
  
  for (const tab of tabs) {
    if (!tab.url || tab.url.startsWith('chrome://')) continue;
    // Normalize URL: strip trailing slash and hash
    let norm = tab.url.replace(/\/$/, '').replace(/#.*$/, '');
    if (urlMap.has(norm)) {
      duplicates.push({ id: tab.id, title: tab.title, url: tab.url, original: urlMap.get(norm) });
    } else {
      urlMap.set(norm, { id: tab.id, title: tab.title });
    }
  }
  return duplicates;
}

async function closeDuplicates() {
  const dups = await findDuplicates();
  const ids = dups.map(d => d.id);
  if (ids.length > 0) {
    await chrome.tabs.remove(ids);
  }
  return ids.length;
}

// ── Tab search ──
async function searchTabs(query) {
  if (!query || query.trim().length < 2) return [];
  const q = query.toLowerCase();
  const tabs = await chrome.tabs.query({ currentWindow: true });
  return tabs
    .filter(t => 
      t.title.toLowerCase().includes(q) || 
      (t.url && t.url.toLowerCase().includes(q))
    )
    .map(t => ({ id: t.id, title: t.title, url: t.url, active: t.active }))
    .slice(0, 20);
}

// ── Ungroup all ──
async function ungroupAll() {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  for (const tab of tabs) {
    if (tab.groupId !== -1) {
      try { await chrome.tabs.ungroup(tab.id); } catch (e) {}
    }
  }
}

// ── Session save/restore ──
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

async function getSessions() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  return data[STORAGE_KEY] || [];
}

// ── Collapse all groups ──
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

// ── Stats ──
async function getStats() {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const groups = new Set(tabs.filter(t => t.groupId !== -1).map(t => t.groupId));
  const dups = await findDuplicates();
  return {
    totalTabs: tabs.length,
    groups: groups.size,
    duplicates: dups.length,
  };
}

// ── Periodic tab usage tracking ──
async function updateTabStats() {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const now = Date.now();
  const data = await chrome.storage.local.get(STATS_KEY);
  let stats = data[STATS_KEY] || { peak: 0, history: [] };

  if (tabs.length > stats.peak) stats.peak = tabs.length;
  stats.history.push({ time: now, count: tabs.length });
  // Keep last 7 days of hourly samples
  const cutoff = now - 7 * 24 * 60 * 60 * 1000;
  stats.history = stats.history.filter(h => h.time > cutoff);

  await chrome.storage.local.set({ [STATS_KEY]: stats });
}

// ── Message handler ──
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    switch (msg.action) {
      case 'autoGroup': 
        const count = await autoGroupTabs(); 
        sendResponse({ ok: true, groups: count }); 
        break;
      case 'ungroupAll': 
        await ungroupAll(); 
        sendResponse({ ok: true }); 
        break;
      case 'saveSession': 
        const s = await saveSession(); 
        sendResponse({ ok: true, count: s.tabs.length }); 
        break;
      case 'collapseAll': 
        await collapseAll(); 
        sendResponse({ ok: true }); 
        break;
      case 'restoreSession': 
        const r = await restoreSession(msg.index); 
        sendResponse({ ok: true, count: r?.tabs?.length || 0 }); 
        break;
      case 'getSessions': 
        const sessions = await getSessions(); 
        sendResponse({ sessions }); 
        break;
      case 'getStats': 
        const stats = await getStats(); 
        sendResponse({ stats }); 
        break;
      case 'findDuplicates': 
        const dups = await findDuplicates(); 
        sendResponse({ duplicates: dups }); 
        break;
      case 'closeDuplicates': 
        const closed = await closeDuplicates(); 
        sendResponse({ ok: true, closed }); 
        break;
      case 'searchTabs': 
        const results = await searchTabs(msg.query); 
        sendResponse({ results }); 
        break;
      case 'activateTab':
        await chrome.tabs.update(msg.tabId, { active: true });
        sendResponse({ ok: true });
        break;
      default: 
        sendResponse({ error: 'unknown action' }); 
    }
  })();
  return true;
});

// ── Keyboard shortcuts ──
chrome.commands.onCommand.addListener(async (command) => {
  switch (command) {
    case 'auto-group': await autoGroupTabs(); break;
    case 'collapse-all': await collapseAll(); break;
    case 'close-duplicates': await closeDuplicates(); break;
  }
});

// ── Context menu ──
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'smart-tab-group',
    title: 'Smart Group Tabs',
    contexts: ['action']
  });
  // Periodic stats tracking every hour
  chrome.alarms.create('trackStats', { periodInMinutes: 60 });
});

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId === 'smart-tab-group') {
    await autoGroupTabs();
  }
});

// ── Alarm handler for stats ──
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'trackStats') {
    await updateTabStats();
  }
});

// Initial stats
updateTabStats();
console.log('Smart Tab Manager v1.1 ready');
