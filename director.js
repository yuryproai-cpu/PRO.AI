// director.js

// Настройки наших медиафайлов
const videoSource = 'splash.mp4'; // Ваше видео (должно быть БЕЗ звука!)
const audioSource = 'splash.mp3'; // Ваш звук (отдельный файл)

const stage = document.getElementById('stage');
const startScreen = document.getElementById('startScreen');

// 1. Создаем элементы в памяти (они еще не в HTML)
const videoEl = document.createElement('video');
videoEl.src = videoSource;
videoEl.playsInline = true;
videoEl.muted = true; // Обязательно для автозапуска без клика
videoEl.style.display = 'none'; // Прячем от глаз

const audioEl = document.createElement('audio');
audioEl.src = audioSource;
audioEl.preload = 'auto';

let isReady = false;

// 2. Ждем, пока ОБА файла будут готовы к плавному воспроизведению
let videoReady = false;
let audioReady = false;

function checkReady() {
    if (videoReady && audioReady) {
        isReady = true;
        console.log("Режиссер: Видео и звук загружены. Готов к работе.");
    }
}

videoEl.addEventListener('canplaythrough', () => { videoReady = true; checkReady(); }, { once: true });
audioEl.addEventListener('canplaythrough', () => { audioReady = true; checkReady(); }, { once: true });

// 3. Действие при клике на экран старта
startScreen.addEventListener('click', () => {
    if (!isReady) {
        console.log("Подождите, идет загрузка...");
        return; 
    }

    // Прячем кнопку старта
    startScreen.style.display = 'none';

    // Выводим видео на сцену
    videoEl.style.display = 'block';
    stage.appendChild(videoEl);

    // Включаем звук видео на 0 (мы будем использовать отдельный аудиопоток)
    videoEl.volume = 0; 
    
    // Начинаем воспроизведение видео
    videoEl.play().then(() => {
        // Как только видео пошло, показываем его (убираем opacity 0)
        setTimeout(() => videoEl.classList.add('ready'), 50);

        // Запускаем аудио СТРОГО в тот же момент
        audioEl.currentTime = videoEl.currentTime;
        audioEl.play();
    }).catch(e => console.error("Ошибка видео:", e));
});

// 4. СИНХРОНИЗАЦИЯ (Самое важное)
// Если видео вдруг буферизуется (зависнет), ставим аудио на паузу
videoEl.addEventListener('waiting', () => audioEl.pause());
// Когда видео снова готово играть, запускаем аудио
videoEl.addEventListener('playing', () => audioEl.play());

// 5. Конец видео
videoEl.addEventListener('ended', () => {
    audioEl.pause();
    stage.innerHTML = "<h1 style='color:white;'>Экран 2: Как тебя зовут?</h1>";
});