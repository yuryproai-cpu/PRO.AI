"use strict";

const $ = sel => document.querySelector(sel);
const SCREENS = [
  "screen-auth", "screen-lobby", "screen-games", "screen-game-form",
  "screen-admin", "screen-admin-learn", "screen-tariff-form", "screen-lesson-form",
  "screen-learn", "screen-lesson", "screen-rules", "screen-chats", "screen-forum", "screen-settings"
];
const ROLE_LABELS = { guest: "Гость", student: "Ученик", developer: "Разработчик", admin: "Админ" };
const LEVEL_LABELS = { free: "Свободный доступ", book: "Книга", video: "Видео", pro: "PRO" };

// --- Telegram Mini App ---
const tg = window.Telegram ? window.Telegram.WebApp : null;
const tgUser = (tg && tg.initDataUnsafe) ? tg.initDataUnsafe.user : null;

// открытие ссылок способом, правильным для текущей среды
function openLink(url) {
  if (tg && tg.openLink) tg.openLink(url);
  else window.open(url, "_blank");
}

function showScreen(id) {
  SCREENS.forEach(s => document.getElementById(s).classList.toggle("hidden", s !== id));
  document.querySelectorAll("#tabbar button").forEach(b => {
    b.classList.toggle("active", b.dataset.tab === id);
  });
  $("#tabbar").classList.toggle("hidden", id === "screen-auth");
}

let toastTimer = null;
function showToast(text) {
  const t = $("#toast");
  t.textContent = text;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 1600);
}

function fitOneLine(el, startPx, minPx) {
  el.style.fontSize = startPx + "px";
  let size = startPx;
  while (el.scrollWidth > el.clientWidth && size > minPx) {
    size -= 1;
    el.style.fontSize = size + "px";
  }
}

function setAvatarBg(el, avatar) {
  el.style.backgroundImage = avatar ? "url(" + avatar + ")" : "none";
}

// ---------- лобби ----------

function renderLobby() {
  const d = Account.data;
  setAvatarBg($("#lobby-avatar"), d.avatar);
  const nameEl = $("#lobby-name");
  nameEl.textContent = d.playerName || "";
  nameEl.classList.toggle("hidden", !d.playerName);
  fitOneLine(nameEl, 20, 13);
  $("#lobby-provider").textContent =
    "Вход через: " + Account.providerLabel() + " · Уровень: " + ROLE_LABELS[d.role] +
    (d.learnTariff ? " · Обучение: " + LEVEL_LABELS[d.learnTariff] : "");
  $("#btn-admin-panel").classList.toggle("hidden", !Account.isAdmin());
}

// ---------- витрина игр ----------

function buildGameCard(game, badgeClass, badgeText, isAdmin) {
  const card = document.createElement("div");
  card.className = "game-card";

  const head = document.createElement("div");
  head.className = "game-head";
  const icon = document.createElement("div");
  icon.className = "game-icon";
  icon.textContent = game.icon || "🎮";
  const titleBox = document.createElement("div");
  const title = document.createElement("div");
  title.className = "game-title";
  title.textContent = game.title;
  const author = document.createElement("div");
  author.className = "game-author " + badgeClass;
  author.textContent = badgeText + " " + game.author;
  titleBox.appendChild(title);
  titleBox.appendChild(author);
  head.appendChild(icon);
  head.appendChild(titleBox);

  const desc = document.createElement("div");
  desc.className = "game-desc";
  desc.textContent = game.description || "Без описания.";

  card.appendChild(head);
  card.appendChild(desc);

  addLinkBtn(card, "📥 Из Telegram", game.linkTelegram);
  addLinkBtn(card, "🛒 Google Play", game.linkMarket);

  if (isAdmin) {
    const del = document.createElement("button");
    del.className = "btn-mini red";
    del.textContent = "🗑 Удалить";
    del.onclick = () => {
      if (confirm("Удалить игру «" + game.title + "» навсегда?")) {
        GamesCatalog.remove(game.id);
        renderGames();
        showToast("Игра удалена");
      }
    };
    card.appendChild(del);
  }
  return card;
}

function addLinkBtn(card, label, link) {
  const b = document.createElement("button");
  b.className = "btn-mini";
  b.textContent = label;
  b.onclick = () => {
    if (link) openLink(link);
    else showToast("Ссылка появится после релиза");
  };
  card.appendChild(b);
}

