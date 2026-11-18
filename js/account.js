"use strict";

// Аккаунт платформы PRO.AI.
// login  — служебное поле: ник Telegram или e-mail. НИГДЕ не показывается.
// avatar — аватар профиля платформы.
// playerName — добровольное имя в лобби. Пустое = не показываем.
// role — уровень доступа платформы, выдаёт только админ:
//   "guest" / "student" / "developer" / "admin"
// learnTariff — тариф обучения, выдаёт только админ:
//   "" | "book" | "video" | "pro"

const Account = (() => {
  const KEY = "proai_account";
  const ROLES = ["guest", "student", "developer", "admin"];
  const LEARN_TARIFFS = ["", "book", "video", "pro"];
  let data = null;

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.provider) return false;
      data = {
        provider: parsed.provider,
        login: parsed.login || "",
        playerName: parsed.playerName || "",
        avatar: parsed.avatar || "",
        role: ROLES.includes(parsed.role) ? parsed.role : "guest",
        learnTariff: LEARN_TARIFFS.includes(parsed.learnTariff) ? parsed.learnTariff : ""
      };
      return true;
    } catch (e) {
      return false;
    }
  }

  function save() {
    localStorage.setItem(KEY, JSON.stringify(data));
  }

  // Заглушка: provider "telegram" | "google" | "admin-test".
  function create(provider, login, role) {
    data = {
      provider: provider,
      login: login || "",
      playerName: "",
      avatar: "",
      role: ROLES.includes(role) ? role : "guest",
      learnTariff: ""
    };
    save();
  }

  function setPlayerName(name) {
    if (!data) return;
    data.playerName = (name || "").trim();
    save();
  }

  function setAvatar(avatar) {
    if (!data) return;
    data.avatar = avatar || "";
    save();
  }

  function setRole(role) {
    if (!data || !ROLES.includes(role)) return;
    data.role = role;
    save();
  }

  function setLearnTariff(tariff) {
    if (!data || !LEARN_TARIFFS.includes(tariff)) return;
    data.learnTariff = tariff;
    save();
  }

  function isAdmin() { return !!data && data.role === "admin"; }
  function isDeveloper() { return !!data && (data.role === "developer" || data.role === "admin"); }
  function isStudent() { return !!data && (data.role === "student" || isDeveloper()); }

  function providerLabel() {
    if (!data) return "";
    if (data.provider === "telegram") return "Telegram";
    if (data.provider === "google") return "Google";
    return "Тест";
  }

  function reset() {
    localStorage.removeItem(KEY);
    data = null;
  }

  return {
    load, create, setPlayerName, setAvatar, setRole, setLearnTariff, reset,
    isAdmin, isDeveloper, isStudent, providerLabel,
    get data() { return data; }
  };
})();
