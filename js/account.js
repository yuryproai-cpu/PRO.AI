/* ============================================================
   PRO.AI · js/account.js  —  v0.2.4
   Платформенный аккаунт: профиль в Firestore, аватар в avatars/{uid},
   идемпотентная миграция localStorage → сервер, offline-кэш.
   Схема (принята): uid (идентичность) → loginType (способ входа) →
   name (отображаемое, 20) → bio (150). Служебного логина нет.
   Game Profile (Civ) не мигрирует и не удаляется (_platformMigrated).
   Зависимости (подключить ДО этого файла): firebase-*.js, js/firebase.js
   ============================================================ */

'use strict';

/* ---------- Константы ---------- */

const ADMIN_TELEGRAM_IDS = ['6476078926']; // права ТОЛЬКО здесь

const LS_KEYS = ['proai_account', 'civ_profile']; // legacy, приоритет слева
const LS_CACHE = 'proai_session_cache';           // offline last-known-good
const LS_UID_KEY = 'proai_browser_uid';

const AVATAR_MAX_PX = 256;
const AVATAR_JPEG_QUALITY = 0.85;
const AVATAR_MAX_INPUT_BYTES = 10 * 1024 * 1024; // 10 МБ

const NAME_MAX_LEN = 20;
const BIO_MAX_LEN = 150;

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
  if (firebase.auth && firebase.auth().currentUser) return 'google';
  return 'test';
}

function isAdminUid(uid) {   // права — только по константе
  return ADMIN_TELEGRAM_IDS.includes(String(uid));
}

/* ---------- Профиль: дефолты и загрузка ---------- */

