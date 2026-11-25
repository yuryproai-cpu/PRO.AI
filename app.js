/* =====================================================
   PRO.AI — app.js (v1.3, диагностическая сборка)
   ===================================================== */
'use strict';

/* ---------- Чёрный ящик: ошибки видны на экране ----------
   Временно, для диагностики запуска. Убрать после отладки. */

function showFatal(msg) {
  let box = document.getElementById('diag-box');
  if (!box) {
    box = document.createElement('div');
    box.id = 'diag-box';
    box.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:99999;' +
      'background:#b00020;color:#fff;font:12px monospace;padding:8px;white-space:pre-wrap;';
    document.body.appendChild(box);
  }
  box.textContent += msg + '\n';
}
window.addEventListener('error', (e) =>
  showFatal('ОШИБКА: ' + e.message + ' (строка ' + e.lineno + ')'));
window.addEventListener('unhandledrejection', (e) =>
  showFatal('СЕТЬ: ' + (e.reason && e.reason.message ? e.reason.message : e.reason)));

function splashStatus(msg) {
  const sp = document.getElementById('screen-splash');
  if (!sp) return;
  let st = document.getElementById('splash-status');
  if (!st) {
    st = document.createElement('p');
    st.id = 'splash-status';
    st.style.cssText = 'position:absolute;bottom:12px;left:0;right:0;text-align:center;' +
      'color:#fff;font:12px sans-serif;margin:0;';
    sp.style.position = 'relative';
    sp.appendChild(st);
  }
  st.textContent = msg;
}

/* ---------- Единая конфигурация ---------- */

const CONFIG = {
  API_BASE: 'https://pro-ai.yury-proai.workers.dev/api',
};

/* ПРАВИЛО 12: единственный регулярный шаблон логина. */
const LOGIN_REGEX = /^@[a-zA-Z][a-zA-Z0-9_]{3,31}$/;

/* ПРАВИЛО 11: строгий белый список MIME для аватара. */
const AVATAR_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

/* ---------- Состояние ---------- */

const state = {
  profile: null,
  role: 'user',
  feedTimer: null,
  currentScreen: null,
};

/* ---------- DOM-хелперы ---------- */

const $ = (id) => document.getElementById(id);

function show(screenId) {
  document.querySelectorAll('.screen').forEach((s) => s.hidden = true);
  $(screenId).hidden = false;
  state.currentScreen = screenId;
}

function setText(el, value) {
  el.textContent = value;
}

function makeEl(tag, className, textValue) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (textValue !== undefined) setText(el, textValue);
  return el;
}

/* ---------- API ---------- */

