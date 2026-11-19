"use strict";

// Сплэш-экран с логотипом PRO.AI при запуске приложения.
// Пульсация логотипа, «сердцебиение», автопереход через 4.5 сек,
// пропуск по тапу. Адаптировано для платформы: без зависимости от модуля Game.

window.Logo = {

    init: function() {
        this.startSequence();
    },

    startSequence: function() {

        let gameStarted = false;

        const start = () => {

            if (gameStarted) return;
            gameStarted = true;

            const splash = document.getElementById('splash');
            if (!splash || !splash.classList.contains('active')) return;

            // Плавно скрываем логотип
            splash.style.opacity = '0';

            setTimeout(() => {
                splash.classList.remove('active');
                splash.style.display = 'none';
                // Дальше приложение уже работает под шторкой:
                // app.js сам показал нужный экран (лобби или вход)
            }, 1000);
        };

        // Запускаем пульсацию логотипа
        const logo = document.getElementById('logo');
        if (logo) logo.classList.add('play');
        this.playHeartbeatSequence();

        // Автоматический переход через 4.5 секунды
        const splashTimeout = setTimeout(start, 4500);

        // Пропуск при клике
        const splashEl = document.getElementById('splash');
        if (splashEl) splashEl.addEventListener('pointerdown', () => {
            clearTimeout(splashTimeout);
            start();
        });
    },

    playHeartbeatSequence: function() {
        try {
            // свой аудиоконтекст (в браузерах звук включается после жеста —
            // если заблокирован, тишину просто пропускаем)
            if (!this._ctx) {
                const AC = window.AudioContext || window.webkitAudioContext;
                if (!AC) return;
                this._ctx = new AC();
            }
            if (this._ctx.state === 'suspended') this._ctx.resume();
            const now = this._ctx.currentTime;
            for (let i = 0; i < 4; i++) {
                this.playThump(now + i * 1.2);
                this.playThump(now + i * 1.2 + 0.25);
            }
        } catch (e) {}
    },

    playThump: function(time) {
        try {
            const osc = this._ctx.createOscillator();
            const gain = this._ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(150, time);
            osc.frequency.exponentialRampToValueAtTime(40, time + 0.15);
            gain.gain.setValueAtTime(0, time);
            gain.gain.linearRampToValueAtTime(0.8, time + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, time + 0.2);
            osc.connect(gain).connect(this._ctx.destination);
            osc.start(time);
            osc.stop(time + 0.25);
        } catch (e) {}
    }
};

document.addEventListener("DOMContentLoaded", () => window.Logo.init());