function defaultProfile(uid) {
  return {
    uid,
    source: null,           // 'telegram' | 'browser'
    name: null,             // имя в лобби, лимит 20
    bio: null,              // лимит 150
    loginType: null,        // 'telegram' | 'google' | 'test'
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

  // users и users_private читаются независимо; при сбое — кэш
  try {
    const snap = await db.collection('users').doc(uid).get();
    if (snap.exists) server = snap.data();
    usersOk = true;
    try { localStorage.setItem(LS_CACHE, JSON.stringify(server || {})); } catch (e) {}
  } catch (e) {
    console.warn('[account] users недоступен, показываю локальную копию:', e && e.code);
    server = readLS(LS_CACHE);
  }
  try {
    const snap = await db.collection('users_private').doc(uid).get();
    if (snap.exists) priv = snap.data();
  } catch (e) {
    console.warn('[account] users_private недоступен:', e && e.code);
  }

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
  // 'developer' не трогаем — known issue открытых правил (закроется на этапе строгих правил)

  account.offline = !usersOk;
  return account;
}

/* ---------- Сохранение клиентских полей ---------- */
/* Только users/{uid}, только переданные поля. role/tariff/xp/badges — не трогает. */

async function saveAccountFields(fields) {
  const uid = getUid();

  const payload = { uid, updatedAt: nowServerTs() };
  if ('name' in fields)       payload.name       = clampString(fields.name, NAME_MAX_LEN);
  if ('bio' in fields)        payload.bio        = clampString(fields.bio, BIO_MAX_LEN);
  if ('loginType' in fields)  payload.loginType  = fields.loginType || null;
  if ('source' in fields)     payload.source     = fields.source || null;
  if ('hasAvatar' in fields)  payload.hasAvatar  = !!fields.hasAvatar;
  if ('migrated' in fields)   payload.migrated   = !!fields.migrated;

  await db.collection('users').doc(uid).set(payload, { merge: true });

  // Кэш — только в LS_CACHE, не в legacy proai_account; клиентское время
  try {
    const cache = { ...readLS(LS_CACHE), ...payload, updatedAt: Date.now() };
    localStorage.setItem(LS_CACHE, JSON.stringify(cache));
  } catch (e) {}
  return true;
}

/* ---------- Аватар: avatars/{uid} ---------- */

async function saveAvatarDataUrl(dataUrl) {
  const uid = getUid();
  await db.collection('avatars').doc(uid).set({
    data: dataUrl,
    updatedAt: nowServerTs()
  }, { merge: true });
  await saveAccountFields({ hasAvatar: true });   // флаг ставит только эта функция
  return true;
}

async function getAvatarDataUrl(uid) {
  try {
    const snap = await db.collection('avatars').doc(String(uid || getUid())).get();
    return snap.exists ? (snap.data().data || null) : null;
  } catch (e) {
    console.warn('[account] аватар не прочитан:', e && e.code);
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
      if (!img.width || !img.height) {          // битые/SVG без размеров → пустой canvas
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

/* proai_account удаляем целиком; civ_profile — помечаем, данные Цивы сохраняем */
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

  // Уже мигрировано — выходим сразу, Циву не трогаем
  const civEarly = readLS('civ_profile');
  if (civEarly && civEarly._platformMigrated && !readLS(LS_KEYS[0])) {
    return { skipped: true };
  }

  let local = readLS(LS_KEYS[0]) || readLS(LS_KEYS[1]);
  if (!local) return { skipped: true };

  const mapped = mapLegacyProfile(local);
  if (!mapped.name && !mapped.bio && !mapped.avatar) {
    markPlatformMigrated();   // платформенной части нет, Циву не трогаем
    return { skipped: true };
  }

  let serverSnap;
  try { serverSnap = await db.collection('users').doc(uid).get(); }
  catch (e) { return { deferred: true, reason: 'network' }; }

  const server = serverSnap.exists ? serverSnap.data() : null;
  const needProfile = !server || server.migrated !== true;
  const needAvatar  = !!mapped.avatar && (!server || !server.hasAvatar);

  if (!needProfile && !needAvatar) { markPlatformMigrated(); return { done: true, alreadyMigrated: true }; }

  try {
    if (needAvatar) await saveAvatarDataUrl(mapped.avatar);   // аватар первым
    if (needProfile) {                    // домиграция аватара не перетирает name/bio
      await saveAccountFields({
        name: mapped.name,
        bio: mapped.bio,
        loginType: local.loginType || getLoginTypeHint(),
        source: getSourceHint(),
        migrated: true
      });
    }
  } catch (e) {
    console.warn('[account] миграция прервана, повторим на следующем запуске:', e);
    return { deferred: true, reason: 'write' };
  }

  try {
    await db.collection('users').doc(uid).collection('migration_log').doc('v0_2_4').set({
      from: LS_KEYS.find(k => !!readLS(k)) || 'localStorage',
      hadLocalAdminRole: local.role === 'admin' && !isAdminUid(uid),
      at: nowServerTs()
    }, { merge: true });
  } catch (e) { /* журнал не критичен */ }

  markPlatformMigrated();
  return { done: true, migratedAvatar: needAvatar, migratedProfile: needProfile };
}

/* ---------- Точка входа: вызывает js/app.js при старте ---------- */

async function initAccount() {
  const account = await loadAccount();
  const migration = account.offline
    ? { deferred: true, reason: 'offline' }
    : await migrateLocalToServer();

  // Гарантируем документ для новых пользователей (get + set — createdAt не трогаем)
  let createdNew = false;
  if (!account.offline && !migration.deferred) {
    try {
      const ref = db.collection('users').doc(account.uid);
      const snap = await ref.get();
      if (!snap.exists) {
        await ref.set({
          uid: account.uid,
          source: account.source,
          loginType: account.loginType,
          migrated: false,
          createdAt: nowServerTs(),
          updatedAt: nowServerTs()
        }, { merge: true });
        createdNew = true;
      }
    } catch (e) {
      console.warn('[account] не удалось создать профиль:', e && e.code);
    }
  }

  const needsReread = (!!migration.done && !migration.alreadyMigrated) || createdNew;
  return { account: needsReread ? await loadAccount() : account, migration };
}

/* ---------- Экспорт ---------- */

window.PROAI = window.PROAI || {};
Object.assign(window.PROAI, {
  ADMIN_TELEGRAM_IDS,
  initAccount, loadAccount, saveAccountFields,
  saveAvatarDataUrl, getAvatarDataUrl, fileToAvatarDataUrl,
  isAdminUid, getUid, mapLegacyProfile
});