function renderGames() {
  const box = $("#games-content");
  box.textContent = "";
  const admin = Account.isAdmin();

  const h1 = document.createElement("div");
  h1.className = "section-title";
  h1.textContent = "Игры PRO.AI";
  box.appendChild(h1);

  const official = GamesCatalog.getOfficial();
  if (official.length === 0) {
    const p = document.createElement("p");
    p.className = "empty-note";
    p.textContent = "Скоро здесь появятся игры студии.";
    box.appendChild(p);
  }
  official.forEach(g => box.appendChild(buildGameCard(g, "badge-official", "✓ Автор PRO.AI —", admin)));

  if (Account.isDeveloper()) {
    const add = document.createElement("button");
    add.className = "btn-mini green";
    add.textContent = "+ Добавить игру";
    add.onclick = () => openGameForm("official");
    box.appendChild(add);
  }

  const h2 = document.createElement("div");
  h2.className = "section-title";
  h2.textContent = "Игры учеников";
  box.appendChild(h2);

  const student = GamesCatalog.getStudentApproved();
  if (student.length === 0) {
    const p = document.createElement("p");
    p.className = "empty-note";
    p.textContent = "Работы учеников появятся здесь после модерации.";
    box.appendChild(p);
  }
  student.forEach(g => box.appendChild(buildGameCard(g, "badge-student", "Студия PRO.AI —", admin)));

  if (Account.isStudent()) {
    const add = document.createElement("button");
    add.className = "btn-mini";
    add.textContent = "+ Предложить игру";
    add.onclick = () => openGameForm("student");
    box.appendChild(add);
  }

  if (admin) {
    const pending = GamesCatalog.getStudentPending();
    if (pending.length > 0) {
      const h3 = document.createElement("div");
      h3.className = "section-title";
      h3.textContent = "🛡 Модерация (" + pending.length + ")";
      box.appendChild(h3);
      pending.forEach(g => {
        const card = buildGameCard(g, "badge-student", "На проверке —", admin);
        const ok = document.createElement("button");
        ok.className = "btn-mini green";
        ok.textContent = "✓ Опубликовать";
        ok.onclick = () => { GamesCatalog.moderate(g.id, "approve"); renderGames(); showToast("Игра опубликована"); };
        const no = document.createElement("button");
        no.className = "btn-mini red";
        no.textContent = "✗ Отклонить";
        no.onclick = () => { GamesCatalog.moderate(g.id, "reject"); renderGames(); showToast("Игра отклонена"); };
        card.appendChild(ok);
        card.appendChild(no);
        box.appendChild(card);
      });
    }
  }
}

let gameFormMode = "official";

function openGameForm(mode) {
  gameFormMode = mode;
  const official = mode === "official";
  $("#gf-heading").textContent = official ? "Новая игра PRO.AI" : "Предложить игру";
  $("#gf-note").textContent = official
    ? "Игра будет опубликована в разделе «Игры PRO.AI» сразу."
    : "Игра попадёт на модерацию и появится после одобрения админа.";
  ["gf-title", "gf-icon", "gf-desc", "gf-tg", "gf-market"].forEach(id => { $("#" + id).value = ""; });
  showScreen("screen-game-form");
}

function submitGameForm() {
  const title = $("#gf-title").value.trim();
  if (!title) { showToast("Введите название игры"); return; }
  const game = {
    title: title,
    icon: $("#gf-icon").value.trim() || "🎮",
    description: $("#gf-desc").value.trim(),
    linkTelegram: $("#gf-tg").value.trim(),
    linkMarket: $("#gf-market").value.trim(),
    author: Account.data.playerName || (gameFormMode === "official" ? "PRO.AI" : "Ученик PRO.AI")
  };
  if (gameFormMode === "official") {
    GamesCatalog.addOfficial(game);
    showToast("Игра опубликована");
  } else {
    GamesCatalog.proposeStudent(game);
    showToast("Отправлено на модерацию");
  }
  renderGames();
  showScreen("screen-games");
}
// ---------- обучение ----------

// секретный код администратора — поменяйте на свой
const ADMIN_PIN = "Yuryury1983$$$";

function discountText(t) {
  const pr = Learn.priceNow(t);
  if (!pr.discount) return "";
  const left = pr.until - Date.now();
  let time;
  if (pr.until === 0) time = "бессрочно";
  else if (left <= 0) return "";
  else {
    const h = Math.floor(left / 3600000);
    time = h >= 48 ? "осталось ~" + Math.floor(h / 24) + " дн" : "осталось ~" + h + " ч";
  }
  return "🔥 Скидка " + pr.discount + "% — " + pr.price + " ₽ вместо " + t.price + " ₽, " + time;
}

