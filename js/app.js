/* ============================================================
   PRO.AI · js/app.js — v0.3.0
   Новая навигация: без нижней панели; кнопка-спойлер слева вверху
   открывает пустое меню-ящик (разделы добавит владелец).
   Главный экран — «Кабинет»: свой профиль + у админа раздел
   «Все кабинеты пользователей» (список users из Firestore).
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

/* ---------- Утилиты ---------- */

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fmtDate(ts) {
  try {
    const opts = { day: 'numeric', month: 'long', year: 'numeric' };
    if (ts && typeof ts.toDate === 'function') return ts.toDate().toLocaleDateString('ru-RU', opts);
    if (typeof ts === 'number') return new Date(ts).toLocaleDateString('ru-RU', opts);
  } catch (e) {}
  return null;
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

/* ---------- Сплэш: 4.5 c или тап ---------- */

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

/* ---------- Меню-спойлер ---------- */

function openMenu() {
  document.getElementById('menu-overlay').hidden = false;
  document.getElementById('menu-drawer').hidden = false;
}

function closeMenu() {
  document.getElementById('menu-overlay').hidden = true;
  document.getElementById('menu-drawer').hidden = true;
}

/* ---------- Кабинет ---------- */

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

function infoRow(label, value) {
  const row = document.createElement('div');
  row.className = 'diag-row';
  const l = document.createElement('span');
  l.textContent = label;
  const v = document.createElement('b');
  v.textContent = value;
  row.appendChild(l);
  row.appendChild(v);
  return row;
}

function renderCabinet(account) {
  const screen = document.getElementById('screen-cabinet');
  if (!screen) return;

  const nameEl = screen.querySelector('.profile-name');
  const bioEl = screen.querySelector('.profile-bio');
  const avatarEl = screen.querySelector('.profile-avatar img');
  const editNameBtn = screen.querySelector('.profile-name-edit');
  const editBioBtn = screen.querySelector('.profile-bio-edit');
  const badgeEl = screen.querySelector('.profile-role-badge');

  if (nameEl) nameEl.textContent = displayNameOf(account);
  if (bioEl) bioEl.textContent = account.bio || '';

  if (editNameBtn) editNameBtn.hidden = !!account.name;
  if (editBioBtn) editBioBtn.textContent = account.bio ? '✎ Изменить описание' : '✎ Добавить описание';

  if (badgeEl) {
    if (account.isAdmin) {
      badgeEl.textContent = 'Админ';
      badgeEl.className = 'profile-role-badge badge badge-admin';
      badgeEl.hidden = false;
    } else if (account.role && account.role !== 'guest') {
      badgeEl.textContent = account.role;
      badgeEl.className = 'profile-role-badge badge';
      badgeEl.hidden = false;
    } else {
      badgeEl.hidden = true;
    }
  }

  if (avatarEl) {
    avatarEl.src = account._avatarUrl || AVATAR_PLACEHOLDER;
    if (account.hasAvatar && !account._avatarUrl) {
      getAvatarDataUrl(account.uid).then(url => {
        if (url) { account._avatarUrl = url; avatarEl.src = url; }
      });
    }
  }

  // Информационный блок
  const info = screen.querySelector('.cabinet-info');
  if (info) {
    info.innerHTML = '';
    const t = document.createElement('div');
    t.className = 'card-title';
    t.textContent = 'Профиль';
    info.appendChild(t);

    const reg = fmtDate(account.createdAt);
    if (reg) info.appendChild(infoRow('В PRO.AI с', reg));
    if (account.loginType) info.appendChild(infoRow('Способ входа', account.loginType));
    if (account.tariff) info.appendChild(infoRow('Тариф', account.tariff));
    if (account.xp) info.appendChild(infoRow('Опыт (XP)', String(account.xp)));
    if (Array.isArray(account.badges) && account.badges.length) {
      info.appendChild(infoRow('Награды', String(account.badges.length)));
    }
    if (!info.childElementCount) {
      const p = document.createElement('p');
      p.className = 'muted';
      p.textContent = 'Здесь появится информация о тебе';
      info.appendChild(p);
    }
  }

  // Админ-блок: диагностика + все кабинеты
  const admin = screen.querySelector('.admin-block');
  if (admin) {
    admin.innerHTML = '';
    if (account.isAdmin) {
      admin.hidden = false;
      const t = document.createElement('div');
      t.className = 'card-title';
      t.textContent = 'Админ';
      admin.appendChild(t);

      admin.appendChild(infoRow('Твой ID (uid)', account.uid || '—'));
      admin.appendChild(infoRow('Сервер', account.offline ? 'нет связи' : 'подключен'));

      const btn = document.createElement('button');
      btn.className = 'btn btn-secondary';
      btn.style.marginTop = '10px';
      btn.textContent = 'Все кабинеты пользователей';
      btn.addEventListener('click', () => openUsersScreen());
      admin.appendChild(btn);
    } else {
      admin.hidden = true;
    }
  }
}

async function onEditName() {
  const account = getSessionAccount();
  if (!account) return;
  const input = prompt('Имя (до 20 символов):', account.name || '');
  if (input === null) return;
  try {
    await saveAccountFields({ name: input });
    account.name = input.trim().slice(0, 20) || null;
    renderCabinet(account);
  } catch (e) {
    alert('Не удалось сохранить имя: ' + e.message);
  }
}

async function onEditBio() {
  const account = getSessionAccount();
  if (!account) return;
  const input = prompt('Описание (до 150 символов):', account.bio || '');
  if (input === null) return;
  try {
    await saveAccountFields({ bio: input });
    account.bio = input.trim().slice(0, 150) || null;
    renderCabinet(account);
  } catch (e) {
    alert('Не удалось сохранить описание: ' + e.message);
  }
}

async function onChangeAvatar(file) {
  const account = getSessionAccount();
  if (!account) return;
  try {
    const dataUrl = await fileToAvatarDataUrl(file);
    await saveAvatarDataUrl(dataUrl);
    account.hasAvatar = true;
    account._avatarUrl = dataUrl;
    renderCabinet(account);
  } catch (e) {
    alert('Не удалось загрузить аватар: ' + e.message);
  }
}

/* ---------- Все кабинеты пользователей (админ) ---------- */

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.hidden = s.id !== id);
  window.scrollTo(0, 0);
}

