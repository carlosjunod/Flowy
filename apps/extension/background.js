import { ingestUrl, isSignedIn, recordRecentSave } from './lib.js';

const MENU_IDS = {
  page: 'flowy-save-page',
  link: 'flowy-save-link',
  image: 'flowy-save-image',
  selection: 'flowy-save-selection',
};

async function setupContextMenus() {
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({
    id: MENU_IDS.page,
    title: 'Save page to Flowy',
    contexts: ['page'],
  });
  chrome.contextMenus.create({
    id: MENU_IDS.link,
    title: 'Save link to Flowy',
    contexts: ['link'],
  });
  chrome.contextMenus.create({
    id: MENU_IDS.image,
    title: 'Save image to Flowy',
    contexts: ['image'],
  });
  chrome.contextMenus.create({
    id: MENU_IDS.selection,
    title: 'Save selection page to Flowy',
    contexts: ['selection'],
  });
}

chrome.runtime.onInstalled.addListener(async () => {
  await setupContextMenus();
});

chrome.runtime.onStartup.addListener(async () => {
  await setupContextMenus();
});

async function flashBadge(tabId, text, color) {
  try {
    if (tabId != null) {
      await chrome.action.setBadgeBackgroundColor({ tabId, color });
      await chrome.action.setBadgeText({ tabId, text });
      setTimeout(() => {
        chrome.action.setBadgeText({ tabId, text: '' }).catch(() => {});
      }, 2500);
    } else {
      await chrome.action.setBadgeBackgroundColor({ color });
      await chrome.action.setBadgeText({ text });
      setTimeout(() => {
        chrome.action.setBadgeText({ text: '' }).catch(() => {});
      }, 2500);
    }
  } catch {
    // non-fatal
  }
}

async function notifyError(message) {
  try {
    await chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon-128.png',
      title: 'Flowy',
      message,
    });
  } catch {
    // ignore
  }
}

async function saveAndReport({ rawUrl, sourceUrl, title, type, tabId }) {
  if (!(await isSignedIn())) {
    await chrome.runtime.openOptionsPage();
    await notifyError('Sign in to Flowy from the extension options.');
    return { ok: false, error: 'NOT_SIGNED_IN' };
  }
  const result = await ingestUrl({ rawUrl, sourceUrl, type });
  if (result.ok) {
    await recordRecentSave({ rawUrl, title: title || rawUrl });
    await flashBadge(tabId, 'OK', '#16a34a');
  } else {
    await flashBadge(tabId, '!', '#dc2626');
    if (result.error === 'UNAUTHORIZED') {
      await chrome.runtime.openOptionsPage();
      await notifyError('Session expired. Sign back in to Flowy.');
    } else {
      await notifyError(`Save failed: ${result.error}`);
    }
  }
  return result;
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const tabId = tab?.id;
  switch (info.menuItemId) {
    case MENU_IDS.page:
    case MENU_IDS.selection: {
      const rawUrl = info.pageUrl || tab?.url;
      if (!rawUrl) return;
      await saveAndReport({ rawUrl, sourceUrl: rawUrl, title: tab?.title, tabId });
      return;
    }
    case MENU_IDS.link: {
      const rawUrl = info.linkUrl;
      if (!rawUrl) return;
      await saveAndReport({
        rawUrl,
        sourceUrl: info.pageUrl || tab?.url,
        title: info.selectionText || rawUrl,
        tabId,
      });
      return;
    }
    case MENU_IDS.image: {
      const rawUrl = info.srcUrl;
      if (!rawUrl) return;
      // Ingest API requires a remote image fetch path via `raw_image` (base64 or URL).
      // We fall back to saving the URL as a bookmark — the worker can refetch.
      await saveAndReport({
        rawUrl,
        sourceUrl: info.pageUrl || tab?.url,
        title: `Image from ${tab?.title || rawUrl}`,
        type: 'url',
        tabId,
      });
      return;
    }
    default:
      return;
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'save-current-tab') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) return;
  await saveAndReport({
    rawUrl: tab.url,
    sourceUrl: tab.url,
    title: tab.title,
    tabId: tab.id,
  });
});

// Popup bridge — lets the popup trigger a save via the service worker so the
// notification + badge flow is identical to context-menu saves.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.kind !== 'flowy:save') return undefined;
  saveAndReport(msg.payload || {}).then(sendResponse);
  return true; // async response
});
