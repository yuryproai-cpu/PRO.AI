/* ============================================================
   PRO.AI · js/app.js — v0.2.4
   Инициализация, сплэш, лобби, нижняя навигация.
   Доступ к сессии — ТОЛЬКО через accessors ниже.
   ============================================================ */

'use strict';

window.PROAI = window.PROAI || {};

/* ---------- Сессия: единая точка доступа ---------- */

function getSessionAccount() {
  return window.PROAI.session?.account || null;
}

function setSessionAccount(account) {
  window.PROAI.session = window.PROAI.session || {};
  window.PROAI.session.account = account;
}

function setSessionMigration(migration) {
  window.PROAI.session = window.PROAI.session || {};
  window.PROAI.session.migration = migration;
}

/* ---------- Тост ---------- */

function showToast(text, ms = 3000) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = text;
  t.hidden = false;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.hidden = true; }, ms);
}

/* ---------- Сплэш: 4.5 c или тап; runSplash (logo.js) — опционален ---------- */

async function splashWait() {
  const splash = document.getElementById('splash');
  if (!splash) return;
  let done = false, timer = null;
  const finish = () => {
    if (done) return;
    done = true;
    if (timer) clearTimeout(timer);
    splash.hidden = true;
  };
  timer = setTimeout(finish, 4500);
  splash.addEventListener('click', finish, { once: true });
  if (typeof window.runSplash === 'function') {
    try { await window.runSplash(); } catch (e) { /* таймер добьёт */ }
  }
  finish();
}

/* ---------- Лобби ---------- */

const AVATAR_PLACEHOLDER = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
  '<circle cx="50" cy="50" r="48" fill="#e0e0e0"/>' +
  '<circle cx="50" cy="40" r="18" fill="#a0a0a0"/>' +
  '<ellipse cx="50" cy="85" rx="30" ry="22" fill="#a0a0a0"/>' +
  '</svg>'
);

function displayNameOf(account) {
  return account.name || 'Игрок';
}

function renderLobby(account) {
  const lobby = document.getElementById('screen-lobby');
  if (!lobby) return;

  const nameEl = lobby.querySelector('.profile-name');
  const bioEl = lobby.querySelector('.profile-bio');
  const avatarEl = lobby.querySelector('.profile-avatar img');
  const editNameBtn = lobby.querySelector('.profile-name-edit');

  if (nameEl) nameEl.textContent = displayNameOf(account);
  if (bioEl) bioEl.textContent = account.bio || '';
  if (editNameBtn) editNameBtn.hidden = !!account.name;

  if (avatarEl) {
    avatarEl.src = AVATAR_PLACEHOLDER;
    if (account.hasAvatar) {
      if (account._avatarUrl) {
        avatarEl.src = account._avatarUrl;              // кэш сессии
      } else {
        getAvatarDataUrl(account.uid).then(url => {
          if (url) { account._avatarUrl = url; avatarEl.src = url; }
        });
      }
    }
  }
}

async function onEditName() {
  const account = getSessionAccount();
  if (!account) { console.warn('[app] сессия не готова, правка имени отложена'); return; }
  const input = prompt('Имя в лобби (до 20 символов):', account.name || '');
  if (input === null) return;
  try {
    await saveAccountFields({ name: input });
    account.name = input.trim().slice(0, 20) || null;
    renderLobby(account);
  } catch (e) {
    alert('Не удалось сохранить имя: ' + e.message);
  }
}

async function onChangeAvatar(file) {
  const account = getSessionAccount();
  if (!account) { console.warn('[app] сессия не готова'); return; }
  try {
    const dataUrl = await fileToAvatarDataUrl(file);
    await saveAvatarDataUrl(dataUrl);
    account.hasAvatar = true;
    account._avatarUrl = dataUrl;
    renderLobby(account);
  } catch (e) {
    alert('Не удалось загрузить аватар: ' + e.message);
  }
}

/* ---------- Нижняя навигация ---------- */

const NAV_TABS = [
  { id: 'lobby',    label: 'Лобби',    render: renderLobby },
  { id: 'games',    label: 'Игры',     render: null },  // games-catalog.js — следующий модуль
  { id: 'learn',    label: 'Обучение', render: null },  // learn.js
  { id: 'chat',     label: 'Чат',      render: null },  // chat.js
  { id: 'settings', label: 'Ещё',      render: null }
];

function renderTabbar() {
  const bar = document.getElementById('tabbar');
  if (!bar || bar.childElementCount) return;
  NAV_TABS.forEach(tab => {
    const btn = document.createElement('button');
    btn.className = 'tabbar-item';
    btn.dataset.tab = tab.id;
    btn.textContent = tab.label;
    btn.addEventListener('click', () => switchTab(tab.id));
    bar.appendChild(btn);
  });
}

function switchTab(id) {
  document.querySelectorAll('.screen').forEach(s => s.hidden = s.id !== 'screen-' + id);
  document.querySelectorAll('.tabbar-item').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === id));
  const tab = NAV_TABS.find(t => t.id === id);
  const account = getSessionAccount();
  if (tab?.render && account) tab.render(account);
}

/* ---------- Привязка событий ---------- */

document.addEventListener('DOMContentLoaded', () => {
  document.querySelector('.profile-name-edit')?.addEventListener('click', onEditName);
  document.querySelector('.profile-name')?.addEventListener('click', onEditName);
  document.querySelector('.avatar-input')?.addEventListener('change', e => {
    if (e.target.files?.[0]) onChangeAvatar(e.target.files[0]);
  });
});

/* ---------- Старт ---------- */

document.addEventListener('DOMContentLoaded', async () => {
  if (window.initSplash) initSplash();

  let session;
  try {
    session = await initAccount();
  } catch (e) {
    console.warn('[app] initAccount упал, стартуем в оффлайне:', e);
    session = {
      account: { offline: true, isAdmin: false, role: 'guest', name: null, uid: null },
      migration: { deferred: true, reason: 'crash' }
    };
  }
  setSessionAccount(session.account);
  setSessionMigration(session.migration);

  await splashWait();

  renderTabbar();
  switchTab('lobby');

  if (session.account.offline) showToast('Нет сети — показана сохранённая копия профиля');
  if (session.account.isAdmin) console.info('[app] админ-режим: владелец по ADMIN_TELEGRAM_IDS');
  if (session.migration?.deferred) console.info('[app] миграция отложена:', session.migration.reason);
});