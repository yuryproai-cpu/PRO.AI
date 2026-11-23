'use strict';

// app.js v1.3 — движок PRO.AI (профиль + друзья, без плиток-заглушек)
// Ты — admin (решает охранник), все остальные — user.
// Роли moderator/developer выдаются кнопкой из админ-меню.

window.PROAI = window.PROAI || {};
window.PROAI.adminContext = null;

function getSessionAccount() {
  return window.PROAI.session?.account || null;
}

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

function levelInfo(account) {
  const likes = account.likesCount || 0;
  return { level: 1 + Math.floor(likes / 10) };
}

function renderMenu() {
  const drawer = document.getElementById('menu-drawer');
  if (!drawer) return;
  const account = getSessionAccount();
  if (!account) return;

  drawer.innerHTML = '';
  const title = document.createElement('div');
  title.className = 'drawer-title';
  title.textContent = 'Меню';
  drawer.appendChild(title);

  const addItem = (label, fn) => {
    const b = document.createElement('button');
    b.className = 'menu-item';
    b.textContent = label;
    b.addEventListener('click', () => { closeMenu(); fn(); });
    drawer.appendChild(b);
  };

  addItem('🏠 Мой кабинет', () => showScreen('screen-cabinet'));
  addItem('⚙️ Управление аккаунтом', () => { renderManage(account); showScreen('screen-manage'); });
  addItem('👥 Все кабинеты', () => openUsersScreen());

  if (account.isAdmin) {
    const div = document.createElement('div');
    div.className = 'menu-divider';
    div.textContent = 'Админ';
    drawer.appendChild(div);

    const ctx = window.PROAI.adminContext;
    if (ctx && ctx.uid !== account.uid) {
      const cd = document.createElement('div');
      cd.className = 'menu-divider';
      cd.textContent = 'Управление: ' + (ctx.name || ctx.uid);
      drawer.appendChild(cd);
      addItem('🎖 Выдать роль', () => grantRole(ctx.uid));
      addItem('🗑 Удалить аккаунт', () => deleteUser(ctx.uid, ctx.name));
    }
  }
}

function openMenu() { renderMenu(); menuVisible(true); }
function closeMenu() { menuVisible(false); }
function menuVisible(v) {
  document.getElementById('menu-overlay').hidden = !v;
  document.getElementById('menu-drawer').hidden = !v;
}

const AVATAR_PLACEHOLDER = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
  '<circle cx="50" cy="50" r="48" fill="#e0e0e0"/>' +
  '<circle cx="50" cy="40" r="18" fill="#a0a0a0"/>' +
  '<ellipse cx="50" cy="85" rx="30" ry="22" fill="#a0a0a0"/></svg>');

function displayNameOf(account) {
  return account.name || 'Игрок';
}

function renderCabinet(account) {
  const sc = document.getElementById('screen-cabinet');
  if (!sc) return;

  const av = sc.querySelector('#cabinet-avatar');
  if (av) {
    av.src = account._avatarUrl || AVATAR_PLACEHOLDER;
    if (account.hasAvatar && !account._avatarUrl) {
      getAvatarDataUrl(account.uid).then(url => {
        if (url) { account._avatarUrl = url; av.src = url; }
      });
    }
  }

  const nameEl = sc.querySelector('#cabinet-name');
  if (nameEl) nameEl.textContent = displayNameOf(account);

  const badge = sc.querySelector('#cabinet-role-badge');
  if (badge) {
    if (account.isAdmin) {
      badge.textContent = '👑 Админ';
      badge.className = 'badge badge-admin';
      badge.hidden = false;
    } else if (account.role && account.role !== 'user') {
      badge.textContent = account.role;
      badge.className = 'badge';
      badge.hidden = false;
    } else badge.hidden = true;
  }

  const bioEl = sc.querySelector('#cabinet-bio');
  if (bioEl) bioEl.textContent = account.bio || '';

  const li = levelInfo(account);
  const lv = sc.querySelector('#cabinet-level');
  if (lv) lv.textContent = 'Уровень ' + li.level;

  setCounts(account);
  renderFriends(account);
}

