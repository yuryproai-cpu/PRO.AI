"use strict";

// Раздел обучения PRO.AI. Всё содержимое редактирует админ.
// Тарифы задают уровень доступа к урокам:
//   free  — вводный урок и "вкусняшка", видны всем
//   book  — тариф "Книга": весь курс текстом
//   video — тариф "Видео": книга + видеоуроки
//   pro   — тариф "PRO": всё + практики и сотрудничество
// Никаких скачиваний и PDF: чтение строго внутри приложения.

const Learn = (() => {
  const KEY = "proai_learn";
  const LEVEL_ORDER = { free: 0, book: 1, video: 2, pro: 3 };

  let data = null;

  function defaults() {
    return {
      // --- тарифы (админ может менять как угодно) ---
      tariffs: [
        {
          id: "t-book", name: "Книга", level: "book",
          price: 990, description: "Весь курс в виде текстовых уроков",
          discountPercent: 0, discountUntil: 0
        },
        {
          id: "t-video", name: "Видео", level: "video",
          price: 1990, description: "Книга + видеоуроки по разработке",
          discountPercent: 0, discountUntil: 0
        },
        {
          id: "t-pro", name: "PRO", level: "pro",
          price: 4990, description: "Всё + поддержка кураторов и сотрудничество с PRO.AI",
          discountPercent: 0, discountUntil: 0
        }
      ],
      // --- уроки ---
      lessons: [
        {
          id: "l-intro", title: "Кто мы и чем занимаемся",
          level: "free", videoUrl: "",
          body: "PRO.AI — платформа игр, созданных с помощью ИИ. Здесь мы учим делать игры и публикуем их."
        },
        {
          id: "l-gift", title: "Вкусняшка: 5 ИИ-инструментов для первой игры",
          level: "free", videoUrl: "",
          body: "Здесь будет бесплатный полезный урок. Замените текст в панели админа."
        },
        {
          id: "l-b1", title: "Урок курса: идея и концепт игры",
          level: "book", videoUrl: "",
          body: "Демо-урок тарифа «Книга». Замените содержимым вашего курса."
        },
        {
          id: "l-v1", title: "Видеоурок: прототип за вечер",
          level: "video", videoUrl: "",
          body: "Демо-урок тарифа «Видео». Вставьте ссылку на видео в панели админа."
        },
        {
          id: "l-p1", title: "Практика: разбор твоего проекта с куратором",
          level: "pro", videoUrl: "",
          body: "Демо-урок тарифа PRO. Доступен только сотрудничающим с PRO.AI."
        }
      ],
      // --- заявки "Хочу учиться" от гостей ---
      requests: []
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        data = {
          tariffs: Array.isArray(parsed.tariffs) ? parsed.tariffs : defaults().tariffs,
          lessons: Array.isArray(parsed.lessons) ? parsed.lessons : defaults().lessons,
          requests: Array.isArray(parsed.requests) ? parsed.requests : []
        };
      } else {
        data = defaults();
        save();
      }
      return true;
    } catch (e) {
      data = defaults();
      return false;
    }
  }

  function save() {
    localStorage.setItem(KEY, JSON.stringify(data));
  }

  // --- тарифы ---
  function getTariffs() { return data.tariffs.slice(); }

  function saveTariff(t) {
    if (t.id) {
      const old = data.tariffs.find(x => x.id === t.id);
      if (old) Object.assign(old, t);
      else data.tariffs.push(t);
    } else {
      t.id = "t" + Date.now().toString(36);
      data.tariffs.push(t);
    }
    save();
  }

  function deleteTariff(id) {
    data.tariffs = data.tariffs.filter(x => x.id !== id);
    save();
  }

  // цена с учётом скидки (скидка действует до discountUntil)
  function priceNow(tariff) {
    const active = tariff.discountPercent > 0 && Date.now() < (tariff.discountUntil || 0);
    if (!active) return { price: tariff.price, discount: 0, until: 0 };
    const p = Math.max(0, Math.round(tariff.price * (100 - tariff.discountPercent) / 100));
    return { price: p, discount: tariff.discountPercent, until: tariff.discountUntil };
  }

  // --- уроки ---
  function getLessons() {
    return data.lessons.slice().sort((a, b) => {
      if (LEVEL_ORDER[a.level] !== LEVEL_ORDER[b.level]) {
        return LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level];
      }
      return (a.order || 0) - (b.order || 0);
    });
  }

  function saveLesson(l) {
    if (l.id) {
      const old = data.lessons.find(x => x.id === l.id);
      if (old) Object.assign(old, l);
      else data.lessons.push(l);
    } else {
      l.id = "l" + Date.now().toString(36);
      data.lessons.push(l);
    }
    save();
  }

  function deleteLesson(id) {
    data.lessons = data.lessons.filter(x => x.id !== id);
    save();
  }

  // доступность урока для тарифа ученика ("" = гость)
  function lessonAvailable(lesson, learnTariff) {
    if (lesson.level === "free") return true;
    if (!learnTariff) return false;
    const t = data.tariffs.find(x => x.level === learnTariff);
    return !!t && LEVEL_ORDER[lesson.level] <= LEVEL_ORDER[t.level];
  }

  // --- заявки на обучение ---
  function addRequest(name, from) {
    data.requests.push({
      name: (name || "").trim(),
      from: from || "",
      createdAt: Date.now()
    });
    save();
  }

  function getRequests() { return data.requests.slice(); }

  function clearRequest(index) {
    data.requests.splice(index, 1);
    save();
  }

  function reset() {
    data = defaults();
    localStorage.removeItem(KEY);
  }

  return {
    load, reset,
    getTariffs, saveTariff, deleteTariff, priceNow,
    getLessons, saveLesson, deleteLesson, lessonAvailable,
    addRequest, getRequests, clearRequest,
    LEVEL_ORDER
  };
})();