function openUsersScreen() {
  showScreen('screen-users');
  const detail = document.getElementById('users-detail');
  const list = document.getElementById('users-list');
  if (detail) { detail.hidden = true; detail.innerHTML = ''; }
  if (list) { list.innerHTML = ''; list.appendChild(userRowSkeleton('Загружаю пользователей…')); }
  loadUsersList();
}

function userRowSkeleton(text) {
  const p = document.createElement('p');
  p.className = 'muted';
  p.textContent = text;
  return p;
}

async function loadUsersList() {
  const list = document.getElementById('users-list');
  if (!list) return;
  try {
    const db = await getDb();
    const snap = await db.collection('users').get();
    list.innerHTML = '';
    if (snap.empty) {
      list.appendChild(userRowSkeleton('Пользователей пока нет'));
      return;
    }
    snap.forEach(doc => {
      const u = doc.data() || {};
      const row = document.createElement('div');
      row.className = 'card user-item';
      row.style.cursor = 'pointer';

      const name = document.createElement('div');
      name.className = 'card-title';
      name.textContent = u.name || '(без имени)';
      row.appendChild(name);

      const sub = document.createElement('div');
      sub.className = 'card-sub';
      sub.textContent = u.uid || doc.id;
      row.appendChild(sub);

      row.addEventListener('click', () => openUserDetail(doc.id, u.name || null));
      list.appendChild(row);
    });
  } catch (e) {
    list.innerHTML = '';
    list.appendChild(userRowSkeleton('Не удалось загрузить список: ' + (e && e.message)));
  }
}