function renderLearn() {
  const box = $("#learn-content");
  box.textContent = "";
  const d = Account.data;
  const admin = Account.isAdmin();
  const tariff = d.learnTariff;

  if (admin) {
    const p = document.createElement("p");
    p.className = "form-note";
    p.textContent = "Вы админ: вам видны все уроки. Наполнение курса — в панели админа.";
    box.appendChild(p);
  } else if (tariff) {
    const p = document.createElement("p");
    p.className = "form-note";
    p.textContent = "Ваш тариф обучения: " + LEVEL_LABELS[tariff] + ". Материалы доступны только для чтения внутри приложения.";
    box.appendChild(p);
  }

  const lessons = Learn.getLessons();
  lessons.forEach(l => {
    const avail = admin || Learn.lessonAvailable(l, tariff);
    const item = document.createElement("div");
    item.className = "lesson-item" + (avail ? "" : " locked");

    const t = document.createElement("div");
    t.className = "lt";
    t.textContent = (avail ? "📖 " : "🔒 ") + l.title;
    const lv = document.createElement("div");
    lv.className = "lv";
    lv.textContent = avail ? LEVEL_LABELS[l.level] : "Откроется в тарифе «" + LEVEL_LABELS[l.level] + "»";
    t.appendChild(lv);
    item.appendChild(t);

    if (avail) item.onclick = () => openLesson(l.id);
    box.appendChild(item);
  });

  if (!tariff && !admin) {
    const h = document.createElement("div");
    h.className = "section-title";
    h.textContent = "Тарифы обучения";
    box.appendChild(h);

    Learn.getTariffs().forEach(tf => {
      const pr = Learn.priceNow(tf);
      const card = document.createElement("div");
      card.className = "tariff-card";

      const name = document.createElement("div");
      name.className = "tariff-name";
      name.textContent = tf.name;

      const price = document.createElement("div");
      price.className = "tariff-price";
      if (pr.discount) {
        const old = document.createElement("span");
        old.className = "price-old";
        old.textContent = tf.price + " ₽";
        price.appendChild(old);
      }
      price.appendChild(document.createTextNode(pr.price + " ₽"));

      const disc = document.createElement("div");
      disc.className = "discount-badge";
      disc.textContent = discountText(tf);

      const desc = document.createElement("div");
      desc.className = "tariff-desc";
      desc.textContent = tf.description;

      const btn = document.createElement("button");
      btn.className = "btn-mini green";
      btn.textContent = "Хочу учиться: " + tf.name;
      btn.onclick = () => {
        Learn.addRequest(Account.data.playerName || "Без имени",
          Account.providerLabel() + " · тариф " + tf.name);
        showToast("Заявка отправлена! Админ свяжется с вами.");
      };

      card.appendChild(name);
      card.appendChild(price);
      card.appendChild(disc);
      card.appendChild(desc);
      card.appendChild(btn);
      box.appendChild(card);
    });
  }
}

let currentLessonId = null;

function openLesson(id) {
  const l = Learn.getLessons().find(x => x.id === id);
  if (!l) return;
  currentLessonId = id;
  $("#lesson-title").textContent = l.title;

  const v = $("#lesson-video");
  v.textContent = "";
  if (l.videoUrl) {
    const b = document.createElement("button");
    b.className = "btn-mini green";
    b.textContent = "▶ Смотреть видеоурок";
    b.onclick = () => openLink(l.videoUrl);
    v.appendChild(b);
  }

  $("#lesson-body").textContent = l.body || "Текст урока пока не написан.";
  // водяной знак: служебный логин — по нему вычислим источник утечки
  $("#watermark").textContent = "PRO.AI · " + Account.data.login + " · не копируйте";
  showScreen("screen-lesson");
}

// ---------- редактор обучения (админ) ----------

