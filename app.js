/* =====================================================
   PRO.AI — app.js (v1, финальная сборка)
   Логика без оформления (стили — только styles.css).
   Подключение в index.html: <script src="app.js?v=1" defer></script>
   При каждой правке этого файла: ?v= → +1 (правило 10).
   ===================================================== */
'use strict';

/* ---------- Единая конфигурация ---------- */

const CONFIG = {
  // Адрес Cloudflare Worker — вшит, менять не нужно.
  API_BASE: 'https://pro-ai.yury-proai.workers.dev/api',
};

/* ПРАВИЛО 12: единственный регулярный шаблон логина.
   Латиница через @, как в Telegram. Менять только здесь. */
const LOGIN_REGEX = /^@[a-zA-Z][a-zA-Z0-9_]{3,31}$/;

/* ПРАВИЛО 11: строгий белый список MIME для аватара.
   SVG отсутствует намеренно. */
const AVATAR_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

/* ---------- Состояние ---------- */

const state = {
  profile: null,        // { login, name, bio, avatarUrl, feedConsent, activated }
  role: 'user',         // ТОЛЬКО с сервера (правило 4). Локально не вычисляется.
  feedTimer: null,      // таймер ленты — чистим при уходе с экрана
  currentScreen: null,
};

/* ---------- DOM-хелперы ---------- */

const $ = (id) => document.getElementById(id);

function show(screenId) {
  document.querySelectorAll('.screen').forEach((s) => s.hidden = true);
  $(screenId).hidden = false;
  state.currentScreen = screenId;
}

/* ПРАВИЛО 9: единственный способ вставить пользовательский текст. */
function setText(el, value) {
  el.textContent = value;
}

function makeEl(tag, className, textValue) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (textValue !== undefined) setText(el, textValue); // всегда textContent
  return el;
}

/* ---------- API (Cloudflare Worker) ---------- */

