import {
  classifyUrl,
  clearAuth,
  getRecentSaves,
  getSettings,
  isSignedIn,
} from './lib.js';

const $ = (id) => document.getElementById(id);

function shortUrl(u) {
  try {
    const url = new URL(u);
    return url.host + url.pathname.replace(/\/$/, '');
  } catch {
    return u;
  }
}

async function renderRecent() {
  const list = $('recent-list');
  list.innerHTML = '';
  const recent = await getRecentSaves();
  if (!recent.length) {
    const li = document.createElement('li');
    li.className = 'muted';
    li.textContent = 'No saves yet.';
    list.appendChild(li);
    return;
  }
  for (const r of recent) {
    const li = document.createElement('li');
    li.title = r.rawUrl;
    li.textContent = r.title || shortUrl(r.rawUrl);
    list.appendChild(li);
  }
}

async function renderSignedInView() {
  $('signed-out').hidden = true;
  $('signed-in').hidden = false;

  const { userEmail } = await getSettings();
  $('who').textContent = userEmail ? `Signed in as ${userEmail}` : '';

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url || '';
  const saveBtn = $('save-btn');
  const status = $('save-status');
  status.textContent = '';
  status.className = 'status';

  $('page-title').textContent = tab?.title || 'Untitled';
  $('page-url').textContent = shortUrl(url);

  const isHttp = /^https?:/i.test(url);
  if (!isHttp) {
    $('detected-type').textContent = 'unsupported';
    saveBtn.disabled = true;
    status.textContent = 'Only http(s) pages can be saved.';
    status.classList.add('err');
    await renderRecent();
    return;
  }

  const type = classifyUrl(url);
  $('detected-type').textContent = type;
  saveBtn.disabled = false;

  saveBtn.onclick = async () => {
    saveBtn.disabled = true;
    status.className = 'status';
    status.textContent = 'Saving…';
    const response = await chrome.runtime.sendMessage({
      kind: 'flowy:save',
      payload: {
        rawUrl: url,
        sourceUrl: url,
        title: tab?.title,
        tabId: tab?.id,
      },
    });
    if (response?.ok) {
      status.textContent = 'Saved to Flowy.';
      status.classList.add('ok');
      await renderRecent();
      // Re-enable after a moment so user can save again if they want.
      setTimeout(() => { saveBtn.disabled = false; }, 800);
    } else {
      status.textContent = `Failed: ${response?.error || 'UNKNOWN'}`;
      status.classList.add('err');
      saveBtn.disabled = false;
      if (response?.error === 'UNAUTHORIZED' || response?.error === 'NOT_SIGNED_IN') {
        await renderSignedOutView();
      }
    }
  };

  await renderRecent();
}

async function renderSignedOutView() {
  $('signed-in').hidden = true;
  $('signed-out').hidden = false;
}

async function init() {
  $('open-options').addEventListener('click', () => chrome.runtime.openOptionsPage());
  $('go-signin').addEventListener('click', () => chrome.runtime.openOptionsPage());
  $('sign-out').addEventListener('click', async () => {
    await clearAuth();
    await renderSignedOutView();
  });

  if (await isSignedIn()) {
    await renderSignedInView();
  } else {
    await renderSignedOutView();
  }
}

init();
