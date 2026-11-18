"use strict";

// Редактор аватара: перетаскивание + масштаб (щипок, слайдер)
// Использование: AvatarEditor.open(file, function(base64) { ... });

const AvatarEditor = (() => {

  const EXPORT_SIZE = 512;   // размер итогового квадрата
  const ZOOM_MAX = 6;        // во сколько раз можно приблизить сверх минимума

  let overlay = null, viewport = null, imgEl = null, slider = null;
  let state = null, onDone = null, objectUrl = null;

  const CSS_TEXT = `
    #avatar-editor {
      position: fixed; inset: 0; z-index: 100;
      background: rgba(0,0,0,0.92);
      display: none; flex-direction: column;
      align-items: center; justify-content: center;
      max-width: none;
    }
    #avatar-editor.show { display: flex; }
    .av-ed-top {
      color: #fff; font-size: 17px; margin-bottom: 14px;
      position: absolute; top: 24px; left: 0; right: 0; text-align: center;
    }
    .av-ed-viewport {
      position: relative; overflow: hidden;
      width: min(88vw, 420px); height: min(88vw, 420px);
      background: #000; border-radius: 12px;
      touch-action: none;
    }
    .av-ed-img {
      position: absolute; left: 0; top: 0;
      transform-origin: 0 0; user-select: none;
      -webkit-user-drag: none; pointer-events: none;
      max-width: none !important;
    }
    .av-ed-ring {
      position: absolute; left: 50%; top: 50%;
      width: 86%; height: 86%; transform: translate(-50%, -50%);
      border: 2px dashed rgba(255,255,255,0.75); border-radius: 50%;
      pointer-events: none;
    }
    .av-ed-slider {
      width: min(88vw, 420px); margin: 18px 0;
      height: 30px;
    }
    .av-ed-btns { display: flex; gap: 12px; width: min(88vw, 420px); }
    .av-ed-btns button {
      flex: 1; padding: 14px; font-size: 16px;
      border-radius: 10px; border: 1px solid #3a4d66;
      background: #243244; color: #fff;
    }
    .av-ed-btns .av-ed-ok { background: #2f6e3c; border-color: #3f8a50; }
  `;

  function ensureDom() {
    if (overlay) return;
    overlay = document.createElement("div");
    overlay.id = "avatar-editor";
    overlay.innerHTML =
      '<div class="av-ed-top">Перетащите и увеличьте фото</div>' +
      '<div class="av-ed-viewport">' +
        '<img class="av-ed-img" draggable="false" alt="">' +
        '<div class="av-ed-ring"></div>' +
      '</div>' +
      '<input type="range" class="av-ed-slider" min="0" max="1000" value="0">' +
      '<div class="av-ed-btns">' +
        '<button class="av-ed-cancel">Отмена</button>' +
        '<button class="av-ed-ok">Готово</button>' +
      '</div>';
    const style = document.createElement("style");
    style.textContent = CSS_TEXT;
    document.head.appendChild(style);
    document.body.appendChild(overlay);
    viewport = overlay.querySelector(".av-ed-viewport");
    imgEl = overlay.querySelector(".av-ed-img");
    slider = overlay.querySelector(".av-ed-slider");
    bind();
  }

  // ---------- геометрия ----------
  function viewportSize() {
    const r = viewport.getBoundingClientRect();
    return { w: r.width, h: r.height };
  }

  function minScale() {
    const v = viewportSize();
    return Math.max(v.w / imgEl.naturalWidth, v.h / imgEl.naturalHeight);
  }

  function setScale(newScale, cx, cy) {
    // cx, cy — точка (в координатах viewport), которая остаётся на месте
    const v = viewportSize();
    const px = (cx === undefined) ? v.w / 2 : cx;
    const py = (cy === undefined) ? v.h / 2 : cy;
    const k = newScale / state.scale;
    state.x = px - (px - state.x) * k;
    state.y = py - (py - state.y) * k;
    state.scale = newScale;
  }

  function clamp() {
    const v = viewportSize();
    const w = imgEl.naturalWidth * state.scale;
    const h = imgEl.naturalHeight * state.scale;
    // картинка всегда закрывает рамку целиком
    if (w <= v.w) state.x = (v.w - w) / 2;
    else state.x = Math.max(v.w - w, Math.min(0, state.x));
    if (h <= v.h) state.y = (v.h - h) / 2;
    else state.y = Math.max(v.h - h, Math.min(0, state.y));
  }

  function render() {
    imgEl.style.width = (imgEl.naturalWidth * state.scale) + "px";
    imgEl.style.height = (imgEl.naturalHeight * state.scale) + "px";
    imgEl.style.transform = "translate(" + state.x + "px," + state.y + "px)";
    const min = state.min, max = state.min * ZOOM_MAX;
    if (max > min) {
      slider.value = Math.round(1000 * (state.scale - min) / (max - min));
    }
  }

  function clampAndRender() { clamp(); render(); }

  // ---------- жесты ----------
  const pointers = new Map();
  let pinchDist = 1, pinchScaleAtStart = 1;

  function onDown(e) {
    if (!state) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const pts = [...pointers.values()];
      pinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      pinchScaleAtStart = state.scale;
    }
    viewport.setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  function onMove(e) {
    if (!state || !pointers.has(e.pointerId)) return;
    const prev = pointers.get(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const rect = viewport.getBoundingClientRect();

    if (pointers.size === 1) {
      // перетаскивание
      state.x += e.clientX - prev.x;
      state.y += e.clientY - prev.y;
    } else if (pointers.size >= 2) {
      // щипок: масштаб относительно середины между пальцами
      const pts = [...pointers.values()];
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (pinchDist > 0) {
        const cx = (pts[0].x + pts[1].x) / 2 - rect.left;
        const cy = (pts[0].y + pts[1].y) / 2 - rect.top;
        const target = Math.max(state.min,
          Math.min(state.min * ZOOM_MAX, pinchScaleAtStart * d / pinchDist));
        setScale(target, cx, cy);
      }
    }
    clampAndRender();
    e.preventDefault();
  }

  function onUp(e) {
    pointers.delete(e.pointerId);
  }

  function bind() {
    viewport.addEventListener("pointerdown", onDown);
    viewport.addEventListener("pointermove", onMove);
    viewport.addEventListener("pointerup", onUp);
    viewport.addEventListener("pointercancel", onUp);
    slider.addEventListener("input", () => {
      if (!state) return;
      const target = state.min + (state.min * ZOOM_MAX - state.min) * (slider.value / 1000);
      setScale(target);
      clampAndRender();
    });
    overlay.querySelector(".av-ed-cancel").onclick = close;
    overlay.querySelector(".av-ed-ok").onclick = confirm;
  }

  // ---------- экспорт ----------
  function confirm() {
    if (!state) { close(); return; }
    const cb = onDone;                 // сохранить ДО close, close обнуляет
    const v = viewportSize();
    const c = document.createElement("canvas");
    c.width = EXPORT_SIZE;
    c.height = EXPORT_SIZE;
    const ctx = c.getContext("2d");
    // координаты рамки → координаты исходной картинки
    const sx = -state.x / state.scale;
    const sy = -state.y / state.scale;
    const sw = v.w / state.scale;
    const sh = v.h / state.scale;
    if (![sx, sy, sw, sh].every(isFinite) || sw <= 0 || sh <= 0) {
      close();
      return;
    }
    ctx.drawImage(imgEl, sx, sy, sw, sh, 0, 0, EXPORT_SIZE, EXPORT_SIZE);
    const b64 = c.toDataURL("image/jpeg", 0.85);
    close();
    if (cb) cb(b64);
  }

  function close() {
    overlay.classList.remove("show");
    imgEl.onload = null;
    imgEl.onerror = null;
    imgEl.removeAttribute("src");
    if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; }
    state = null;
    onDone = null;
  }

  // ---------- публичный API ----------
  function open(file, done) {
    ensureDom();
    onDone = done;
    objectUrl = URL.createObjectURL(file);
    // ВАЖНО: сначала показываем overlay, и только потом измеряем рамку
    // и грузим фото — иначе все размеры равны нулю
    overlay.classList.add("show");
    state = null;
    imgEl.onload = () => {
      state = { scale: 1, min: 1, x: 0, y: 0 };
      state.min = minScale();
      if (!(state.min > 0)) state.min = 1;
      state.scale = state.min;               // старт: картинка заполняет рамку
      state.x = 0; state.y = 0;
      clampAndRender();
    };
    imgEl.onerror = () => {
      close();
      if (typeof showToast === "function") showToast("Не удалось загрузить фото");
    };
    imgEl.src = objectUrl;
  }

  return { open: open };
})();
