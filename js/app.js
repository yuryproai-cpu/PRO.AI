'use strict';

window.PROAI = window.PROAI || {};
window.PROAI.adminContext = null;

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
  return { level: 1 + Math.floor(likes / 10), progress: (likes % 10) / 10 };
}

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
    try { await window.runSplash(); } catch (e) {}
  }
  finish();
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

  if (account.isAdmin) {
    const div = document.createElement('div');
    div.className = 'menu-divider';
    div.textContent = 'Админ';
    drawer.appendChild(div);
    addItem('👥 Все кабинеты', () => openUsersScreen());

    const ctx = window.PROAI.adminContext;
    if (ctx && ctx.uid !== account.uid) {
      const cd = document.createElement('div');
      cd.className = 'menu-divider';
      cd.textContent = 'Управление: ' + (ctx.name || ctx.uid);
      drawer.appendChild(cd);
      addItem('🎖 Выдать роль', () => grantRole(ctx.uid));
      addItem('💎 Выдать тариф', () => grantTariff(ctx.uid));
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

function myProposalsCount(account) {
  try {
    if (typeof GamesCatalog === 'undefined' || !account.name) return 0;
    return GamesCatalog.getStudent().filter(g => g.author === account.name).length;
  } catch (e) { return 0; }
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
    } else if (account.role && account.role !== 'guest') {
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
  const lp = sc.querySelector('#cabinet-level-progress');
  if (lp) lp.style.width = Math.round(li.progress * 100) + '%';

  const set = (id, v) => { const el = sc.querySelector('#' + id); if (el) el.textContent = v; };
  set('likes-num', String(account.likesCount || 0));
  set('awards-num', String((account.badges || []).length));
  set('level-num', String(li.level));
  set('games-num', String(myProposalsCount(account)));
  set('learn-num', '1');
  set('xp-num', String(account.xp || 0));
  const xpBar = sc.querySelector('#xp-progress');
  if (xpBar) xpBar.style.width = ((account.xp || 0) % 100) + '%';

  set('cnt-following', String(account.followingCount || 0));
  set('cnt-followers', String(account.followersCount || 0));

  renderFriends(account);
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
    const snap = await db.collection('follows').where('from', '==', account.uid).limit(12).get();
    box.innerHTML = '';
    if (snap.empty) {
      box.innerHTML = '<p class="muted">Пока никого. Открой чужой кабинет и добавь человека ✚</p>';
      return;
    }
    for (const doc of snap.docs) {
      const f = doc.data();
      let name = '(без имени)', liked = false;
      try {
        const u = await db.collection('users').doc(f.to).get();
        if (u.exists) name = u.data().name || name;
        const back = await db.collection('follows').doc(f.to + '__' + account.uid).get();
        liked = back.exists;
      } catch (e) {}
      const row = document.createElement('div');
      row.className = 'friend-row';
      row.innerHTML = '<span class="friend-dot"></span><span class="friend-name"></span>' +
                      (liked ? '<span class="badge badge-admin">друг</span>'
                             : '<span class="badge">подписка</span>');
      row.querySelector('.friend-name').textContent = name;
      row.addEventListener('click', () => openUserDetail(f.to));
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
  try {
    const db = await getDb();
    const ref = db.collection('likes').doc(targetUid + '__' + me.uid);
    const already = await ref.get();
    if (already.exists) { showToast('Ты уже ставил лайк этому пользователю'); return; }
    await ref.set({ to: targetUid, from: me.uid, at: firebase.firestore.FieldValue.serverTimestamp() });
    await db.collection('users').doc(targetUid).set(
      { likesCount: firebase.firestore.FieldValue.increment(1) }, { merge: true });
    showToast('Лайк доставлен ❤️');
    if (btn) { btn.disabled = true; btn.textContent = '❤️ Лайк поставлен'; }
  } catch (e) { alert('Лайк не прошёл: ' + e.message); }
}

async function toggleFollow(targetUid, btn) {
  const me = getSessionAccount();
  if (!me) return;
  if (targetUid === me.uid) return;
  try {
    const db = await getDb();
    const ref = db.collection('follows').doc(me.uid + '__' + targetUid);
    const doc = await ref.get();
    if (doc.exists) {
      await ref.delete();
      await db.collection('users').doc(me.uid).set(
        { followingCount: firebase.firestore.FieldValue.increment(-1) }, { merge: true });
      await db.collection('users').doc(targetUid).set(
        { followersCount: firebase.firestore.FieldValue.increment(-1) }, { merge: true });
      me.followingCount = Math.max(0, (me.followingCount || 0) - 1);
      showToast('Подписка отменена');
      if (btn) btn.textContent = '✚ Добавить в друзья';
    } else {
      await ref.set({ from: me.uid, to: targetUid, at: firebase.firestore.FieldValue.serverTimestamp() });
      await db.collection('users').doc(me.uid).set(
        { followingCount: firebase.firestore.FieldValue.increment(1) }, { merge: true });
      await db.collection('users').doc(targetUid).set(
        { followersCount: firebase.firestore.FieldValue.increment(1) }, { merge: true });
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
  addRow('Способ входа', account.loginType || '—');
  const reg = fmtDate(account.createdAt); if (reg) addRow('В PRO.AI с', reg);
  addRow('Лайков получено', String(account.likesCount || 0));
  addRow('Подписки', String(account.followingCount || 0));
  addRow('Подписчики', String(account.followersCount || 0));
  addRow('Опыт (XP)', String(account.xp || 0));
  addRow('Сервер', account.offline ? 'нет связи' : 'подключен');
  body.appendChild(st);

  const g = document.createElement('div');
  g.className = 'glass';
  g.style.padding = '14px';
  g.innerHTML = '<div class="card-title">Мои заявки (игры)</div>';
  const props = (account.name && typeof GamesCatalog !== 'undefined')
    ? GamesCatalog.getStudent().filter(x => x.author === account.name) : [];
  if (!props.length) {
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = 'Заявок пока нет';
    g.appendChild(p);
  } else {
    props.forEach(x => {
      const r = document.createElement('div');
      r.className = 'friend-row';
      r.innerHTML = '<span class="friend-name"></span><span class="badge"></span>';
      r.querySelector('.friend-name').textContent = x.title || '(без названия)';
      r.querySelector('.badge').textContent =
        x.status === 'approved' ? 'одобрена' : x.status === 'rejected' ? 'отклонена' : 'на модерации';
      g.appendChild(r);
    });
  }
  body.appendChild(g);
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
    const [uSnap, privSnap, avSnap, likeSnap, followSnap] = await Promise.all([
      db.collection('users').doc(uid).get(),
      db.collection('users_private').doc(uid).get(),
      db.collection('avatars').doc(uid).get(),
      db.collection('likes').doc(uid + '__' + me.uid).get(),
      db.collection('follows').doc(me.uid + '__' + uid).get()
    ]);
    const u = uSnap.exists ? uSnap.data() : {};
    const priv = privSnap.exists ? privSnap.data() : {};

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
      ' · уровень ' + (1 + Math.floor((u.likesCount || 0) / 10)) +
      ' · подписчики ' + (u.followersCount || 0) +
      ' · подписки ' + (u.followingCount || 0) +
      ' · роль: ' + (priv.role || 'guest') +
      (priv.tariff ? ' · тариф: ' + priv.tariff : '') +
      (reg ? ' · с ' + reg : '');
    card.appendChild(info);

    if (uid !== me.uid) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:10px;margin-top:10px';

      const likeBtn = document.createElement('button');
      likeBtn.className = 'btn btn-secondary';
      likeBtn.textContent = '❤️ Лайк';
      likeBtn.disabled = likeSnap.exists;
      if (likeSnap.exists) likeBtn.textContent = '❤️ Лайк поставлен';
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
  const input = prompt('Роль (guest / user / developer):', 'user');
  if (input === null) return;
  const role = input.trim().toLowerCase();
  if (!['guest', 'user', 'developer'].includes(role)) { alert('Такой роли нет'); return; }
  try {
    const db = await getDb();
    await db.collection('users_private').doc(uid).set({ role }, { merge: true });
    showToast('Роль выдана: ' + role);
  } catch (e) { alert('Не получилось: ' + e.message); }
}

async function grantTariff(uid) {
  const input = prompt('Тариф (free / book / video / pro):', 'free');
  if (input === null) return;
  const tariff = input.trim().toLowerCase();
  if (!['free', 'book', 'video', 'pro'].includes(tariff)) { alert('Такого тарифа нет'); return; }
  try {
    const db = await getDb();
    await db.collection('users_private').doc(uid).set({ tariff }, { merge: true });
    showToast('Тариф выдан: ' + tariff);
  } catch (e) { alert('Не получилось: ' + e.message); }
}

async function deleteUser(uid, name) {
  const me = getSessionAccount();
  if (uid === me.uid) { alert('Свой аккаунт так удалить нельзя — защита от самого себя 🙂'); return; }
  if (!confirm('Удалить аккаунт ' + (name || uid) + '? Действие необратимо.')) return;
  try {
    const db = await getDb();
    await db.collection('users').doc(uid).delete();
    await db.collection('users_private').doc(uid).delete().catch(() => {});
    await db.collection('avatars').doc(uid).delete().catch(() => {});
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
  document.getElementById('tile-stats')?.addEventListener('click', () => {
    const a = getSessionAccount();
    if (a) { renderManage(a); showScreen('screen-manage'); }
  });
  document.getElementById('manage-back')?.addEventListener('click', () => showScreen('screen-cabinet'));
  document.getElementById('users-back')?.addEventListener('click', () => showScreen('screen-cabinet'));
});

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