function setCounts(account) {
  const fw = document.querySelector('#cnt-following');
  if (fw) fw.textContent = String(account.followingCount || 0);
  const fr = document.querySelector('#cnt-followers');
  if (fr) fr.textContent = String(account.followersCount || 0);
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
  } catch (e) { alert('Не удалось сохранить имя: ' + e.message); }
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
  } catch (e) { alert('Не удалось сохранить описание: ' + e.message); }
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
  } catch (e) { alert('Не удалось загрузить аватар: ' + e.message); }
}

async function renderFriends(account) {
  const box = document.getElementById('friends-list');
  if (!box) return;
  box.innerHTML = '<p class="muted">Загрузка…</p>';
  try {
    const db = await getDb();
    const snap = await db.collection('follows').where('fromUid', '==', account.uid).limit(12).get();
    box.innerHTML = '';
    if (snap.empty) {
      box.innerHTML = '<p class="muted">Пока никого. Открой чужой кабинет и добавь человека ✚</p>';
      return;
    }
    for (const doc of snap.docs) {
      const f = doc.data();
      let name = '(без имени)', liked = false;
      try {
        const u = await db.collection('users').doc(f.toUid).get();
        if (u.exists) name = u.data().name || name;
        const back = await db.collection('follows').doc(f.toUid + '__' + account.uid).get();
        liked = back.exists;
      } catch (e) {}
      const row = document.createElement('div');
      row.className = 'friend-row';
      row.innerHTML = '<span class="friend-dot"></span><span class="friend-name"></span>' +
                      (liked ? '<span class="badge badge-admin">друг</span>'
                             : '<span class="badge">подписка</span>');
      row.querySelector('.friend-name').textContent = name;
      row.addEventListener('click', () => openUserDetail(f.toUid));
      box.appendChild(row);
    }
  } catch (e) {
    box.innerHTML = '<p class="muted">Список недоступен: ' + escapeHtml(e && e.message) + '</p>';
  }
}

async function likeUser(targetUid, btn) {
  const me = getSessionAccount();
  if (!me) return;
  if (targetUid === me.uid) { showToast('Себе лайк не поставить 🙂'); return; }
  if (me.writable === false) { showToast('Открой PRO.AI через Telegram 🙂'); return; }
  try {
    const db = await getDb();
    const already = await db.collection('likes').doc(targetUid + '__' + me.uid).get();
    if (already.exists) {
      await workerApi('/api/unlike', { targetUid: targetUid });
      me.likesCount = Math.max(0, (me.likesCount || 0) - 1);
      showToast('Лайк снят');
      if (btn) btn.textContent = '❤️ Лайк';
    } else {
      await workerApi('/api/like', { targetUid: targetUid });
      me.likesCount = (me.likesCount || 0) + 1;
      showToast('Лайк доставлен ❤️');
      if (btn) btn.textContent = '💔 Снять лайк';
    }
    if (btn) btn.disabled = false;
    renderCabinet(me);
  } catch (e) { alert('Не получилось: ' + e.message); }
}

async function toggleFollow(targetUid, btn) {
  const me = getSessionAccount();
  if (!me) return;
  if (targetUid === me.uid) return;
  if (me.writable === false) { showToast('Открой PRO.AI через Telegram 🙂'); return; }
  try {
    const db = await getDb();
    const ref = db.collection('follows').doc(me.uid + '__' + targetUid);
    const doc = await ref.get();
    if (doc.exists) {
      await workerApi('/api/unfollow', { targetUid: targetUid });
      me.followingCount = Math.max(0, (me.followingCount || 0) - 1);
      showToast('Подписка отменена');
      if (btn) btn.textContent = '✚ Добавить в друзья';
    } else {
      await workerApi('/api/follow', { targetUid: targetUid });
      me.followingCount = (me.followingCount || 0) + 1;
      showToast('Добавлено в друзья ✚');
      if (btn) btn.textContent = '✓ Вы подписаны';
    }
    renderCabinet(me);
  } catch (e) { alert('Не получилось: ' + e.message); }
}

