'use strict';

// account.js v1.0 — вход через охранника + профиль (чистый лист, 23.11.2026)
// Роли: admin — только владелец (решает охранник), все остальные — user.
// Клиент права не решает: isAdmin приходит только с охранника.

const WORKER_URL = 'https://pro-ai.yury-proai.workers.dev';

const NAME_MAX_LEN = 20;
const BIO_MAX_LEN = 150;
const AVATAR_MAX_PX = 256;
const AVATAR_JPEG_QUALITY = 0.85;
const AVATAR_MAX_INPUT_BYTES = 10 * 1024 * 1024;
const LS_UID_KEY = 'proai_browser_uid';

let lastAuth = { ok: false, reason: 'no attempt' };

async function getDb() {
  await Firebase.ready;
  return Firebase.db;
}

function getInitData() {
  return (window.Telegram && Telegram.WebApp && Telegram.WebApp.initData) || '';
}

function getUid() {
  if (window.Telegram && Telegram.WebApp && Telegram.WebApp.initDataUnsafe?.user?.id) {
    return String(Telegram.WebApp.initDataUnsafe.user.id);
  }
  if (firebase.auth && firebase.auth().currentUser) {
    return firebase.auth().currentUser.uid;
  }
  let uid = localStorage.getItem(LS_UID_KEY);
  if (!uid) {
    uid = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? 'browser_' + crypto.randomUUID()
      : 'browser_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    localStorage.setItem(LS_UID_KEY, uid);
  }
  return uid;
}

function getSourceHint() {
  return (window.Telegram && Telegram.WebApp && Telegram.WebApp.initDataUnsafe?.user) ? 'telegram' : 'browser';
}

function getLoginTypeHint() {
  return getSourceHint() === 'telegram' ? 'telegram' : 'test';
}

let authReady = null;
function authViaWorker() {
  if (!authReady) {
    authReady = (async () => {
      const initData = getInitData();
      if (!initData) return { ok: false, reason: 'browser (только чтение)' };
      await Firebase.ready;
      const r = await fetch(WORKER_URL + '/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData: initData })
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.customToken) throw new Error(d.error || ('auth ' + r.status));
      await firebase.auth().signInWithCustomToken(d.customToken);
      lastAuth = { ok: true, uid: d.uid, isAdmin: !!d.isAdmin };
      return lastAuth;
    })();
    authReady.catch(() => { authReady = null; });
  }
  return authReady;
}

async function workerApi(path, body) {
  const r = await fetch(WORKER_URL + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(Object.assign({ initData: getInitData() }, body || {}))
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || ('api ' + r.status));
  return d;
}

function defaultProfile(uid) {
  return {
    uid,
    name: null,
    bio: null,
    hasAvatar: false,
    likesCount: 0,
    followersCount: 0,
    followingCount: 0,
    role: 'user',
    loginType: getLoginTypeHint(),
    source: getSourceHint(),
    createdAt: null,
    updatedAt: null
  };
}

async function loadAccount() {
  const uid = getUid();
  const account = defaultProfile(uid);
  let server = null, usersOk = false;
  try {
    const db = await getDb();
    const snap = await db.collection('users').doc(uid).get();
    if (snap.exists) server = snap.data();
    usersOk = true;
  } catch (e) {
    console.warn('[account] профиль недоступен:', e && e.message);
  }
  if (server) Object.assign(account, server, { uid });
  account.isAdmin = !!(lastAuth.ok && lastAuth.isAdmin);
  if (account.isAdmin) account.role = 'admin';
  account.writable = lastAuth.ok;
  account.offline = !usersOk;
  return account;
}

async function ensureProfile(account) {
  try {
    const db = await getDb();
    const ref = db.collection('users').doc(account.uid);
    const snap = await ref.get();
    if (!snap.exists) {
      await ref.set({ name: null, bio: null, hasAvatar: false });
      return true;
    }
  } catch (e) {
    console.warn('[account] не удалось создать профиль:', e && e.message);
  }
  return false;
}

async function initAccount() {
  try {
    await authViaWorker();
  } catch (e) {
    console.warn('[account] вход через охранника не удался:', e && e.message);
    lastAuth = { ok: false, reason: e && e.message };
  }
  const account = await loadAccount();
  if (account.writable) await ensureProfile(account);
  return account;
}

function clampString(v, max) {
  return (typeof v === 'string') ? v.trim().slice(0, max) || null : null;
}

async function saveAccountFields(fields) {
  const db = await getDb();
  const uid = getUid();
  const payload = {};
  if ('name' in fields)      payload.name      = clampString(fields.name, NAME_MAX_LEN);
  if ('bio' in fields)       payload.bio       = clampString(fields.bio, BIO_MAX_LEN);
  if ('hasAvatar' in fields) payload.hasAvatar = !!fields.hasAvatar;
  if (!Object.keys(payload).length) return false;
  await db.collection('users').doc(uid).set(payload, { merge: true });
  return true;
}

function fileToAvatarDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file) { reject(new Error('no file')); return; }
    if (!file.type || !file.type.startsWith('image/')) {
      reject(new Error('not an image')); return;
    }
    if (file.size > AVATAR_MAX_INPUT_BYTES) {
      reject(new Error('file too large (max 10 МБ)')); return;
    }
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      if (!img.width || !img.height) {
        URL.revokeObjectURL(url);
        reject(new Error('bad image dimensions')); return;
      }
      const side = Math.min(img.width, img.height);
      const c = document.createElement('canvas');
      c.width = AVATAR_MAX_PX; c.height = AVATAR_MAX_PX;
      c.getContext('2d').drawImage(img,
        (img.width - side) / 2, (img.height - side) / 2, side, side,
        0, 0, AVATAR_MAX_PX, AVATAR_MAX_PX);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', AVATAR_JPEG_QUALITY));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad image')); };
    img.src = url;
  });
}

async function saveAvatarDataUrl(dataUrl) {
  const db = await getDb();
  const uid = getUid();
  await db.collection('avatars').doc(uid).set({
    data: dataUrl,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
  await saveAccountFields({ hasAvatar: true });
  return true;
}

async function getAvatarDataUrl(uid) {
  try {
    const db = await getDb();
    const snap = await db.collection('avatars').doc(String(uid || getUid())).get();
    return snap.exists ? (snap.data().data || null) : null;
  } catch (e) {
    return null;
  }
}

window.PROAI = window.PROAI || {};
Object.assign(window.PROAI, {
  WORKER_URL,
  initAccount, loadAccount, ensureProfile, saveAccountFields,
  saveAvatarDataUrl, getAvatarDataUrl, fileToAvatarDataUrl,
  getDb, getUid, authViaWorker, workerApi, getSourceHint, getLoginTypeHint
});
