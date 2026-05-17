// Popup UI Logic
const $ = id => document.getElementById(id);

async function sendAction(action, extra = {}) {
  const resp = await chrome.runtime.sendMessage({ action, ...extra });
  return resp;
}

// ── Stats ──
async function updateStats() {
  const resp = await sendAction('getStats');
  if (resp.stats) {
    $('tabCount').textContent = resp.stats.totalTabs;
    $('groupCount').textContent = resp.stats.groups;
    $('dupCount').textContent = resp.stats.duplicates;
    $('dupCount').parentElement.classList.toggle('warn', resp.stats.duplicates > 0);
    $('closeDuplicates').style.display = resp.stats.duplicates > 0 ? 'flex' : 'none';
  }
}

// ── Search ──
let searchTimeout;
$('searchInput').addEventListener('input', () => {
  clearTimeout(searchTimeout);
  const q = $('searchInput').value.trim();
  if (q.length < 2) {
    $('searchResults').classList.remove('visible');
    $('searchResults').innerHTML = '';
    return;
  }
  searchTimeout = setTimeout(async () => {
    const resp = await sendAction('searchTabs', { query: q });
    const container = $('searchResults');
    if (!resp.results || resp.results.length === 0) {
      container.innerHTML = '<div class="search-item" style="color:#888">No results</div>';
    } else {
      container.innerHTML = resp.results.map(t => `
        <div class="search-item" data-tab-id="${t.id}">
          <img class="favicon" src="chrome://favicon/${t.url}" onerror="this.style.display='none'">
          <span class="title" title="${t.title}">${escapeHtml(t.title)}</span>
          ${t.active ? '<span class="active-dot"></span>' : ''}
        </div>
      `).join('');
      // Click to activate
      container.querySelectorAll('.search-item').forEach(el => {
        el.addEventListener('click', () => {
          const tabId = parseInt(el.dataset.tabId);
          sendAction('activateTab', { tabId });
          window.close();
        });
      });
    }
    container.classList.add('visible');
  }, 200);
});

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ── Buttons ──
$('smartGroup').onclick = async () => {
  $('smartGroup').innerHTML = '<span class="icon">⏳</span> Grouping by topic...';
  const resp = await sendAction('smartGroup');
  $('smartGroup').innerHTML = `<span class="icon">✅</span> ${resp.groups} topic groups`;
  setTimeout(() => {
    $('smartGroup').innerHTML = '<span class="icon">🤖</span> Smart Group by Topic';
  }, 2500);
  await updateStats();
};

$('autoGroup').onclick = async () => {
  $('autoGroup').innerHTML = '<span class="icon">⏳</span> Grouping...';
  await sendAction('autoGroup');
  $('autoGroup').innerHTML = '<span class="icon">📦</span> Group by Domain';
  await updateStats();
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
    $('saveSession').innerHTML = '<span class="icon">💾</span> Save Session';
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

$('closeDuplicates').onclick = async () => {
  const resp = await sendAction('closeDuplicates');
  $('closeDuplicates').innerHTML = `<span class="icon">✅</span> Closed ${resp.closed} dupes`;
  setTimeout(async () => {
    $('closeDuplicates').innerHTML = '<span class="icon">🗑️</span> Close Duplicates';
    await updateStats();
  }, 2000);
};

// Init
updateStats();
