/* ============================================================
   PRO.AI · js/app.js — v0.2.7
   + telegram-web-app.js интеграция (ready/expand)
   + бейдж «Админ» в лобби
   + вкладка «Ещё»: диагностика (uid, вход, роль, сервер) и админ-раздел
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
  const badgeEl = lobby.querySelector('.profile-role-badge');

  if (nameEl) nameEl.textContent = displayNameOf(account);
  if (bioEl) bioEl.textContent = account.bio || '';
  if (editNameBtn) editNameBtn.hidden = !!account.name;

  if (badgeEl) {
    if (account.isAdmin) {
      badgeEl.textContent = 'Админ';
      badgeEl.className = 'profile-role-badge badge badge-admin';
      badgeEl.hidden = false;
    } else {
      badgeEl.hidden = true;
    }
  }

  if (avatarEl) {
    avatarEl.src = AVATAR_PLACEHOLDER;
    if (account.hasAvatar) {
      if (account._avatarUrl) {
        avatarEl.src = account._avatarUrl;
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
  if (!account) return;
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
  if (!account) return;
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

/* ============================================================
   Вкладка «Игры» (GamesCatalog)
   ============================================================ */

function askGameFields(includeAuthor) {
  const title = (prompt('Название игры:') || '').trim();
  if (!title) return null;
  const description = (prompt('Описание (можно пропустить):') || '').trim();
  const icon = (prompt('Иконка — эмодзи (можно пропустить):') || '').trim();
  let author = 'Ученик PRO.AI';
  let linkTelegram = '', linkMarket = '';
  if (includeAuthor) {
    author = (prompt('Автор:', 'PRO.AI') || 'PRO.AI').trim();
    linkTelegram = (prompt('Ссылка Telegram (можно пропустить):') || '').trim();
    linkMarket = (prompt('Ссылка на маркет (можно пропустить):') || '').trim();
  } else {
    linkTelegram = (prompt('Ссылка Telegram (можно пропустить):') || '').trim();
    linkMarket = (prompt('Ссылка на маркет (можно пропустить):') || '').trim();
  }
  return { title, description, icon, author, linkTelegram, linkMarket };
}

function onAddOfficial() {
  const game = askGameFields(true);
  if (!game) return;
  GamesCatalog.addOfficial(game);
  showToast('Игра добавлена в PRO.AI Games');
  renderGames(getSessionAccount());
}

function onProposeGame() {
  const account = getSessionAccount();
  const game = askGameFields(false);
  if (!game) return;
  game.author = account?.name || 'Ученик PRO.AI';
  GamesCatalog.proposeStudent(game);
  showToast('Игра отправлена на модерацию');
  renderGames(account);
}

function onModerate(id, decision) {
  GamesCatalog.moderate(id, decision);
  showToast(decision === 'approve' ? 'Игра одобрена' : 'Игра отклонена');
  renderGames(getSessionAccount());
}

function onRemoveGame(id) {
  if (!confirm('Удалить игру из каталога?')) return;
  GamesCatalog.remove(id);
  showToast('Игра удалена');
  renderGames(getSessionAccount());
}

function gameCard(g, account, opts = {}) {
  const card = document.createElement('div');
  card.className = 'card';

  const icon = document.createElement('div');
  icon.className = 'game-icon';
  icon.textContent = g.icon || '🎮';
  card.appendChild(icon);

  const body = document.createElement('div');
  body.style.flex = '1';
  body.style.minWidth = '0';

  const title = document.createElement('div');
  title.className = 'card-title';
  title.textContent = g.title || '(без названия)';
  body.appendChild(title);

  if (g.description) {
    const sub = document.createElement('div');
    sub.className = 'card-sub';
    sub.textContent = g.description;
    body.appendChild(sub);
  }

  const badge = document.createElement('div');
  badge.className = 'badge';
  badge.textContent = 'Автор: ' + (g.author || '—');
  body.appendChild(badge);

  if (g.linkTelegram || g.linkMarket) {
    const links = document.createElement('div');
    links.className = 'card-links';
    const mk = (href, label) => {
      const a = document.createElement('a');
      a.href = href; a.target = '_blank'; a.rel = 'noopener';
      a.textContent = label;
      links.appendChild(a);
    };
    if (g.linkTelegram) mk(g.linkTelegram, 'Открыть в Telegram');
    if (g.linkMarket) mk(g.linkMarket, 'Маркет');
    body.appendChild(links);
  }

  if (account?.isAdmin) {
    const actions = document.createElement('div');
    actions.className = 'card-actions';
    if (opts.pending) {
      const ok = document.createElement('button');
      ok.textContent = '✓ Одобрить';
      ok.addEventListener('click', () => onModerate(g.id, 'approve'));
      actions.appendChild(ok);
      const no = document.createElement('button');
      no.className = 'danger';
      no.textContent = '✗ Отклонить';
      no.addEventListener('click', () => onModerate(g.id, 'reject'));
      actions.appendChild(no);
    }
    const del = document.createElement('button');
    del.className = 'danger';
    del.textContent = '🗑 Удалить';
    del.addEventListener('click', () => onRemoveGame(g.id));
    actions.appendChild(del);
    body.appendChild(actions);
  }

  card.appendChild(body);
  return card;
}

