"use strict";

// Чат PRO.AI на общей базе (Firestore).
// Сообщения приходят на все устройства в реальном времени.
// Модерация (удаление сообщений и мут) — для админа и разработчиков.

const Chat = (() => {

  const SDK_LIMIT = 100;          // сколько последних сообщений подтягиваем
  const SEND_INTERVAL = 2000;     // пауза между сообщениями, мс

  // --- каналы (структура фиксированная) ---
  const CHANNELS = [
    { id: "general", name: "💬 Общий", forAll: true },
    { id: "learn",   name: "🎓 Обучение", forAll: true },
    { id: "dev",     name: "🛠 Разработка", forAll: false }  // только админ и разработчики
  ];

  // ---------- личность игрока ----------
  // Telegram передаёт настоящий id; в браузере — случайный постоянный id.

  function tgData() {
    try {
      const w = window.Telegram;
      if (w && w.WebApp && w.WebApp.initDataUnsafe && w.WebApp.initDataUnsafe.user) {
        return w.WebApp.initDataUnsafe.user;
      }
    } catch (e) {}
    return null;
  }

  function myId() {
    const tg = tgData();
    if (tg) return "tg_" + tg.id;
    let id = localStorage.getItem("proai_chat_uid");
    if (!id) {
      id = "web_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      localStorage.setItem("proai_chat_uid", id);
    }
    return id;
  }

  function myName() {
    const a = (typeof Account !== "undefined") && Account.data;
    if (a && a.playerName) return a.playerName;
    const tg = tgData();
    if (tg && tg.username) return "@" + tg.username;
    if (tg && (tg.first_name || tg.last_name)) {
      return ((tg.first_name || "") + " " + (tg.last_name || "")).trim();
    }
    return "Игрок";
  }

  function identity() {
    return { id: myId(), name: myName() };
  }

  function canModerate() {
    return typeof Account !== "undefined" && Account.isDeveloper();
  }

  // ---------- каналы ----------

  function channels() {
    const dev = canModerate();
    return CHANNELS.filter(c => c.forAll || dev);
  }

  // ---------- сообщения ----------

  let lastSendAt = 0;

  async function send(channelId, text) {
    const now = Date.now();
    if (now - lastSendAt < SEND_INTERVAL) {
      throw new Error("Слишком часто. Подождите пару секунд.");
    }
    const mute = await getMyMute();
    if (mute) {
      throw new Error(mute.forever
        ? "Вы заблокированы в чате навсегда."
        : "Вы в муте до " + new Date(mute.until).toLocaleTimeString());
    }
    const t = (text || "").trim();
    if (!t) throw new Error("Пустое сообщение");
    if (t.length > 500) throw new Error("Максимум 500 символов");

    await Firebase.ready;
    lastSendAt = now;
    await Firebase.db.collection("chat_" + channelId).add({
      from: myId(),
      name: myName(),
      text: t,
      created: firebase.firestore.FieldValue.serverTimestamp()
    });
  }

  // живая подписка: новые сообщения прилетают сами, cb получает массив
  function watchMessages(channelId, cb) {
    let unsub = null;
    Firebase.ready.then(() => {
      unsub = Firebase.db
        .collection("chat_" + channelId)
        .orderBy("created")
        .limitToLast(SDK_LIMIT)
        .onSnapshot(snap => {
          const rows = [];
          snap.forEach(doc => {
            const m = doc.data();
            rows.push({
              id: doc.id,
              from: m.from,
              name: m.name,
              text: m.text,
              created: m.created ? m.created.toMillis() : 0,
              mine: m.from === myId()
            });
          });
          cb(rows);
        }, err => {
          console.error(err);
          cb([]);
        });
    });
    return () => { if (unsub) unsub(); };
  }

  async function deleteMessage(channelId, msgId) {
    await Firebase.ready;
    await Firebase.db.collection("chat_" + channelId).doc(msgId).delete();
  }

  // ---------- муты ----------

  // hours: 1 | 24 | 0 = навсегда
  async function mute(userId, hours, byName) {
    await Firebase.ready;
    await Firebase.db.collection("chat_mutes").doc(userId).set({
      forever: hours === 0,
      until: hours === 0 ? 0 : Date.now() + hours * 3600000,
      by: byName || "",
      at: Date.now()
    });
  }

  async function unmute(userId) {
    await Firebase.ready;
    await Firebase.db.collection("chat_mutes").doc(userId).delete();
  }

  async function getMute(userId) {
    await Firebase.ready;
    const doc = await Firebase.db.collection("chat_mutes").doc(userId).get();
    if (!doc.exists) return null;
    const m = doc.data();
    if (!m.forever && (!m.until || m.until < Date.now())) {
      // мут истёк — чистим
      Firebase.db.collection("chat_mutes").doc(userId).delete().catch(() => {});
      return null;
    }
    return m;
  }

  async function getMyMute() {
    return getMute(myId());
  }

  return {
    identity, canModerate, channels,
    send, watchMessages, deleteMessage,
    mute, unmute, getMute
  };
})();
