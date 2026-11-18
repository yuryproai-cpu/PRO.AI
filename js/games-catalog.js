"use strict";

// Каталог игр платформы PRO.AI.
// Два раздела: официальные игры (публикует админ и разработчики)
// и ученические (публикуются только после одобрения админом).
// Позже этот файл сможет тянуть каталог с сервера — интерфейс не меняется.

const GamesCatalog = (() => {
  const KEY = "proai_games";

  let data = { official: [], student: [] };

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        data = {
          official: Array.isArray(parsed.official) ? parsed.official : [],
          student: Array.isArray(parsed.student) ? parsed.student : []
        };
      } else {
        save();   // создаём пустой каталог
      }
      return true;
    } catch (e) {
      data = { official: [], student: [] };
      return false;
    }
  }

  function save() {
    localStorage.setItem(KEY, JSON.stringify(data));
  }

  function makeId() {
    return "g" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  // --- официальные игры ---
  function getOfficial() {
    return data.official.slice();
  }

  function addOfficial(game) {
    const entry = {
      id: makeId(),
      title: (game.title || "").trim(),
      icon: game.icon || "",
      description: (game.description || "").trim(),
      author: (game.author || "PRO.AI").trim(),
      linkTelegram: game.linkTelegram || "",
      linkMarket: game.linkMarket || "",
      createdAt: Date.now()
    };
    data.official.push(entry);
    save();
    return entry;
  }

  // --- игры учеников (с модерацией) ---
  function getStudent() {
    return data.student.slice();
  }

  function getStudentApproved() {
    return data.student.filter(g => g.status === "approved");
  }

  function getStudentPending() {
    return data.student.filter(g => g.status === "pending");
  }

  // ученик предлагает игру: уходит в очередь модерации
  function proposeStudent(game) {
    const entry = {
      id: makeId(),
      title: (game.title || "").trim(),
      icon: game.icon || "",
      description: (game.description || "").trim(),
      author: (game.author || "Ученик PRO.AI").trim(),
      linkTelegram: game.linkTelegram || "",
      linkMarket: game.linkMarket || "",
      status: "pending",          // pending → approved | rejected
      createdAt: Date.now()
    };
    data.student.push(entry);
    save();
    return entry;
  }

  // решение админа по игре ученика
  function moderate(id, decision) {
    const g = data.student.find(x => x.id === id);
    if (!g) return false;
    g.status = decision === "approve" ? "approved" : "rejected";
    save();
    return true;
  }

  function remove(gameId) {
    const before = data.official.length + data.student.length;
    data.official = data.official.filter(g => g.id !== gameId);
    data.student = data.student.filter(g => g.id !== gameId);
    const changed = data.official.length + data.student.length !== before;
    if (changed) save();
    return changed;
  }

  function reset() {
    data = { official: [], student: [] };
    localStorage.removeItem(KEY);
  }

  return {
    load, reset, remove,
    getOfficial, addOfficial,
    getStudent, getStudentApproved, getStudentPending, proposeStudent, moderate
  };
})();
