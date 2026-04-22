import {
  clearAuth,
  getSettings,
  loginWithPassword,
  setSettings,
} from './lib.js';

const $ = (id) => document.getElementById(id);

function setStatus(el, text, kind) {
  el.textContent = text;
  el.className = 'status' + (kind ? ` ${kind}` : '');
}

async function hydrate() {
  const { flowyUrl, pbUrl, token, userEmail } = await getSettings();
  $('flowy-url').value = flowyUrl;
  $('pb-url').value = pbUrl;

  if (token) {
    $('signin-card').hidden = true;
    $('signed-in-card').hidden = false;
    $('current-email').textContent = userEmail || '(unknown)';
  } else {
    $('signin-card').hidden = false;
    $('signed-in-card').hidden = true;
  }
}

async function saveServer() {
  const flowyUrl = $('flowy-url').value.trim();
  const pbUrl = $('pb-url').value.trim() || flowyUrl;
  if (!flowyUrl) {
    setStatus($('server-status'), 'Flowy URL is required.', 'err');
    return;
  }
  try {
    new URL(flowyUrl);
    new URL(pbUrl);
  } catch {
    setStatus($('server-status'), 'Invalid URL.', 'err');
    return;
  }
  await setSettings({ flowyUrl, pbUrl });

  // Request host permission for custom origins so fetch works at runtime.
  try {
    const origins = [
      new URL(flowyUrl).origin + '/*',
      new URL(pbUrl).origin + '/*',
    ];
    await chrome.permissions.request({ origins });
  } catch {
    // If permissions API rejects (e.g. tryflowy.app is already in host_permissions), ignore.
  }

  setStatus($('server-status'), 'Saved.', 'ok');
}

async function signIn() {
  const email = $('email').value.trim();
  const password = $('password').value;
  if (!email || !password) {
    setStatus($('signin-status'), 'Email and password are required.', 'err');
    return;
  }
  setStatus($('signin-status'), 'Signing in…');
  const result = await loginWithPassword(email, password);
  if (result.ok) {
    setStatus($('signin-status'), 'Signed in.', 'ok');
    await hydrate();
  } else {
    setStatus($('signin-status'), result.error || 'Sign-in failed.', 'err');
  }
}

async function signOut() {
  await clearAuth();
  await hydrate();
}

function init() {
  $('save-server').addEventListener('click', saveServer);
  $('signin-btn').addEventListener('click', signIn);
  $('signout-btn').addEventListener('click', signOut);

  // Enter in the password field submits the form.
  $('password').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') signIn();
  });

  $('open-shortcuts').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  });

  hydrate();
}

init();
