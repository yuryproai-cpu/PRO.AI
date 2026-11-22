'use strict';

// Модуль подключения к общей базе PRO.AI (Firebase Firestore).
// SDK подгружается динамически с CDN — index.html менять не нужно.
// Все остальные модули ждут Firebase.ready перед обращением к базе.
// v0.2.6: добавлен модуль firebase-auth-compat.js — для входа через
// охранника (signInWithCustomToken).

const Firebase = (() => {

  const firebaseConfig = {
    apiKey: "AIzaSyDSo2Y9jgl9IPjW1ogldMIpxpB_pYyTdx0",
    authDomain: "proai-6a4a6.firebaseapp.com",
    projectId: "proai-6a4a6",
    storageBucket: "proai-6a4a6.firebasestorage.app",
    messagingSenderId: "727660529874",
    appId: "1:727660529874:web:f821b6ae5ae9085e70c50b"
  };

  let _db = null;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Не удалось загрузить " + src));
      document.head.appendChild(s);
    });
  }

  const SDK = "https://www.gstatic.com/firebasejs/10.14.1";

  const ready = loadScript(SDK + "/firebase-app-compat.js")
    .then(() => loadScript(SDK + "/firebase-auth-compat.js"))
    .then(() => loadScript(SDK + "/firebase-firestore-compat.js"))
    .then(() => {
      firebase.initializeApp(firebaseConfig);
      _db = firebase.firestore();
    })
    .catch(err => {
      console.error(err);
      if (typeof showToast === "function") showToast("Нет связи с сервером");
      throw err;
    });

  return {
    ready: ready,
    get db() { return _db; }
  };

})();