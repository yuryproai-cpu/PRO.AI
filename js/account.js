'use strict';

const ADMIN_TELEGRAM_IDS = ['6476078926'];
const WORKER_URL = 'https://pro-ai.yury-proai.workers.dev';

const LS_KEYS = ['proai_account', 'civ_profile'];
const LS_CACHE = 'proai_session_cache';
const LS_UID_KEY = 'proai_browser_uid';

const AVATAR_MAX_PX = 256;
const AVATAR_JPEG_QUALITY = 0.85;
const AVATAR_MAX_INPUT_BYTES = 10 * 1024 * 1024;

const NAME_MAX_LEN = 20;
const BIO_MAX_LEN = 150;

async function getDb() {
  await Firebase.ready;
  return Firebase.db;
}

function nowServerTs() {
  return firebase.firestore.FieldValue.serverTimestamp();
}

function readLS(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); }
  catch (e) { return null; }
}

function clampString(v, max) {
  return (typeof v === 'string') ? v.trim().slice(0, max) || null : null;
}

function getInitData() {
  return (window.Telegram && Telegram.WebApp && Telegram.WebApp.initData) || '';
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
      return { ok: true, uid: d.uid, isAdmin: !!d.isAdmin };
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
  if (window.Telegram && Telegram.WebApp && Telegram.WebApp.initDataUnsafe?.user) return 'telegram';
  return 'browser';
}

function getLoginTypeHint() {
  if (getSourceHint() === 'telegram') return 'telegram';
  if (typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser) return 'google';
  return 'test';
}

function isAdminUid(uid) {
  return ADMIN_TELEGRAM_IDS.includes(String(uid));
}

function defaultProfile(uid) {
  return {
    uid,
    source: null,
    name: null,
    bio: null,
    loginType: null,
    role: 'guest',
    tariff: null,
    xp: 0,
    badges: [],
    hasAvatar: false,
    migrated: false,
    createdAt: null,
    updatedAt: null
  };
}

async function loadAccount() {
  const uid = getUid();
  const base = defaultProfile(uid);
  base.loginType = getLoginTypeHint();
  base.source = getSourceHint();

  let server = null, priv = null, usersOk = false;

  try {
    const db = await getDb();
    const snap = await db.collection('users').doc(uid).get();
    if (snap.exists) server = snap.data();
    usersOk = true;
    try { localStorage.setItem(LS_CACHE, JSON.stringify(server || {})); } catch (e) {}
  } catch (e) {
    console.warn('[account] users недоступен, показываю локальную копию:', e && e.message);
  }
  try {
    const db = await getDb();
    const snap = await db.collection('users_private').doc(uid).get();
    if (snap.exists) priv = snap.data();
  } catch (e) {
    console.warn('[account] users_private недоступен:', e && e.message);
  }

  if (!usersOk) server = readLS(LS_CACHE);

  const account = {
    ...base,
    ...(server || {}),
    uid,
    role: priv?.role ?? 'guest',
    tariff: priv?.tariff ?? null,
    xp: priv?.xp ?? 0,
    badges: priv?.badges ?? []
  };

  account.isAdmin = isAdminUid(uid);
  if (account.isAdmin) {
    account.role = 'admin';
  } else if (account.role === 'admin') {
    console.warn('[account] role=admin в users_private для uid', uid, '— игнорируется');
    account.role = 'user';
  }

  account.offline = !usersOk;
  return account;
}

async function saveAccountFields(fields) {
  const db = await getDb();
  const uid = getUid();

  // Правила v3.1: пишем ТОЛЬКО name/bio/hasAvatar
  const payload = {};
  if ('name' in fields)      payload.name      = clampString(fields.name, NAME_MAX_LEN);
  if ('bio' in fields)       payload.bio       = clampString(fields.bio, BIO_MAX_LEN);
  if ('hasAvatar' in fields) payload.hasAvatar = !!fields.hasAvatar;
  if (!Object.keys(payload).length) return false;

  await db.collection('users').doc(uid).set(payload, { merge: true });

  try {
    const cache = { ...readLS(LS_CACHE), ...payload, updatedAt: Date.now() };
    localStorage.setItem(LS_CACHE, JSON.stringify(cache));
  } catch (e) {}
  return true;
}