function renderAdminLearn() {
  const rq = $("#learn-requests");
  rq.textContent = "";
  const requests = Learn.getRequests();
  if (requests.length === 0) {
    const p = document.createElement("p");
    p.className = "empty-note";
    p.textContent = "Заявок пока нет.";
    rq.appendChild(p);
  }
  requests.forEach((r, i) => {
    const item = document.createElement("div");
    item.className = "lesson-item";
    const t = document.createElement("div");
    t.className = "lt";
    t.textContent = r.name + " · " + r.from;
    item.appendChild(t);
    const ok = document.createElement("button");
    ok.className = "btn-mini green";
    ok.textContent = "✓ Обработано";
    ok.onclick = () => { Learn.clearRequest(i); renderAdminLearn(); };
    item.appendChild(ok);
    rq.appendChild(item);
  });

  const tb = $("#tariffs-admin");
  tb.textContent = "";
  Learn.getTariffs().forEach(tf => {
    const item = document.createElement("div");
    item.className = "lesson-item";
    const t = document.createElement("div");
    t.className = "lt";
    t.textContent = tf.name + " · " + tf.price + " ₽ · " + LEVEL_LABELS[tf.level];
    item.appendChild(t);
    const edit = document.createElement("button");
    edit.className = "btn-mini";
    edit.textContent = "✎";
    edit.onclick = () => openTariffForm(tf);
    const del = document.createElement("button");
    del.className = "btn-mini red";
    del.textContent = "🗑";
    del.onclick = () => {
      if (confirm("Удалить тариф «" + tf.name + "»?")) { Learn.deleteTariff(tf.id); renderAdminLearn(); }
    };
    item.appendChild(edit);
    item.appendChild(del);
    tb.appendChild(item);
  });

  const lb = $("#lessons-admin");
  lb.textContent = "";
  Learn.getLessons().forEach(l => {
    const item = document.createElement("div");
    item.className = "lesson-item";
    const t = document.createElement("div");
    t.className = "lt";
    t.textContent = l.title + " · " + LEVEL_LABELS[l.level];
    item.appendChild(t);
    const edit = document.createElement("button");
    edit.className = "btn-mini";
    edit.textContent = "✎";
    edit.onclick = () => openLessonForm(l);
    const del = document.createElement("button");
    del.className = "btn-mini red";
    del.textContent = "🗑";
    del.onclick = () => {
      if (confirm("Удалить урок «" + l.title + "»?")) { Learn.deleteLesson(l.id); renderAdminLearn(); }
    };
    item.appendChild(edit);
    item.appendChild(del);
    lb.appendChild(item);
  });
}

let editingTariffId = null;

function openTariffForm(t) {
  editingTariffId = t ? t.id : null;
  $("#tf-heading").textContent = t ? "Редактировать тариф" : "Новый тариф";
  $("#tf-name").value = t ? t.name : "";
  $("#tf-level").value = t ? t.level : "book";
  $("#tf-price").value = t ? t.price : "";
  $("#tf-desc").value = t ? t.description : "";
  $("#tf-discount").value = t ? (t.discountPercent || 0) : 0;
  $("#tf-days").value = 0;
  showScreen("screen-tariff-form");
}

function submitTariffForm() {
  const name = $("#tf-name").value.trim();
  if (!name) { showToast("Введите название тарифа"); return; }
  const price = Math.max(0, parseInt($("#tf-price").value, 10) || 0);
  const discountPercent = Math.min(90, Math.max(0, parseInt($("#tf-discount").value, 10) || 0));
  const days = Math.max(0, parseInt($("#tf-days").value, 10) || 0);
  Learn.saveTariff({
    id: editingTariffId,
    name: name,
    level: $("#tf-level").value,
    price: price,
    description: $("#tf-desc").value.trim(),
    discountPercent: discountPercent,
    discountUntil: (discountPercent > 0 && days > 0) ? Date.now() + days * 86400000 : 0
  });
  showToast("Тариф сохранён");
  renderAdminLearn();
  showScreen("screen-admin-learn");
}

let editingLessonId = null;

function openLessonForm(l) {
  editingLessonId = l ? l.id : null;
  $("#lf-heading").textContent = l ? "Редактировать урок" : "Новый урок";
  $("#lf-title").value = l ? l.title : "";
  $("#lf-level").value = l ? l.level : "free";
  $("#lf-video").value = l ? l.videoUrl : "";
  $("#lf-body").value = l ? l.body : "";
  showScreen("screen-lesson-form");
}

function submitLessonForm() {
  const title = $("#lf-title").value.trim();
  const body = $("#lf-body").value.trim();
  if (!title || !body) { showToast("Нужны заголовок и текст урока"); return; }
  Learn.saveLesson({
    id: editingLessonId,
    title: title,
    level: $("#lf-level").value,
    videoUrl: $("#lf-video").value.trim(),
    body: body,
    order: 0
  });
  showToast("Урок сохранён");
  renderAdminLearn();
  showScreen("screen-admin-learn");
}

// ---------- панель админа ----------

function renderAdmin() {
  $("#admin-current-role").textContent = "Ваш уровень: " + ROLE_LABELS[Account.data.role];
  $("#admin-current-tariff").textContent = "Тариф обучения: " +
    (Account.data.learnTariff ? LEVEL_LABELS[Account.data.learnTariff] : "нет");
}

// ---------- инициализация ----------

