/* ============================================================
   PRO.AI · js/account.js  —  v0.2.6
   Отличие от v0.2.5: вход через Cloudflare Worker (/api/auth →
   signInWithCustomToken), записи в users только name/bio/hasAvatar
   (совместимо с правилами v3.1), журнал миграции убран.
   ============================================================ */

'use strict';

/* ---------- Константы ---------- */

const ADMIN_TELEGRAM_IDS = ['6476078926']; // права ТОЛЬКО здесь

const WORKER_URL = 'https://pro-ai.yury-proai.workers.dev'; // охранник

const LS_KEYS = ['proai_account', 'civ_profile']; // legacy, приоритет слева
const LS_CACHE = 'proai_session_cache';           // offline last-known-good
const LS_UID_KEY = 'proai_browser_uid';

const AVATAR_MAX_PX = 256;
const AVATAR_JPEG_QUALITY = 0.85;
const AVATAR_MAX_INPUT_BYTES = 10 * 1024 * 1024;

const NAME_MAX_LEN = 20;
const BIO_MAX_LEN = 150;

/* ---------- Мост к Firebase (js/firebase.js) ---------- */

async function getDb() {
  await Firebase.ready;      // ждём динамическую загрузку SDK
  return Firebase.db;
}

/* ---------- Утилиты ---------- */

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

/* ---------- Вход через охранника ---------- */

let authReady = null;
function authViaWorker() {
  if (!authReady) {
    authReady = (async () => {
      const initData = getInitData();
      if (!initData) return { ok: false, reason: 'browser (только чтение)' };
      await Firebase.ready; // firebase.auth должен быть загружен
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
    authReady.catch(() => { authReady = null; }); // неудача — можно повторить на след. старте
  }
  return authReady;
}

/* ---------- Запросы к охраннику (лайки/подписки — следующий спринт файла) ---------- */

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

/* ---------- uid и вход ---------- */

function getUid() {
  if (window.Telegram && Telegram.WebApp && Telegram.WebApp.initDataUnsafe?.user?.id) {
    return String(Telegram.WebApp.initDataUnsafe.user.id);      // telegram_id, НЕ username
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

/* ---------- Профиль: дефолты и загрузка ---------- */

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

  if (!usersOk) server = readLS(LS_CACHE);   // offline last-known-good

  // users_private нет → дефолты; клиент его НЕ создаёт
  const account = {
    ...base,
    ...(server || {}),
    uid,
    role: priv?.role ?? 'guest',
    tariff: priv?.tariff ?? null,
    xp: priv?.xp ?? 0,
    badges: priv?.badges ?? []
  };

  // Права по константе; чужой 'admin' из базы понижаем
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

/* ---------- Сохранение клиентских полей (только разрешённые правилами) ---------- */

async function saveAccountFields(fields) {
  const db = await getDb();
  const uid = getUid();

  // Правила v3.1: write ONLY name/bio/hasAvatar — остальное клиент больше не пишет
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

/* ---------- Аватар: avatars/{uid} ---------- */

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

/* ---------- Миграция localStorage → Firestore ---------- */

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
    if (needAvatar) await saveAvatarDataUrl(mapped.avatar);   // аватар первым
    if (needProfile) {                    // домиграция аватара не перетирает name/bio
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

/* ---------- Точка входа: вызывает js/app.js при старте ---------- */

async function initAccount() {
  // 1) Вход через охранника: initData → customToken → signInWithCustomToken
  let auth = { ok: false, reason: 'no attempt' };
  try {
    auth = await authViaWorker();
  } catch (e) {
    console.warn('[account] вход через охранника не удался:', e && e.message);
          showToast('Диагностика входа: ' + (e && e.message));
  }

  // 2) Загрузка профиля (чтение работает и без входа)
  const account = await loadAccount();

  // 3) Право писать: сеть есть И вход прошёл (fail-closed)
  account.writable = !account.offline && auth.ok;

  // 4) Локальная миграция — только если можно писать
  const migration = account.writable
    ? await migrateLocalToServer()
    : { deferred: true, reason: auth.ok ? 'offline' : 'read-only' };

  // 5) Гарантируем документ для новых пользователей (name/bio/hasAvatar — только разрешённые поля)
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

/* ---------- Экспорт ---------- */

window.PROAI = window.PROAI || {};
Object.assign(window.PROAI, {
  ADMIN_TELEGRAM_IDS,
  WORKER_URL,
  initAccount, loadAccount, saveAccountFields, getDb,
  saveAvatarDataUrl, getAvatarDataUrl, fileToAvatarDataUrl,
  isAdminUid, getUid, mapLegacyProfile,
  authViaWorker, workerApi
});