async function api(path, options = {}) {
  const res = await fetch(CONFIG.API_BASE + path, {
    method: options.method || 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) throw new Error('API error: ' + res.status);
  return res.json();
}

/* Проверка initData и загрузка профиля + серверной роли одним запросом. */
async function loadMe() {
  const tg = window.Telegram?.WebApp;
  const initData = tg?.initData || '';
  const data = await api('/me', { method: 'POST', body: { initData } });
  state.profile = data.profile;     // null — кабинет не активирован
  state.role = data.role || 'user'; // сервер решает, клиент верит
  return data;
}

/* ---------- Кнопка управления в шапке (правило 4) ---------- */

function renderControlButton() {
  const btn = $('control-btn');
  // Показываем ТОЛЬКО по серверной роли. user кнопки не имеет вовсе.
  if (state.role === 'admin' || state.role === 'moderator') {
    btn.hidden = false;
  } else {
    btn.hidden = true;
  }
  renderMenu();
}

/* Меню управления: две группы — админ-панель и панель модера (правило 8). */
function renderMenu() {
  const menu = $('control-menu');
  menu.textContent = ''; // очистка через textContent-семантику
  menu.hidden = true;

  const isAdmin = state.role === 'admin';
  const isModer = state.role === 'moderator';
  if (!isAdmin && !isModer) return;

  if (isAdmin) {
    menu.appendChild(makeEl('div', 'menu-title', 'Админ-панель'));
    // «Дать/забрать роль» — по ID или из друзей (ответ 11)
    menu.appendChild(menuItem('Дать/забрать роль', () => show('screen-role')));
    // «Редактировать лендинг» — сразу добавлено (ответ 20)
    menu.appendChild(menuItem('Редактировать лендинг', () => show('screen-landing-edit')));
  }
  if (isAdmin || isModer) {
    menu.appendChild(makeEl('div', 'menu-title', 'Панель модера'));
    // «Проверить отзыв» — у обеих групп (ответ 20)
    menu.appendChild(menuItem('Проверить отзыв', () => show('screen-review-check')));
  }
}

function menuItem(label, onClick) {
  const b = makeEl('button', 'menu-item', label);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

/* ---------- Левое меню (у всех) ---------- */

function renderLeftMenu() {
  const menu = $('left-menu');
  menu.textContent = '';
  menu.hidden = true;

  menu.appendChild(menuItem('Мой кабинет', () => show('screen-cabinet')));

  // «Написать отзыв о проекте» — только у пользователей с логином (ответы 20–21).
  // Сам отзыв отправится после появления обучения (ответ 22) — сейчас пункт виден,
  // но внутри будет пометка, что обучение в разработке.
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

  try {
    await loadMe();
  } catch (e) {
    // Сервер недоступен — продолжаем как неактивированный, повторная
    // попытка произойдёт при следующем действии.
    state.profile = null;
    state.role = 'user';
  }

  routeEntry();
}

/* Решение 25.11.2026 + ответ 19:
   кабинет активирован = логин заполнен. */
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

/* ---------- Лендинг-витрина (экран №9) ---------- */

async function renderLanding() {
  // Контент лендинга хранится в базе и редактируется админом (ответ 20).
  // Здесь — рендер из базы, все тексты через textContent (правило 9).
  try {
    const content = await api('/landing');
    setText($('land-about'), content.about || '');
    setText($('land-interview'), content.interview || '');
    if (content.interviewPhoto) {
      $('land-photo').src = content.interviewPhoto; // URL из нашего хранилища
      $('land-photo').hidden = false;
    }
    renderReviews(content.reviews || []);
    renderProducts(content.products || []);
    renderFaq(content.faq || []);
  } catch (e) {
    // Блок отзывов в пустом состоянии (ответ 22)
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
    card.appendChild(makeEl('p', 'review-text', r.text)); // textContent внутри
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

/* ---------- Диалог «Добавить логин» (ответы 14, 19) ---------- */

function openLoginDialog() {
  $('login-input').value = '';
  $('login-error').hidden = true;
  $('login-consent').checked = false;
  $('login-dialog').hidden = false;
  // фокус с задержкой — чтобы мобильная клавиатура не «съела» диалог
  setTimeout(() => $('login-input').focus(), 350);
}

async function submitLogin() {
  const input = $('login-input');
  const login = input.value.trim();

  // ПРАВИЛО 12: валидация по единственному шаблону
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
      routeEntry(); // кабинет активирован — все последующие входы ведут в кабинет
    } else {
      // ответ 14: «Занят, выбери другой»
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

/* ---------- Личный кабинет (экран №1) ---------- */

function renderCabinet() {
  const p = state.profile || {};

  // ПРАВИЛО 9: всё пользовательское — через textContent.
  // Пустые поля — активные элементы, а не мёртвые заглушки
  // (дополнение владельца 25.11.2026).
  setText($('cabinet-name'), p.name || '(имя)');
  setText($('cabinet-bio'), p.bio || '(био)');

  const avatar = $('cabinet-avatar');
  if (p.avatarUrl) {
    avatar.src = p.avatarUrl;
    avatar.classList.remove('avatar-placeholder');
    setText(avatar, '');
  } else {
    avatar.classList.add('avatar-placeholder');
    setText(avatar, '👤'); // силуэт человечка
  }

  // Счётчики подписок/подписчиков (ответ 12)
  setText($('cabinet-subs'), 'Подписки: ' + (p.subscriptionsCount || 0));
  setText($('cabinet-followers'), 'Подписчики: ' + (p.followersCount || 0));

  renderFeedBlock();
}

/* Активные элементы профиля: нажал → строка ввода → «Сохранить». */

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
    // молча повторяемо: пользователь может нажать «Сохранить» ещё раз
  }
}

/* ---------- Аватар: белый список MIME (правило 11) ---------- */

function onAvatarPick(file) {
  // Проверка ДО рендера и ДО загрузки. SVG блокирован отсутствием в списке.
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

/* Редактор аватара (ответ 10): зум ползунком + перемещение пальцами. */
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
    // мышь — для десктопа
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
/* ---------- Блок ленты: 3 участника, смена каждые 10 сек (ответы 14–15) ---------- */

async function renderFeedBlock() {
  const box = $('feed-cards');
  box.textContent = '';
  stopFeedTimer(); // ПРАВИЛО (ревью): чистим прошлый таймер перед новым

  let users = [];
  try {
    users = await api('/feed/top3');
  } catch (e) { users = []; }

  if (users.length < 3) {
    // Шаблон профиля + подпись (ответ 15)
    setText($('feed-caption'), 'Здесь можете быть вы, добавьте свой ник в базу, ' +
      'дайте разрешение на показ всем участникам, и ваши друзья смогут вас найти');
    return;
  }
  $('feed-caption').hidden = false;
  drawFeedUsers(users);

  state.feedTimer = setInterval(async () => {
    try {
      const next = await api('/feed/top3'); // база решает, кто виден (ответ 14)
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
    card.appendChild(makeEl('div', 'name', u.login)); // textContent
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

/* ---------- Полная лента: 20 человек на страницу (ответ 14) ---------- */

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

/* Поиск: по нику и словам из био (ответ 14). */
async function onFeedSearch() {
  await openFeedPage(1, $('feed-search').value.trim());
}

/* ---------- Профиль другого пользователя (экран №2, как гость) ---------- */

function openGuestProfile(user) {
  stopFeedTimer();
  setText($('guest-name'), user.name || '(имя)');
  setText($('guest-login'), user.login);
  setText($('guest-bio'), user.bio || '(био)');
  setText($('guest-subs'), 'Подписки: ' + (user.subscriptionsCount || 0));
  setText($('guest-followers'), 'Подписчики: ' + (user.followersCount || 0));

  const btn = $('guest-subscribe');
  // Три состояния кнопки (ответ 12 + уточнения). Сервер отдаёт отношение.
  setText(btn, user.relation || 'Подписаться'); // Подписаться / Вы подписаны / Друзья

  show('screen-guest');
}

async function toggleSubscribe() {
  const login = $('guest-login').textContent;
  const data = await api('/subscribe', { method: 'POST', body: { login } });
  if (data.ok) {
    setText($('guest-subscribe'), data.relation); // сервер — источник истины
  }
}

/* ---------- Выпадающий список «Мои подписки» (ответ 18) ---------- */

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
      row.addEventListener('click', () => openGuestProfile(u)); // как гость
      list.appendChild(row);
    });
  }
  box.hidden = false;
}

/* ---------- Кнопка «Обучение» (ответ 4) ---------- */

function onTrainingClick() {
  show('screen-training'); // страница «Раздел обучения в разработке»
}

/* ---------- Навигация назад (ответ 17) ---------- */

function goBack() {
  stopFeedTimer();
  const s = state.currentScreen;
  if (s === 'screen-role' || s === 'screen-landing-edit' || s === 'screen-review-check') {
    show('screen-cabinet'); // возврат в меню, из которого пришли
    openControlMenu();
  } else if (s === 'screen-guest' || s === 'screen-feed' || s === 'screen-dialogs' ||
             s === 'screen-chat' || s === 'screen-training' || s === 'screen-write-review') {
    renderCabinet();
    show('screen-cabinet'); // главный экран своего профиля
  } else if (s === 'screen-landing') {
    show('screen-landing'); // с лендинга некуда возвращаться
  }
}

function openControlMenu() {
  $('control-menu').hidden = !$('control-menu').hidden;
}

/* ---------- Переписка (ответ 8) ---------- */

async function openDialogs() {
  const data = await api('/dialogs');
  const box = $('dialogs-list');
  box.textContent = '';
  data.dialogs.forEach((d) => {
    const row = makeEl('div', 'subs-item');
    row.appendChild(makeEl('div', 'name', d.login)); // аватар + имя, без поля ввода
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
    setText(line, m.text); // ПРАВИЛО 9
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

/* ---------- Назначение роли (ответ 11, только админ) ---------- */

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
      role: $('role-select').value, // сейчас доступна только moder
    },
  });
  if (data.ok) goBack();
}

/* ---------- Назначение друга (ответ 11) ---------- */

async function openFriendsForRole() {
  const data = await api('/subscriptions'); // список друзей из кабинета
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

/* ---------- Проверка отзыва (админ + модератор) ---------- */

async function loadReviewQueue() {
  const data = await api('/reviews/queue');
  const box = $('review-queue');
  box.textContent = '';
  data.reviews.forEach((r) => {
    const card = makeEl('div', 'review-card');
    card.appendChild(makeEl('div', 'review-author', r.authorLogin));
    card.appendChild(makeEl('p', 'review-text', r.text));
    const ok = makeEl('button', 'btn btn-primary', 'Одобрить');
    ok.type = 'button';
    ok.addEventListener('click', async () => {
      await api('/reviews/moderate', { method: 'POST', body: { id: r.id, approve: true } });
      card.remove();
    });
    const no = makeEl('button', 'btn', 'Отклонить');
    no.type = 'button';
    no.addEventListener('click', async () => {
      await api('/reviews/moderate', { method: 'POST', body: { id: r.id, approve: false } });
      card.remove();
    });
    card.appendChild(ok);
    card.appendChild(no);
    box.appendChild(card);
  });
}

/* ---------- Редактор лендинга (ответ 20, только админ) ---------- */

async function loadLandingEditor() {
  const c = await api('/landing');
  $('edit-land-about').value = c.about || '';
  $('edit-land-interview').value = c.interview || '';
  // поля и пояснения: «что куда вписывается и что вставляется»
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
  // Диалог логина
  $('open-login').addEventListener('click', openLoginDialog);
  $('open-login-2').addEventListener('click', openLoginDialog);
  $('login-submit').addEventListener('click', submitLogin);
  $('login-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitLogin();
  });

  // Активные элементы профиля
  $('cabinet-name').addEventListener('click', () => openEditDialog('name'));
  $('cabinet-bio').addEventListener('click', () => openEditDialog('bio'));
  $('edit-save').addEventListener('click', submitEdit);

  // Аватар: выбор из галереи устройства
  $('cabinet-avatar').addEventListener('click', () => $('avatar-file').click());
  $('avatar-file').addEventListener('change', (e) => onAvatarPick(e.target.files[0]));

  // Меню
  $('left-btn').addEventListener('click', () => { $('left-menu').hidden = !$('left-menu').hidden; });
  $('control-btn').addEventListener('click', openControlMenu);

  // Кнопки кабинета
  $('btn-dialogs').addEventListener('click', openDialogs);
  $('btn-subs').addEventListener('click', toggleSubsDropdown);
  $('btn-training').addEventListener('click', onTrainingClick);

  // Лента: полный список и поиск
  $('feed-open').addEventListener('click', () => openFeedPage(1));
  $('feed-search-btn').addEventListener('click', onFeedSearch);
  $('feed-next').addEventListener('click', () => openFeedPage(($('feed-page').value | 0) + 1));

  // Профиль гостя
  $('guest-subscribe').addEventListener('click', toggleSubscribe);
  $('guest-message').addEventListener('click', async () => {
    await openChat({ login: $('guest-login').textContent }); // «Написать сообщение»
  });

  // Чат
  $('chat-send').addEventListener('click', sendMessage);
  $('chat-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendMessage();
  });

  // Роли
  $('role-find').addEventListener('click', findUserById);
  $('role-confirm').addEventListener('click', confirmRole);
  $('role-friends').addEventListener('click', openFriendsForRole);

  // Назад
  document.querySelectorAll('[data-back]').forEach((b) =>
    b.addEventListener('click', goBack)
  );

  // Редактор лендинга
  $('land-save').addEventListener('click', saveLanding);
}

/* ---------- Запуск ---------- */

bindEvents();
init();