function renderGames(account) {
  const screen = document.getElementById('screen-games');
  if (!screen) return;
  if (typeof GamesCatalog === 'undefined') {
    screen.innerHTML = '<p class="empty-state">Каталог недоступен (games-catalog.js не загружен)</p>';
    return;
  }
  GamesCatalog.load();
  screen.innerHTML = '';

  const h = document.createElement('h1');
  h.textContent = 'Игры';
  screen.appendChild(h);

  const official = document.createElement('section');
  const oh = document.createElement('h2');
  oh.textContent = 'PRO.AI Games';
  official.appendChild(oh);

  const list = GamesCatalog.getOfficial();
  if (!list.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'Пока пусто';
    official.appendChild(empty);
  }
  list.forEach(g => official.appendChild(gameCard(g, account)));

  if (account?.isAdmin) {
    const add = document.createElement('button');
    add.className = 'btn btn-secondary';
    add.style.marginTop = '8px';
    add.textContent = '+ Добавить игру';
    add.addEventListener('click', onAddOfficial);
    official.appendChild(add);
  }
  screen.appendChild(official);

  const student = document.createElement('section');
  const sh = document.createElement('h2');
  sh.textContent = 'Игры учеников';
  student.appendChild(sh);

  GamesCatalog.getStudentApproved().forEach(g => student.appendChild(gameCard(g, account)));

  if (account?.isAdmin) {
    const pending = GamesCatalog.getStudentPending();
    if (pending.length) {
      const ph = document.createElement('h3');
      ph.textContent = 'На модерации (' + pending.length + ')';
      ph.style.marginTop = '14px';
      student.appendChild(ph);
      pending.forEach(g => student.appendChild(gameCard(g, account, { pending: true })));
    }
  }

  const propose = document.createElement('button');
  propose.className = 'btn btn-secondary';
  propose.style.marginTop = '8px';
  propose.textContent = 'Предложить свою игру';
  propose.addEventListener('click', onProposeGame);
  student.appendChild(propose);

  screen.appendChild(student);
}

/* ============================================================
   Вкладка «Ещё»: диагностика + админ-раздел
   ============================================================ */

function diagRow(label, value) {
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

function renderSettings(account) {
  const screen = document.getElementById('screen-settings');
  if (!screen) return;
  screen.innerHTML = '';

  const h = document.createElement('h1');
  h.textContent = 'Ещё';
  screen.appendChild(h);

  // --- Диагностика: чтобы больше не гадать, кого видит приложение ---
  const diag = document.createElement('div');
  diag.className = 'card';
  diag.style.display = 'block';
  const dt = document.createElement('div');
  dt.className = 'card-title';
  dt.textContent = 'Диагностика';
  diag.appendChild(dt);

  const inTelegram = !!(window.Telegram && Telegram.WebApp && Telegram.WebApp.initDataUnsafe?.user);
  diag.appendChild(diagRow('Открыто в Telegram', inTelegram ? 'да' : 'НЕТ — открой ссылку в Telegram'));
  diag.appendChild(diagRow('Твой ID (uid)', account.uid || '—'));
  diag.appendChild(diagRow('Способ входа', account.loginType || '—'));
  diag.appendChild(diagRow('Роль', account.role || '—'));
  diag.appendChild(diagRow('Админ', account.isAdmin ? 'да' : 'нет'));
  diag.appendChild(diagRow('Сервер', account.offline ? 'нет связи' : 'подключен'));
  screen.appendChild(diag);

  // --- Админ-раздел ---
  if (account.isAdmin) {
    const admin = document.createElement('div');
    admin.className = 'card';
    admin.style.display = 'block';
    const at = document.createElement('div');
    at.className = 'card-title';
    at.textContent = 'Админка';
    admin.appendChild(at);
    const ul = document.createElement('ul');
    ul.className = 'muted';
    ul.style.paddingLeft = '20px';
    ['Модерация игр — вкладка «Игры»',
     'Модерация чата — вкладка «Чат» (когда подключим)',
     'Курсы и тарифы — вкладка «Обучение» (когда подключим)'].forEach(t => {
      const li = document.createElement('li');
      li.textContent = t;
      ul.appendChild(li);
    });
    admin.appendChild(ul);
    screen.appendChild(admin);
  } else if (inTelegram) {
    const note = document.createElement('p');
    note.className = 'muted';
    note.textContent = 'Админ-права выдаются по Telegram ID владельца. Если ты владелец и видишь «нет» — пришли мне скриншот этого экрана.';
    screen.appendChild(note);
  }

  if (account.offline) {
    const warn = document.createElement('p');
    warn.className = 'muted';
    warn.textContent = 'Сервер недоступен. Данные загружены из сохранённой копии; изменения уйдут в облако при появлении сети.';
    screen.appendChild(warn);
  }
}

/* ---------- Нижняя навигация ---------- */

const NAV_TABS = [
  { id: 'lobby',    label: 'Лобби',    render: renderLobby },
  { id: 'games',    label: 'Игры',     render: renderGames },
  { id: 'learn',    label: 'Обучение', render: null },
  { id: 'chat',     label: 'Чат',      render: null },
  { id: 'settings', label: 'Ещё',      render: renderSettings }
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

function offlineSession(reason) {
  return {
    account: { offline: true, isAdmin: false, role: 'guest', name: null, uid: null },
    migration: { deferred: true, reason }
  };
}

document.addEventListener('DOMContentLoaded', async () => {
  // Telegram Mini App: сообщаем платформе, что готовы
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
      renderTabbar();
      switchTab('lobby');
      if (s.account.offline) showToast('Нет сети — показана сохранённая копия профиля');
    });
  } else {
    setSessionAccount(session.account);
    setSessionMigration(session.migration);
  }

  renderTabbar();
  switchTab('lobby');

  if (session.account.offline) showToast('Нет сети — показана сохранённая копия профиля');
  if (session.account.isAdmin) console.info('[app] админ-режим: владелец по ADMIN_TELEGRAM_IDS');
  if (session.migration?.deferred) console.info('[app] миграция отложена:', session.migration.reason);
});