async function openUserDetail(uid, nameHint) {
  const detail = document.getElementById('users-detail');
  const list = document.getElementById('users-list');
  if (!detail) return;

  detail.hidden = false;
  detail.innerHTML = '';
  list.hidden = true;

  const card = document.createElement('div');
  card.className = 'card';
  card.style.display = 'block';

  const back = document.createElement('button');
  back.className = 'btn btn-secondary';
  back.style.marginBottom = '12px';
  back.textContent = '← К списку';
  back.addEventListener('click', () => {
    detail.hidden = true;
    detail.innerHTML = '';
    list.hidden = false;
  });
  detail.appendChild(back);

  const t = document.createElement('div');
  t.className = 'card-title';
  t.textContent = 'Кабинет пользователя';
  card.appendChild(t);

  const avatar = document.createElement('img');
  avatar.src = AVATAR_PLACEHOLDER;
  avatar.style.cssText = 'width:64px;height:64px;border-radius:50%;object-fit:cover;margin-bottom:8px';
  card.appendChild(avatar);

  card.appendChild(infoRow('Имя', nameHint || '(без имени)'));
  card.appendChild(infoRow('ID (uid)', uid));
  card.appendChild(infoRow('Роль', '…'));
  card.appendChild(infoRow('Тариф', '…'));

  detail.appendChild(card);

  try {
    const db = await getDb();
    const [privSnap, avSnap] = await Promise.all([
      db.collection('users_private').doc(uid).get(),
      db.collection('avatars').doc(uid).get()
    ]);
    const priv = privSnap.exists ? privSnap.data() : {};
    card.querySelectorAll('.diag-row b')[2].textContent = priv.role || 'guest';
    card.querySelectorAll('.diag-row b')[3].textContent = priv.tariff || '—';
    if (avSnap.exists && avSnap.data().data) avatar.src = avSnap.data().data;
  } catch (e) {
    console.warn('[app] детали пользователя недоступны:', e && e.message);
  }
}

/* ---------- Привязка событий ---------- */

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('menu-btn')?.addEventListener('click', openMenu);
  document.getElementById('menu-overlay')?.addEventListener('click', closeMenu);

  document.querySelector('.profile-name-edit')?.addEventListener('click', onEditName);
  document.querySelector('.profile-name')?.addEventListener('click', onEditName);
  document.querySelector('.profile-bio-edit')?.addEventListener('click', onEditBio);
  document.querySelector('.avatar-input')?.addEventListener('change', e => {
    if (e.target.files?.[0]) onChangeAvatar(e.target.files[0]);
  });
  document.getElementById('users-back')?.addEventListener('click', () => showScreen('screen-cabinet'));
});

/* ---------- Старт ---------- */

function offlineSession(reason) {
  return {
    account: { offline: true, isAdmin: false, role: 'guest', name: null, uid: null },
    migration: { deferred: true, reason }
  };
}

document.addEventListener('DOMContentLoaded', async () => {
  if (window.Telegram && Telegram.WebApp) {
    try { Telegram.WebApp.ready(); Telegram.WebApp.expand(); } catch (e) {}
  }

  if (window.initSplash) initSplash();

  const sessionPromise = (async () => {
    try { return await initAccount(); }
    catch (e) {
      console.warn('[app] initAccount упал, стартуем в оффлайне:', e);
      return offlineSession('crash');
    }
  })();

  await splashWait();

  let session = await Promise.race([
    sessionPromise,
    new Promise(r => setTimeout(() => r(null), 3000))
  ]);

  if (!session) {
    session = offlineSession('timeout');
    showToast('Медленное соединение — загрузка профиля продолжается');
    sessionPromise.then(s => {
      if (!s) return;
      setSessionAccount(s.account);
      setSessionMigration(s.migration);
      renderCabinet(s.account);
      if (s.account.offline) showToast('Нет сети — показана сохранённая копия профиля');
    });
  } else {
    setSessionAccount(session.account);
    setSessionMigration(session.migration);
  }

  renderCabinet(session.account);

  if (session.account.offline) showToast('Нет сети — показана сохранённая копия профиля');
  if (session.account.isAdmin) console.info('[app] админ-режим: владелец по ADMIN_TELEGRAM_IDS');
  if (session.migration?.deferred) console.info('[app] миграция отложена:', session.migration.reason);
});