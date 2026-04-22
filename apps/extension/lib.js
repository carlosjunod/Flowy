// Shared helpers for popup, options, and background service worker.
// Pure ES module — no external deps.

const DEFAULT_FLOWY_URL = 'https://tryflowy.app';
const DEFAULT_PB_URL = 'https://tryflowy.app';

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
]);

const INSTAGRAM_HOSTS = new Set(['instagram.com', 'www.instagram.com']);
const REDDIT_HOSTS = new Set([
  'reddit.com',
  'www.reddit.com',
  'old.reddit.com',
  'new.reddit.com',
  'np.reddit.com',
  'redd.it',
]);

export async function getSettings() {
  const stored = await chrome.storage.local.get([
    'flowyUrl',
    'pbUrl',
    'token',
    'userEmail',
  ]);
  return {
    flowyUrl: (stored.flowyUrl || DEFAULT_FLOWY_URL).replace(/\/+$/, ''),
    pbUrl: (stored.pbUrl || stored.flowyUrl || DEFAULT_PB_URL).replace(/\/+$/, ''),
    token: stored.token || null,
    userEmail: stored.userEmail || null,
  };
}

export async function setSettings(patch) {
  await chrome.storage.local.set(patch);
}

export async function clearAuth() {
  await chrome.storage.local.remove(['token', 'userEmail']);
}

export async function isSignedIn() {
  const { token } = await getSettings();
  return !!token;
}

// Email/password login against PocketBase. Returns { ok, error? }.
export async function loginWithPassword(email, password) {
  const { pbUrl } = await getSettings();
  const url = `${pbUrl}/api/collections/users/auth-with-password`;
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identity: email, password }),
    });
  } catch (err) {
    return { ok: false, error: `NETWORK: ${err.message || 'fetch failed'}` };
  }

  let body;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok) {
    const msg = body?.message || `HTTP ${res.status}`;
    return { ok: false, error: msg };
  }
  const token = body?.token;
  const userEmail = body?.record?.email || email;
  if (!token) return { ok: false, error: 'NO_TOKEN_IN_RESPONSE' };

  await setSettings({ token, userEmail });
  return { ok: true, userEmail };
}

export function classifyUrl(rawUrl) {
  let u;
  try {
    u = new URL(rawUrl);
  } catch {
    return 'url';
  }
  const host = u.hostname.toLowerCase();
  if (YOUTUBE_HOSTS.has(host)) return 'youtube';
  if (INSTAGRAM_HOSTS.has(host)) return 'instagram';
  if (REDDIT_HOSTS.has(host)) return 'reddit';
  return 'url';
}

// POST to the Flowy ingest API. Returns { ok, id?, error? }.
export async function ingestUrl({ rawUrl, sourceUrl, type } = {}) {
  if (!rawUrl) return { ok: false, error: 'MISSING_URL' };
  const { flowyUrl, token } = await getSettings();
  if (!token) return { ok: false, error: 'NOT_SIGNED_IN' };

  const finalType = type || classifyUrl(rawUrl);
  const endpoint = `${flowyUrl}/api/ingest`;

  let res;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        type: finalType,
        raw_url: rawUrl,
        source_url: sourceUrl || rawUrl,
      }),
    });
  } catch (err) {
    return { ok: false, error: `NETWORK: ${err.message || 'fetch failed'}` };
  }

  let body;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (res.status === 401) {
    await clearAuth();
    return { ok: false, error: 'UNAUTHORIZED' };
  }
  if (!res.ok) {
    return { ok: false, error: body?.error || `HTTP ${res.status}` };
  }
  const id = body?.data?.id;
  return { ok: true, id };
}

export async function recordRecentSave(entry) {
  const { recent = [] } = await chrome.storage.local.get('recent');
  const next = [
    { ...entry, savedAt: Date.now() },
    ...recent.filter((r) => r.rawUrl !== entry.rawUrl),
  ].slice(0, 10);
  await chrome.storage.local.set({ recent: next });
}

export async function getRecentSaves() {
  const { recent = [] } = await chrome.storage.local.get('recent');
  return recent;
}