function renderManage(account) {
  const body = document.getElementById('manage-body');
  if (!body) return;
  body.innerHTML = '';

  const h = document.createElement('h1');
  h.textContent = 'Управление аккаунтом';
  body.appendChild(h);

  const st = document.createElement('div');
  st.className = 'glass';
  st.style.padding = '14px';
  st.innerHTML = '<div class="card-title">Личная статистика</div>';
  const addRow = (k, v) => {
    const r = document.createElement('div');
    r.className = 'diag-row';
    r.innerHTML = '<span></span><b></b>';
    r.querySelector('span').textContent = k;
    r.querySelector('b').textContent = v;
    st.appendChild(r);
  };
  addRow('Твой ID', account.uid || '—');
  addRow('Роль', account.isAdmin ? 'admin' : (account.role || 'user'));
  addRow('Способ входа', account.loginType || '—');
  const reg = fmtDate(account.createdAt); if (reg) addRow('В PRO.AI с', reg);
  addRow('Лайков получено', String(account.likesCount || 0));
  addRow('Подписки', String(account.followingCount || 0));
  addRow('Подписчики', String(account.followersCount || 0));
  addRow('Сервер', account.offline ? 'нет связи' : 'подключен');
  addRow('Запись', account.writable === false ? 'только чтение' : 'открыта');
  addRow('Версия', 'v1.3');
  body.appendChild(st);
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.hidden = s.id !== id);
  if (id === 'screen-cabinet') window.PROAI.adminContext = null;
  window.scrollTo(0, 0);
}

function skeleton(box, text) {
  box.innerHTML = '';
  const p = document.createElement('p');
  p.className = 'muted';
  p.textContent = text;
  box.appendChild(p);
}

function openUsersScreen() {
  showScreen('screen-users');
  const detail = document.getElementById('users-detail');
  const list = document.getElementById('users-list');
  if (detail) { detail.hidden = true; detail.innerHTML = ''; }
  skeleton(list, 'Загружаю пользователей…');
  loadUsersList();
}

async function loadUsersList() {
  const list = document.getElementById('users-list');
  if (!list) return;
  try {
    const db = await getDb();
    const snap = await db.collection('users').get();
    list.innerHTML = '';
    if (snap.empty) { skeleton(list, 'Пользователей пока нет'); return; }
    snap.forEach(doc => {
      const u = doc.data() || {};
      const row = document.createElement('div');
      row.className = 'glass user-item';
      row.innerHTML = '<div class="card-title"></div><div class="card-sub"></div><div class="badge"></div>';
      row.querySelector('.card-title').textContent = u.name || '(без имени)';
      row.querySelector('.card-sub').textContent = doc.id;
      row.querySelector('.badge').textContent =
        '❤️ ' + (u.likesCount || 0) + ' · уровень ' + (1 + Math.floor((u.likesCount || 0) / 10)) +
        ' · подписчики ' + (u.followersCount || 0);
      row.addEventListener('click', () => openUserDetail(doc.id));
      list.appendChild(row);
    });
  } catch (e) { skeleton(list, 'Не удалось загрузить: ' + (e && e.message)); }
}

async function openUserDetail(uid) {
  const detail = document.getElementById('users-detail');
  const list = document.getElementById('users-list');
  if (!detail) return;

  detail.hidden = false;
  detail.innerHTML = '';
  if (list) list.hidden = true;

  const me = getSessionAccount();
  try {
    const db = await getDb();
    const [uSnap, avSnap, likeSnap, followSnap] = await Promise.all([
      db.collection('users').doc(uid).get(),
      db.collection('avatars').doc(uid).get(),
      db.collection('likes').doc(uid + '__' + me.uid).get(),
      db.collection('follows').doc(me.uid + '__' + uid).get()
    ]);
    const u = uSnap.exists ? uSnap.data() : {};

    const card = document.createElement('div');
    card.className = 'glass';
    card.style.padding = '14px';

    const av = document.createElement('img');
    av.className = 'detail-avatar';
    av.src = (avSnap.exists && avSnap.data().data) || AVATAR_PLACEHOLDER;
    card.appendChild(av);

    const name = document.createElement('div');
    name.className = 'card-title';
    name.textContent = u.name || '(без имени)';
    card.appendChild(name);

    const sub = document.createElement('div');
    sub.className = 'card-sub';
    sub.textContent = uid;
    card.appendChild(sub);

    const info = document.createElement('div');
    info.className = 'card-sub';
    const reg = fmtDate(u.createdAt);
    info.textContent = '❤️ ' + (u.likesCount || 0) +
      ' · подписчики ' + (u.followersCount || 0) +
      ' · подписки ' + (u.followingCount || 0) +
      (reg ? ' · с ' + reg : '');
    card.appendChild(info);

    if (uid !== me.uid) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:10px;margin-top:10px';

      const likeBtn = document.createElement('button');
      likeBtn.className = 'btn btn-secondary';
      likeBtn.textContent = likeSnap.exists ? '💔 Снять лайк' : '❤️ Лайк';
      likeBtn.addEventListener('click', () => likeUser(uid, likeBtn));
      row.appendChild(likeBtn);

      const folBtn = document.createElement('button');
      folBtn.className = 'btn btn-secondary';
      folBtn.textContent = followSnap.exists ? '✓ Вы подписаны' : '✚ Добавить в друзья';
      folBtn.addEventListener('click', () => toggleFollow(uid, folBtn));
      row.appendChild(folBtn);

      card.appendChild(row);
    }

    detail.appendChild(card);
    list.hidden = false;

    window.PROAI.adminContext = { uid, name: u.name || null };

  } catch (e) {
    skeleton(detail, 'Не удалось открыть кабинет: ' + (e && e.message));
  }
}