function init() {

  // --- защита контента (веб-слой): копирование запрещено везде ---
  document.addEventListener("contextmenu", e => e.preventDefault());
  document.addEventListener("copy", e => e.preventDefault());
  document.addEventListener("cut", e => e.preventDefault());

  // --- Telegram: разворачиваем приложение на весь экран ---
  if (tg) { tg.ready(); tg.expand(); }

  // --- вход ---
  $("#btn-auth-telegram").onclick = () => { Account.create("telegram", "dev_test_user"); enterLobby(); };
  $("#btn-auth-google").onclick = () => { Account.create("google", "dev_test_user"); enterLobby(); };

  // админ — только по секретному коду
  $("#btn-auth-admin").onclick = () => {
    const pin = prompt("Введите код администратора");
    if (pin === null) return;
    if (pin !== ADMIN_PIN) { showToast("Неверный код"); return; }
    Account.create("admin-test", "dev_admin", "admin");
    enterLobby();
  };

  function enterLobby() {
    renderLobby();
    showScreen("screen-lobby");
  }

  // --- кнопки "Назад" ---
  document.querySelectorAll(".btn-back").forEach(b => {
    b.onclick = () => showScreen(b.dataset.target);
  });

  // --- лобби ---
  $("#btn-games").onclick = () => { renderGames(); showScreen("screen-games"); };
  $("#btn-learn").onclick = () => { renderLearn(); showScreen("screen-learn"); };
  $("#btn-rules").onclick = () => showScreen("screen-rules");
  $("#btn-chats").onclick = () => showScreen("screen-chats");
  $("#btn-forum").onclick = () => showScreen("screen-forum");

  // --- форма игры ---
  $("#btn-gf-submit").onclick = submitGameForm;

  // --- формы обучения ---
  $("#btn-tf-submit").onclick = submitTariffForm;
  $("#btn-lf-submit").onclick = submitLessonForm;
  $("#btn-add-tariff").onclick = () => openTariffForm(null);
  $("#btn-add-lesson").onclick = () => openLessonForm(null);

  // --- настройки ---
  $("#btn-change-avatar").onclick = () => $("#avatar-input").click();
  $("#avatar-input").onchange = e => {
    const f = e.target.files[0];
    if (!f) return;
    AvatarEditor.open(f, b64 => {
      Account.setAvatar(b64);
      renderLobby();
      showToast("Фото обновлено");
    });
  };

  $("#btn-save-name").onclick = () => {
    Account.setPlayerName($("#settings-name").value.trim());
    renderLobby();
    $("#settings-name").value = "";
    showToast("Имя сохранено");
  };

  $("#btn-admin-panel").onclick = () => { renderAdmin(); showScreen("screen-admin"); };
  document.querySelectorAll("#admin-roles button").forEach(b => {
    b.onclick = () => {
      Account.setRole(b.dataset.role);
      renderAdmin(); renderLobby();
      showToast("Уровень: " + ROLE_LABELS[b.dataset.role]);
    };
  });
  document.querySelectorAll("#admin-learn-tariff button").forEach(b => {
    b.onclick = () => {
      Account.setLearnTariff(b.dataset.tariff);
      renderAdmin(); renderLobby();
      showToast("Тариф обучения обновлён");
    };
  });
  $("#btn-admin-learn").onclick = () => { renderAdminLearn(); showScreen("screen-admin-learn"); };

  $("#btn-reset").onclick = () => {
    if (confirm("Вы точно хотите удалить аккаунт? Аккаунт будет удалён навсегда, без возможности восстановления.")) {
      Account.reset();
      setAvatarBg($("#lobby-avatar"), "");
      $("#lobby-name").textContent = "";
      $("#settings-name").value = "";
      showScreen("screen-auth");
      showToast("Аккаунт удалён");
    }
  };

  // --- нижняя навигация ---
  document.querySelectorAll("#tabbar button").forEach(b => {
    b.onclick = () => {
      if (b.dataset.tab === "screen-games") renderGames();
      showScreen(b.dataset.tab);
    };
  });

  // --- запуск ---
  GamesCatalog.load();
  Learn.load();
  // авто-вход: открыл из бота Telegram — вошёл под своим аккаунтом
  if (tgUser) {
    if (!Account.load()) {
      Account.create("telegram",
        tgUser.username ? "@" + tgUser.username : "id" + tgUser.id);
    }
    enterLobby();
  } else if (Account.load()) {
    enterLobby();
  } else {
    showScreen("screen-auth");
  }
}

document.addEventListener("DOMContentLoaded", init);