async function api(path, options = {}) {
  const res = await fetch(CONFIG.API_BASE + path, {
    method: options.method || 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) throw new Error('API error: ' + res.status);
  return res.json();
}

async function loadMe() {
  const tg = window.Telegram?.WebApp;
  const initData = tg?.initData || '';
  const data = await api('/me', { method: 'POST', body: { initData } });
  state.profile = data.profile;
  state.role = data.role || 'user';
  return data;
}

/* ---------- Кнопка управления в шапке ---------- */

function renderControlButton() {
  const btn = $('control-btn');
  if (state.role === 'admin' || state.role === 'moderator') {
    btn.hidden = false;
  } else {
    btn.hidden = true;
  }
  renderMenu();
}

function renderMenu() {
  const menu = $('control-menu');
  menu.textContent = '';
  menu.hidden = true;

  const isAdmin = state.role === 'admin';
  const isModer = state.role === 'moderator';
  if (!isAdmin && !isModer) return;

  if (isAdmin) {
    menu.appendChild(makeEl('div', 'menu-title', 'Админ-панель'));
    menu.appendChild(menuItem('Дать/забрать роль', () => show('screen-role')));
    menu.appendChild(menuItem('Редактировать лендинг', () => show('screen-landing-edit')));
  }
  if (isAdmin || isModer) {
    menu.appendChild(makeEl('div', 'menu-title', 'Панель модера'));
    menu.appendChild(menuItem('Проверить отзыв', () => show('screen-review-check')));
  }
}

function menuItem(label, onClick) {
  const b = makeEl('button', 'menu-item', label);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

/* ---------- Левое меню ---------- */

function renderLeftMenu() {
  const menu = $('left-menu');
  menu.textContent = '';
  menu.hidden = true;

  menu.appendChild(menuItem('Мой кабинет', () => show('screen-cabinet')));

  if (state.profile && state.profile.login) {
    menu.appendChild(menuItem('Написать отзыв о проекте', () => show('screen-write-review')));
  }
}

/* ---------- Сплэш и маршрутизация входа ---------- */

async function init() {
  const tg = window.Telegram?.WebApp;
  if (tg) {
    tg.ready();
    tg.expand();
  }

  show('screen-splash');
  splashStatus('Проверяем вход...');

  try {
    await loadMe();
    splashStatus('Вход подтверждён, открываем...');
  } catch (e) {
    splashStatus('Сервер недоступен: ' + e.message);
    state.profile = null;
    state.role = 'user';
  }

  routeEntry();
}

function isActivated() {
  return Boolean(state.profile && state.profile.login);
}

function routeEntry() {
  if (isActivated()) {
    renderCabinet();
    show('screen-cabinet');
  } else {
    renderLanding();
    show('screen-landing');
  }
  renderControlButton();
  renderLeftMenu();
}

/* ---------- Лендинг-витрина ---------- */

async function renderLanding() {
  try {
    const content = await api('/landing');
    setText($('land-about'), content.about || '');
    setText($('land-interview'), content.interview || '');
    if (content.interviewPhoto) {
      $('land-photo').src = content.interviewPhoto;
      $('land-photo').hidden = false;
    }
    renderReviews(content.reviews || []);
    renderProducts(content.products || []);
    renderFaq(content.faq || []);
  } catch (e) {
    setText($('land-reviews-empty'), 'Ещё никто не оставил свой отзыв');
  }
}

function renderReviews(reviews) {
  const box = $('land-reviews-list');
  box.textContent = '';
  if (!reviews.length) {
    setText($('land-reviews-empty'), 'Ещё никто не оставил свой отзыв');
    return;
  }
  $('land-reviews-empty').hidden = true;
  reviews.forEach((r) => {
    const card = makeEl('div', 'review-card');
    card.appendChild(makeEl('div', 'review-author', r.authorLogin));
    card.appendChild(makeEl('p', 'review-text', r.text));
    box.appendChild(card);
  });
}

function renderProducts(items) {
  const box = $('land-products');
  box.textContent = '';
  items.forEach((p) => box.appendChild(makeEl('div', 'block', p.title)));
}

function renderFaq(items) {
  const box = $('land-faq');
  box.textContent = '';
  items.forEach((f) => {
    const q = makeEl('div', 'block');
    q.appendChild(makeEl('h2', null, f.question));
    q.appendChild(makeEl('p', null, f.answer));
    box.appendChild(q);
  });
}

/* ---------- Диалог «Добавить логин» ---------- */

function openLoginDialog() {
  $('login-input').value = '';
  $('login-error').hidden = true;
  $('login-consent').checked = false;
  $('login-dialog').hidden = false;
  setTimeout(() => $('login-input').focus(), 350);
}

async function submitLogin() {
  const input = $('login-input');
  const login = input.value.trim();

  if (!LOGIN_REGEX.test(login)) {
    showLoginError('Логин: латиница через @, от 4 до 32 символов. Пример: @pro_ai');
    return;
  }
  if (!$('login-consent').checked) {
    showLoginError('Подтвердите согласие на добавление в общую ленту');
    return;
  }

  const btn = $('login-submit');
  btn.disabled = true;
  try {
    const tg = window.Telegram?.WebApp;
    const data = await api('/activate', {
      method: 'POST',
      body: { initData: tg?.initData || '', login },
    });
    if (data.ok) {
      state.profile = data.profile;
      state.role = data.role || state.role;
      $('login-dialog').hidden = true;
      routeEntry();
    } else {
      showLoginError(data.error || 'Занят, выбери другой');
    }
  } catch (e) {
    showLoginError('Ошибка соединения. Попробуйте ещё раз.');
  } finally {
    btn.disabled = false;
  }
}

function showLoginError(msg) {
  const el = $('login-error');
  setText(el, msg);
  el.hidden = false;
}

/* ---------- Личный кабинет ---------- */

function renderCabinet() {
  const p = state.profile || {};

  setText($('cabinet-name'), p.name || '(имя)');
  setText($('cabinet-bio'), p.bio || '(био)');

  const avatar = $('cabinet-avatar');
  if (p.avatarUrl) {
    avatar.src = p.avatarUrl;
    avatar.classList.remove('avatar-placeholder');
    setText(avatar, '');
  } else {
    avatar.classList.add('avatar-placeholder');
    setText(avatar, '👤');
  }

  setText($('cabinet-subs'), 'Подписки: ' + (p.subscriptionsCount || 0));
  setText($('cabinet-followers'), 'Подписчики: ' + (p.followersCount || 0));

  renderFeedBlock();
}

function openEditDialog(field) {
  const dialog = $('edit-dialog');
  const titles = { name: 'Ваше имя или псевдоним', bio: 'О себе (до 160 символов)' };
  setText($('edit-title'), titles[field] || '');
  $('edit-input').value = state.profile?.[field] || '';
  $('edit-input').maxLength = field === 'bio' ? 160 : 64;
  $('edit-input').dataset.field = field;
  dialog.hidden = false;
  setTimeout(() => $('edit-input').focus(), 350);
}

async function submitEdit() {
  const field = $('edit-input').dataset.field;
  const value = $('edit-input').value.trim();
  if (!value) return;

  try {
    const data = await api('/profile', {
      method: 'POST',
      body: { field, value },
    });
    if (data.ok) {
      state.profile[field] = value;
      renderCabinet();
      $('edit-dialog').hidden = true;
    }
  } catch (e) {
    /* повторная попытка по нажатию «Сохранить» */
  }
}

/* ---------- Аватар: белый список MIME ---------- */

function onAvatarPick(file) {
  if (!file || !AVATAR_MIME.includes(file.type)) {
    setText($('avatar-error'), 'Поддерживаются JPEG, PNG, WebP и GIF.');
    $('avatar-error').hidden = false;
    return;
  }
  if (file.size > AVATAR_MAX_BYTES) {
    setText($('avatar-error'), 'Файл больше 5 МБ.');
    $('avatar-error').hidden = false;
    return;
  }
  $('avatar-error').hidden = true;
  openCropEditor(file);
}

function openCropEditor(file) {
  const img = new Image();
  img.onload = () => {
    const canvas = $('crop-canvas');
    canvas.hidden = false;
    const ctx = canvas.getContext('2d');
    const st = { zoom: 1, dx: 0, dy: 0 };

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const scale = Math.max(canvas.width / img.width, canvas.height / img.height) * st.zoom;
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.drawImage(img, (canvas.width - w) / 2 + st.dx, (canvas.height - h) / 2 + st.dy, w, h);
    }

    $('crop-zoom').oninput = (e) => { st.zoom = 1 + Number(e.target.value); draw(); };

    let px = 0, py = 0;
    canvas.ontouchstart = (e) => { px = e.touches[0].clientX; py = e.touches[0].clientY; };
    canvas.ontouchmove = (e) => {
      e.preventDefault();
      st.dx += e.touches[0].clientX - px;
      st.dy += e.touches[0].clientY - py;
      px = e.touches[0].clientX; py = e.touches[0].clientY;
      draw();
    };
    canvas.onmousedown = (e) => {
      px = e.clientX; py = e.clientY;
      canvas.onmousemove = (ev) => {
        st.dx += ev.clientX - px; st.dy += ev.clientY - py;
        px = ev.clientX; py = ev.clientY; draw();
      };
      canvas.onmouseup = () => { canvas.onmousemove = null; };
    };

    $('crop-save').onclick = () => {
      canvas.toBlob(async (blob) => {
        const form = new FormData();
        form.append('avatar', blob, 'avatar.png');
        const res = await fetch(CONFIG.API_BASE + '/avatar', { method: 'POST', body: form });
        if (res.ok) {
          const data = await res.json();
          state.profile.avatarUrl = data.avatarUrl;
          renderCabinet();
        }
        $('crop-dialog').hidden = true;
      }, 'image/png');
    };

    $('crop-dialog').hidden = false;
    draw();
  };
  img.src = URL.createObjectURL(file);
}
/* ---------- Блок ленты: 3 участника, каждые 10 сек ---------- */

async function renderFeedBlock() {
  const box = $('feed-cards');
  box.textContent = '';
  stopFeedTimer();

  let users = [];
  try {
    users = await api('/feed/top3');
  } catch (e) { users = []; }

  if (users.length < 3) {
    setText($('feed-caption'), 'Здесь можете быть вы, добавьте свой ник в базу, ' +
      'дайте разрешение на показ всем участникам, и ваши друзья смогут вас найти');
    return;
  }
  $('feed-caption').hidden = false;
  drawFeedUsers(users);

  state.feedTimer = setInterval(async () => {
    try {
      const next = await api('/feed/top3');
      drawFeedUsers(next);
    } catch (e) { /* тишина до следующего тика */ }
  }, 10000);
}

function drawFeedUsers(users) {
  const box = $('feed-cards');
  box.textContent = '';
  users.slice(0, 3).forEach((u) => {
    const card = makeEl('div', 'feed-card');
    const av = document.createElement('img');
    av.className = 'avatar';
    av.alt = '';
    if (u.avatarUrl) av.src = u.avatarUrl;
    card.appendChild(av);
    card.appendChild(makeEl('div', 'name', u.login));
    card.addEventListener('click', () => openGuestProfile(u));
    box.appendChild(card);
  });
}

function stopFeedTimer() {
  if (state.feedTimer) {
    clearInterval(state.feedTimer);
    state.feedTimer = null;
  }
}

/* ---------- Полная лента: 20 человек на страницу ---------- */

async function openFeedPage(page = 1, query = '') {
  const params = new URLSearchParams({ page: String(page), q: query });
  const data = await api('/feed/list?' + params.toString());
  const box = $('feed-list');
  box.textContent = '';
  data.users.forEach((u) => {
    const row = makeEl('div', 'subs-item');
    row.appendChild(makeEl('div', 'name', u.login));
    row.addEventListener('click', () => openGuestProfile(u));
    box.appendChild(row);
  });
  show('screen-feed');
}

async function onFeedSearch() {
  await openFeedPage(1, $('feed-search').value.trim());
}

/* ---------- Профиль другого пользователя (гость) ---------- */

function openGuestProfile(user) {
  stopFeedTimer();
  setText($('guest-name'), user.name || '(имя)');
  setText($('guest-login'), user.login);
  setText($('guest-bio'), user.bio || '(био)');
  setText($('guest-subs'), 'Подписки: ' + (user.subscriptionsCount || 0));
  setText($('guest-followers'), 'Подписчики: ' + (user.followersCount || 0));

  const btn = $('guest-subscribe');
  setText(btn, user.relation || 'Подписаться');

  show('screen-guest');
}

async function toggleSubscribe() {
  const login = $('guest-login').textContent;
  const data = await api('/subscribe', { method: 'POST', body: { login } });
  if (data.ok) {
    setText($('guest-subscribe'), data.relation);
  }
}

/* ---------- Выпадающий список «Мои подписки» ---------- */

async function toggleSubsDropdown() {
  const box = $('subs-dropdown');
  if (!box.hidden) { box.hidden = true; return; }
  const data = await api('/subscriptions');
  const list = $('subs-list');
  list.textContent = '';
  if (!data.users.length) {
    list.appendChild(makeEl('div', 'empty-state', 'Вы пока ни на кого не подписаны'));
  } else {
    data.users.forEach((u) => {
      const row = makeEl('div', 'subs-item');
      row.appendChild(makeEl('div', 'name', u.login));
      row.addEventListener('click', () => openGuestProfile(u));
      list.appendChild(row);
    });
  }
  box.hidden = false;
}

/* ---------- Кнопка «Обучение» ---------- */

function onTrainingClick() {
  show('screen-training');
}

/* ---------- Навигация назад ---------- */

function goBack() {
  stopFeedTimer();
  const s = state.currentScreen;
  if (s === 'screen-role' || s === 'screen-landing-edit' || s === 'screen-review-check') {
    show('screen-cabinet');
    openControlMenu();
  } else if (s === 'screen-guest' || s === 'screen-feed' || s === 'screen-dialogs' ||
             s === 'screen-chat' || s === 'screen-training' || s === 'screen-write-review') {
    renderCabinet();
    show('screen-cabinet');
  } else if (s === 'screen-landing') {
    show('screen-landing');
  }
}

function openControlMenu() {
  $('control-menu').hidden = !$('control-menu').hidden;
}

/* ---------- Переписка ---------- */

async function openDialogs() {
  const data = await api('/dialogs');
  const box = $('dialogs-list');
  box.textContent = '';
  data.dialogs.forEach((d) => {
    const row = makeEl('div', 'subs-item');
    row.appendChild(makeEl('div', 'name', d.login));
    row.addEventListener('click', () => openChat(d));
    box.appendChild(row);
  });
  show('screen-dialogs');
}

async function openChat(dialog) {
  const data = await api('/messages?login=' + encodeURIComponent(dialog.login));
  setText($('chat-login'), dialog.login);
  const box = $('chat-messages');
  box.textContent = '';
  data.messages.forEach((m) => {
    const line = makeEl('div', m.mine ? 'msg mine' : 'msg');
    setText(line, m.text);
    box.appendChild(line);
  });
  show('screen-chat');
}

async function sendMessage() {
  const input = $('chat-input');
  const text = input.value.trim();
  if (!text) return;
  const data = await api('/messages', {
    method: 'POST',
    body: { login: $('chat-login').textContent, text },
  });
  if (data.ok) {
    const box = $('chat-messages');
    const line = makeEl('div', 'msg mine', text);
    box.appendChild(line);
    input.value = '';
  }
}

/* ---------- Назначение роли (только админ) ---------- */

async function findUserById() {
  const id = $('role-search').value.trim();
  if (!id) return;
  const data = await api('/user?id=' + encodeURIComponent(id));
  if (data.ok) {
    setText($('role-user-name'), data.name || '(имя)');
    setText($('role-user-id'), data.telegramId);
    $('role-select').value = data.role;
    $('role-user-block').hidden = false;
  }
}

async function confirmRole() {
  const data = await api('/role', {
    method: 'POST',
    body: {
      telegramId: $('role-user-id').textContent,
      role: $('role-select').value,
    },
  });
  if (data.ok) goBack();
}

async function openFriendsForRole() {
  const data = await api('/subscriptions');
  const box = $('friends-list');
  box.textContent = '';
  data.users.forEach((u) => {
    const row = makeEl('button', 'subs-item', u.login);
    row.type = 'button';
    row.addEventListener('click', () => {
      $('role-search').value = u.telegramId;
      findUserById();
    });
    box.appendChild(row);
  });
}

/* ---------- Проверка отзыва (админ и модераторы) ---------- */

async function loadReviewQueue() {
  const data = await api('/reviews/queue');
  const box = $('review-queue');
  box.textContent = '';
  data.reviews.forEach((r) => {
    const card = makeEl('div', 'review-card');
    card.appendChild(makeEl('div', 'review-author', r.authorLogin));
    card.appendChild(makeEl('p', 'review-text', r.text));
    const okBtn = makeEl('button', 'btn btn-primary', 'Одобрить');
    okBtn.type = 'button';
    okBtn.addEventListener('click', async () => {
      await api('/reviews/moderate', { method: 'POST', body: { id: r.id, approve: true } });
      card.remove();
    });
    const noBtn = makeEl('button', 'btn', 'Отклонить');
    noBtn.type = 'button';
    noBtn.addEventListener('click', async () => {
      await api('/reviews/moderate', { method: 'POST', body: { id: r.id, approve: false } });
      card.remove();
    });
    card.appendChild(okBtn);
    card.appendChild(noBtn);
    box.appendChild(card);
  });
}

/* ---------- Редактор лендинга (только админ) ---------- */

async function loadLandingEditor() {
  const c = await api('/landing');
  $('edit-land-about').value = c.about || '';
  $('edit-land-interview').value = c.interview || '';
}

async function saveLanding() {
  const body = {
    about: $('edit-land-about').value,
    interview: $('edit-land-interview').value,
  };
  await api('/landing', { method: 'POST', body });
  goBack();
}

/* ---------- Навешивание обработчиков ---------- */

function bindEvents() {
  $('open-login').addEventListener('click', openLoginDialog);
  $('open-login-2').addEventListener('click', openLoginDialog);
  $('login-submit').addEventListener('click', submitLogin);
  $('login-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitLogin();
  });

  $('cabinet-name').addEventListener('click', () => openEditDialog('name'));
  $('cabinet-bio').addEventListener('click', () => openEditDialog('bio'));
  $('edit-save').addEventListener('click', submitEdit);

  $('cabinet-avatar').addEventListener('click', () => $('avatar-file').click());
  $('avatar-file').addEventListener('change', (e) => onAvatarPick(e.target.files[0]));

  $('left-btn').addEventListener('click', () => { $('left-menu').hidden = !$('left-menu').hidden; });
  $('control-btn').addEventListener('click', openControlMenu);

  $('btn-dialogs').addEventListener('click', openDialogs);
  $('btn-subs').addEventListener('click', toggleSubsDropdown);
  $('btn-training').addEventListener('click', onTrainingClick);

  $('feed-open').addEventListener('click', () => openFeedPage(1));
  $('feed-search-btn').addEventListener('click', onFeedSearch);
  $('feed-next').addEventListener('click', () => openFeedPage(($('feed-page').value | 0) + 1));

  $('guest-subscribe').addEventListener('click', toggleSubscribe);
  $('guest-message').addEventListener('click', async () => {
    await openChat({ login: $('guest-login').textContent });
  });

  $('chat-send').addEventListener('click', sendMessage);
  $('chat-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendMessage();
  });

  $('role-find').addEventListener('click', findUserById);
  $('role-confirm').addEventListener('click', confirmRole);
  $('role-friends').addEventListener('click', openFriendsForRole);

  document.querySelectorAll('[data-back]').forEach((b) =>
    b.addEventListener('click', goBack)
  );

  $('land-save').addEventListener('click', saveLanding);

  showFatal('JS ЗАГРУЗИЛСЯ ЦЕЛИКОМ, версия v1.3');
}

/* ---------- Запуск ---------- */

bindEvents();
init();