async function grantRole(uid) {
  const input = prompt('Роль (developer / moderator):', 'developer');
  if (input === null) return;
  const role = input.trim().toLowerCase();
  if (!['developer', 'moderator'].includes(role)) { alert('Такой роли нет'); return; }
  try {
    await workerApi('/api/admin/set-role', { targetUid: uid, role: role });
    showToast('Роль выдана: ' + role);
  } catch (e) { alert('Не получилось: ' + e.message); }
}

async function deleteUser(uid, name) {
  const me = getSessionAccount();
  if (uid === me.uid) { alert('Свой аккаунт так удалить нельзя 🙂'); return; }
  if (!confirm('Удалить аккаунт ' + (name || uid) + '? Пользователь потеряет вход.')) return;
  try {
    await workerApi('/api/admin/delete-user', { targetUid: uid });
    showToast('Аккаунт удалён');
    window.PROAI.adminContext = null;
    openUsersScreen();
  } catch (e) { alert('Не получилось: ' + e.message); }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('menu-btn')?.addEventListener('click', openMenu);
  document.getElementById('menu-overlay')?.addEventListener('click', closeMenu);

  document.getElementById('btn-edit-name')?.addEventListener('click', onEditName);
  document.getElementById('btn-edit-bio')?.addEventListener('click', onEditBio);
  document.querySelector('.avatar-input')?.addEventListener('change', e => {
    if (e.target.files?.[0]) onChangeAvatar(e.target.files[0]);
  });
  document.getElementById('manage-back')?.addEventListener('click', () => showScreen('screen-cabinet'));
  document.getElementById('users-back')?.addEventListener('click', () => showScreen('screen-cabinet'));
});

function offlineSession(reason) {
  return {
    account: { offline: true, isAdmin: false, role: 'user', name: null, uid: null, writable: false },
    reason
  };
}

document.addEventListener('DOMContentLoaded', async () => {
  if (window.Telegram && Telegram.WebApp) {
    try { Telegram.WebApp.ready(); Telegram.WebApp.expand(); } catch (e) {}
  }

  const sessionPromise = (async () => {
    try { return await initAccount(); }
    catch (e) {
      console.warn('[app] старт в оффлайне:', e);
      return offlineSession('crash');
    }
  })();

  let account = await Promise.race([
    sessionPromise,
    new Promise(r => setTimeout(() => r(null), 3000))
  ]);

  if (!account) {
    account = offlineSession('timeout');
    showToast('Медленное соединение — загрузка профиля продолжается');
    sessionPromise.then(a => {
      if (!a) return;
      window.PROAI.session = window.PROAI.session || {};
      window.PROAI.session.account = a;
      renderCabinet(a);
    });
  } else {
    window.PROAI.session = window.PROAI.session || {};
    window.PROAI.session.account = account;
  }

  renderCabinet(account);

  if (account.isAdmin) console.info('[app] админ-режим: роль с охранника');
  if (account.offline) showToast('Нет сети — показана сохранённая копия профиля');
});