async function saveAvatarDataUrl(dataUrl) {
  const db = await getDb();
  const uid = getUid();
  await db.collection('avatars').doc(uid).set({
    data: dataUrl,
    updatedAt: nowServerTs()
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
    console.warn('[account] аватар не прочитан:', e && e.message);
    return null;
  }
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

function mapLegacyProfile(raw) {
  const name = clampString(
    raw.nickname ?? raw.nickName ?? raw.userName ?? raw.name ?? raw.login ?? raw.playerName,
    NAME_MAX_LEN);
  const bio = clampString(raw.bio ?? raw.about, BIO_MAX_LEN);
  const avatar = (typeof raw.avatar === 'string' && raw.avatar.startsWith('data:image'))
    ? raw.avatar : null;
  return { name, bio, avatar };
}

function markPlatformMigrated() {
  localStorage.removeItem(LS_KEYS[0]);
  const civ = readLS(LS_KEYS[1]);
  if (civ && !civ._platformMigrated) {
    civ._platformMigrated = true;
    try { localStorage.setItem(LS_KEYS[1], JSON.stringify(civ)); } catch (e) {}
  }
}

async function migrateLocalToServer() {
  const uid = getUid();

  const civEarly = readLS('civ_profile');
  if (civEarly && civEarly._platformMigrated && !readLS(LS_KEYS[0])) {
    return { skipped: true };
  }

  let local = readLS(LS_KEYS[0]) || readLS(LS_KEYS[1]);
  if (!local) return { skipped: true };

  const mapped = mapLegacyProfile(local);
  if (!mapped.name && !mapped.bio && !mapped.avatar) {
    markPlatformMigrated();
    return { skipped: true };
  }

  let db;
  try { db = await getDb(); }
  catch (e) { return { deferred: true, reason: 'network' }; }

  let serverSnap;
  try { serverSnap = await db.collection('users').doc(uid).get(); }
  catch (e) { return { deferred: true, reason: 'network' }; }

  const server = serverSnap.exists ? serverSnap.data() : null;
  const needProfile = !server || !server.name && !server.bio && !server.hasAvatar;
  const needAvatar  = !!mapped.avatar && (!server || !server.hasAvatar);

  if (!needProfile && !needAvatar) { markPlatformMigrated(); return { done: true, alreadyMigrated: true }; }

  try {
    if (needAvatar) await saveAvatarDataUrl(mapped.avatar);
    if (needProfile) {
      await saveAccountFields({
        name: mapped.name,
        bio: mapped.bio
      });
    }
  } catch (e) {
    console.warn('[account] миграция прервана, повторим на следующем запуске:', e);
    return { deferred: true, reason: 'write' };
  }

  markPlatformMigrated();
  return { done: true, migratedAvatar: needAvatar, migratedProfile: needProfile };
}

async function initAccount() {
  let auth = { ok: false, reason: 'no attempt' };
  try {
    auth = await authViaWorker();
  } catch (e) {
    console.warn('[account] вход через охранника не удался:', e && e.message);
    if (e && e.message === 'account deleted') showToast('Этот аккаунт удалён');
  }

  const account = await loadAccount();
  account.writable = !account.offline && auth.ok;

  const migration = account.writable
    ? await migrateLocalToServer()
    : { deferred: true, reason: auth.ok ? 'offline' : 'read-only' };

  let createdNew = false;
  if (account.writable && !migration.deferred) {
    try {
      const db = await getDb();
      const ref = db.collection('users').doc(account.uid);
      const snap = await ref.get();
      if (!snap.exists) {
        await ref.set({ name: null, bio: null, hasAvatar: false });
        createdNew = true;
      }
    } catch (e) {
      console.warn('[account] не удалось создать профиль:', e && e.message);
    }
  }

  const needsReread = (!!migration.done && !migration.alreadyMigrated) || createdNew;
  return { account: needsReread ? await loadAccount() : account, migration };
}

window.PROAI = window.PROAI || {};
Object.assign(window.PROAI, {
  ADMIN_TELEGRAM_IDS,
  WORKER_URL,
  initAccount, loadAccount, saveAccountFields, getDb,
  saveAvatarDataUrl, getAvatarDataUrl, fileToAvatarDataUrl,
  isAdminUid, getUid, mapLegacyProfile,
  authViaWorker, workerApi
});