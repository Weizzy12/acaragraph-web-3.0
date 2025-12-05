// ========== ГЛОБАЛЬНЫЕ УТИЛИТЫ ДЛЯ ВСЕХ СТРАНИЦ ==========

/**
 * Форматирует время в читаемый вид
 * @param {string|Date} timestamp - Время для форматирования
 * @returns {string} Отформатированное время
 */
function formatTime(timestamp) {
    if (!timestamp) return '';
    
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    // Сегодня
    if (date.toDateString() === now.toDateString()) {
        if (diffMins < 1) return 'только что';
        if (diffMins < 60) return `${diffMins} мин назад`;
        return date.toLocaleTimeString('ru-RU', { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
    }
    
    // Вчера
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) {
        return `вчера ${date.toLocaleTimeString('ru-RU', { 
            hour: '2-digit', 
            minute: '2-digit' 
        })}`;
    }
    
    // На этой неделе
    if (diffDays < 7) {
        const days = ['ВС', 'ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ'];
        return `${days[date.getDay()]} ${date.toLocaleTimeString('ru-RU', { 
            hour: '2-digit', 
            minute: '2-digit' 
        })}`;
    }
    
    // Более недели назад
    return date.toLocaleDateString('ru-RU') + ' ' + 
           date.toLocaleTimeString('ru-RU', { 
               hour: '2-digit', 
               minute: '2-digit' 
           });
}

/**
 * Экранирует HTML символы для безопасности
 * @param {string} text - Текст для экранирования
 * @returns {string} Безопасный текст
 */
function escapeHtml(text) {
    if (!text) return '';
    
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Показывает уведомление
 * @param {string} message - Текст сообщения
 * @param {string} type - Тип (success, error, warning, info)
 * @param {number} duration - Длительность в миллисекундах
 */
function showNotification(message, type = 'info', duration = 5000) {
    // Создаем контейнер если нет
    let container = document.getElementById('notificationContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'notificationContainer';
        container.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 9999;
        `;
        document.body.appendChild(container);
    }
    
    // Иконки для разных типов
    const icons = {
        'success': 'fa-check-circle',
        'error': 'fa-exclamation-circle',
        'warning': 'fa-exclamation-triangle',
        'info': 'fa-info-circle'
    };
    
    // Создаем уведомление
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <i class="fas ${icons[type] || icons.info}"></i>
        <span>${message}</span>
        <button onclick="this.parentElement.remove()" 
                style="margin-left: auto; background: none; border: none; 
                       color: #AAAAAA; cursor: pointer;">
            <i class="fas fa-times"></i>
        </button>
    `;
    
    // Анимация появления
    notification.style.cssText = `
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 12px 16px;
        background: #1A1A1A;
        border-left: 4px solid;
        border-radius: 8px;
        margin-bottom: 10px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        animation: slideInRight 0.3s ease;
        min-width: 300px;
        max-width: 400px;
    `;
    
    // Цвета границ по типу
    const borderColors = {
        'success': '#00CC00',
        'error': '#FF3333',
        'warning': '#FF9900',
        'info': '#3399FF'
    };
    notification.style.borderLeftColor = borderColors[type] || '#3399FF';
    
    container.appendChild(notification);
    
    // Автоудаление
    setTimeout(() => {
        if (notification.parentNode) {
            notification.style.opacity = '0';
            notification.style.transform = 'translateX(100%)';
            notification.style.transition = 'all 0.3s';
            
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }
    }, duration);
    
    // Анимация для CSS
    if (!document.getElementById('notificationAnimations')) {
        const style = document.createElement('style');
        style.id = 'notificationAnimations';
        style.textContent = `
            @keyframes slideInRight {
                from {
                    transform: translateX(100%);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
        `;
        document.head.appendChild(style);
    }
}

/**
 * Показывает прогресс-бар
 * @param {number} percent - Процент заполнения (0-100)
 * @param {string} id - ID прогресс-бара (опционально)
 */
function showProgress(percent = 0, id = 'progressBar') {
    let progressBar = document.getElementById(id);
    if (!progressBar) {
        progressBar = document.createElement('div');
        progressBar.id = id;
        progressBar.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 4px;
            background: #1A1A1A;
            z-index: 9998;
            display: none;
        `;
        
        const progressFill = document.createElement('div');
        progressFill.id = id + 'Fill';
        progressFill.style.cssText = `
            height: 100%;
            background: linear-gradient(90deg, #FF0000, #FF3333);
            width: 0%;
            transition: width 0.3s ease;
        `;
        
        progressBar.appendChild(progressFill);
        document.body.appendChild(progressBar);
    }
    
    const progressFill = document.getElementById(id + 'Fill');
    if (progressFill) {
        progressBar.style.display = 'block';
        progressFill.style.width = Math.min(Math.max(percent, 0), 100) + '%';
        
        if (percent >= 100) {
            setTimeout(() => {
                progressBar.style.display = 'none';
            }, 500);
        }
    }
}

/**
 * Копирует текст в буфер обмена
 * @param {string} text - Текст для копирования
 * @param {string} successMessage - Сообщение при успехе
 */
function copyToClipboard(text, successMessage = 'Скопировано в буфер обмена') {
    navigator.clipboard.writeText(text)
        .then(() => {
            showNotification(successMessage, 'success');
        })
        .catch(err => {
            console.error('Ошибка копирования:', err);
            showNotification('Не удалось скопировать', 'error');
        });
}

/**
 * Проверяет соединение с сервером
 * @returns {Promise<boolean>} true если сервер доступен
 */
async function checkServerConnection() {
    try {
        const response = await fetch('/api/ping');
        const data = await response.json();
        return data.success === true;
    } catch (error) {
        console.error('❌ Ошибка соединения:', error);
        return false;
    }
}

/**
 * Форматирует число с разделителями тысяч
 * @param {number} number - Число для форматирования
 * @returns {string} Отформатированное число
 */
function formatNumber(number) {
    return number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/**
 * Получает цвет аватара на основе строки
 * @param {string} str - Строка для генерации цвета
 * @returns {string} HEX цвет
 */
function getAvatarColor(str) {
    if (!str) return '#FF0000';
    
    const colors = [
        '#FF0000', '#FF3333', '#FF6666', '#FF9999', '#FF4D4D',
        '#E60000', '#CC0000', '#B30000', '#990000', '#800000',
        '#FF1A1A', '#FF4D4D', '#FF8080', '#FFB3B3', '#FFE6E6'
    ];
    
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    return colors[Math.abs(hash) % colors.length];
}

/**
 * Валидация Telegram username
 * @param {string} username - Имя пользователя
 * @returns {Object} {valid: boolean, formatted: string, error: string}
 */
function validateTelegram(username) {
    if (!username || typeof username !== 'string') {
        return { valid: false, error: 'Введите Telegram username' };
    }
    
    let formatted = username.trim();
    
    // Добавляем @ если нет
    if (!formatted.startsWith('@')) {
        formatted = '@' + formatted;
    }
    
    // Проверка длины
    if (formatted.length < 2 || formatted.length > 32) {
        return { valid: false, error: 'Telegram должен быть от 2 до 32 символов' };
    }
    
    // Проверка допустимых символов
    const telegramRegex = /^@[a-zA-Z0-9_]{1,}$/;
    if (!telegramRegex.test(formatted)) {
        return { 
            valid: false, 
            error: 'Telegram может содержать только буквы, цифры и нижнее подчеркивание' 
        };
    }
    
    return { valid: true, formatted: formatted, error: null };
}

/**
 * Валидация ника
 * @param {string} nickname - Имя пользователя
 * @returns {Object} {valid: boolean, error: string}
 */
function validateNickname(nickname) {
    if (!nickname || typeof nickname !== 'string') {
        return { valid: false, error: 'Введите имя' };
    }
    
    const trimmed = nickname.trim();
    
    if (trimmed.length < 2) {
        return { valid: false, error: 'Имя должно быть не менее 2 символов' };
    }
    
    if (trimmed.length > 20) {
        return { valid: false, error: 'Имя должно быть не более 20 символов' };
    }
    
    // Запрещенные символы
    const forbiddenChars = /[<>{}[\]\\|]/;
    if (forbiddenChars.test(trimmed)) {
        return { valid: false, error: 'Имя содержит запрещенные символы' };
    }
    
    return { valid: true, error: null };
}

/**
 * Валидация сообщения
 * @param {string} text - Текст сообщения
 * @returns {Object} {valid: boolean, cleaned: string, error: string}
 */
function validateMessage(text) {
    if (!text || typeof text !== 'string') {
        return { valid: false, error: 'Сообщение не может быть пустым' };
    }
    
    const trimmed = text.trim();
    
    if (trimmed.length === 0) {
        return { valid: false, error: 'Сообщение не может быть пустым' };
    }
    
    if (trimmed.length > 2000) {
        return { 
            valid: false, 
            error: 'Сообщение слишком длинное (максимум 2000 символов)' 
        };
    }
    
    // Очистка от HTML тегов
    const cleaned = trimmed
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    
    return { 
        valid: true, 
        cleaned: cleaned,
        error: null,
        length: cleaned.length
    };
}

/**
 * Генерирует случайный инвайт-код
 * @param {string} prefix - Префикс кода (USER, ADMIN и т.д.)
 * @returns {string} Сгенерированный код
 */
function generateInviteCode(prefix = 'USER') {
    const timestamp = Date.now().toString(36).slice(-4).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${prefix}-${timestamp}${random}`;
}

/**
 * Проверяет формат инвайт-кода
 * @param {string} code - Код для проверки
 * @returns {boolean} true если формат правильный
 */
function validateCodeFormat(code) {
    if (!code || typeof code !== 'string') return false;
    
    const codeRegex = /^[A-Z]{3,}-[A-Z0-9]{3,}$/;
    return codeRegex.test(code.toUpperCase());
}

/**
 * Сохраняет данные в localStorage с обработкой ошибок
 * @param {string} key - Ключ
 * @param {any} value - Значение
 */
function saveToStorage(key, value) {
    try {
        const serialized = JSON.stringify(value);
        localStorage.setItem(key, serialized);
        return true;
    } catch (error) {
        console.error('❌ Ошибка сохранения в localStorage:', error);
        showNotification('Ошибка сохранения настроек', 'error');
        return false;
    }
}

/**
 * Загружает данные из localStorage с обработкой ошибок
 * @param {string} key - Ключ
 * @param {any} defaultValue - Значение по умолчанию
 */
function loadFromStorage(key, defaultValue = null) {
    try {
        const serialized = localStorage.getItem(key);
        if (serialized === null) return defaultValue;
        return JSON.parse(serialized);
    } catch (error) {
        console.error('❌ Ошибка загрузки из localStorage:', error);
        return defaultValue;
    }
}

/**
 * Удаляет данные из localStorage
 * @param {string} key - Ключ
 */
function removeFromStorage(key) {
    try {
        localStorage.removeItem(key);
        return true;
    } catch (error) {
        console.error('❌ Ошибка удаления из localStorage:', error);
        return false;
    }
}

/**
 * Проверяет поддержку WebSocket в браузере
 * @returns {boolean} true если WebSocket поддерживается
 */
function isWebSocketSupported() {
    return 'WebSocket' in window || 'MozWebSocket' in window;
}

/**
 * Проверяет видимость страницы (Page Visibility API)
 * @returns {boolean} true если страница видна
 */
function isPageVisible() {
    return !document.hidden;
}

/**
 * Добавляет слушатель видимости страницы
 * @param {Function} callback - Функция обратного вызова
 */
function addVisibilityListener(callback) {
    document.addEventListener('visibilitychange', callback);
}

/**
 * Открывает модальное окно
 * @param {string} modalId - ID модального окна
 */
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'block';
        document.body.style.overflow = 'hidden';
        
        // Анимация появления
        modal.style.animation = 'fadeIn 0.3s';
    }
}

/**
 * Закрывает модальное окно
 * @param {string} modalId - ID модального окна
 */
function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
    }
}

/**
 * Создает анимацию частиц
 * @param {HTMLElement} container - Контейнер для частиц
 * @param {number} count - Количество частиц
 */
function createParticles(container, count = 8) {
    if (!container) return;
    
    for (let i = 0; i < count; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        particle.style.cssText = `
            position: absolute;
            width: ${Math.random() * 100 + 50}px;
            height: ${Math.random() * 100 + 50}px;
            background: radial-gradient(circle, rgba(255, 0, 0, 0.1) 0%, transparent 70%);
            border-radius: 50%;
            animation: float ${Math.random() * 20 + 10}s infinite ease-in-out;
            animation-delay: ${Math.random() * 5}s;
            opacity: ${Math.random() * 0.3 + 0.1};
            top: ${Math.random() * 100}%;
            left: ${Math.random() * 100}%;
        `;
        
        container.appendChild(particle);
    }
}

/**
 * Проверяет, является ли пользователь администратором
 * @param {Object} user - Объект пользователя
 * @returns {boolean} true если админ
 */
function isAdmin(user) {
    return user && (user.role === 'admin' || user.role === 'super_admin');
}

/**
 * Получает иконку роли пользователя
 * @param {string} role - Роль пользователя
 * @returns {string} HTML иконки
 */
function getRoleIcon(role) {
    switch (role) {
        case 'super_admin':
            return '<i class="fas fa-crown" style="color: #FFD700;"></i>';
        case 'admin':
            return '<i class="fas fa-crown"></i>';
        case 'user':
            return '<i class="fas fa-user"></i>';
        default:
            return '<i class="fas fa-user"></i>';
    }
}

/**
 * Дебаг функция для вывода информации
 */
function debugInfo() {
    console.log('=== ACARAGRAPH DEBUG ===');
    console.log('User Agent:', navigator.userAgent);
    console.log('LocalStorage size:', JSON.stringify(localStorage).length, 'bytes');
    console.log('Screen:', window.screen.width + 'x' + window.screen.height);
    console.log('Online:', navigator.onLine);
    console.log('========================');
}

// ========== ЭКСПОРТ ФУНКЦИЙ В ГЛОБАЛЬНУЮ ОБЛАСТЬ ВИДИМОСТИ ==========
window.formatTime = formatTime;
window.escapeHtml = escapeHtml;
window.showNotification = showNotification;
window.showProgress = showProgress;
window.copyToClipboard = copyToClipboard;
window.checkServerConnection = checkServerConnection;
window.formatNumber = formatNumber;
window.getAvatarColor = getAvatarColor;
window.validateTelegram = validateTelegram;
window.validateNickname = validateNickname;
window.validateMessage = validateMessage;
window.generateInviteCode = generateInviteCode;
window.validateCodeFormat = validateCodeFormat;
window.saveToStorage = saveToStorage;
window.loadFromStorage = loadFromStorage;
window.removeFromStorage = removeFromStorage;
window.isWebSocketSupported = isWebSocketSupported;
window.isPageVisible = isPageVisible;
window.addVisibilityListener = addVisibilityListener;
window.openModal = openModal;
window.closeModal = closeModal;
window.createParticles = createParticles;
window.isAdmin = isAdmin;
window.getRoleIcon = getRoleIcon;
window.debugInfo = debugInfo;

// ========== ГЛОБАЛЬНЫЕ ОБРАБОТЧИКИ ==========

// Закрытие модальных окон при клике вне их
document.addEventListener('DOMContentLoaded', function() {
    window.onclick = function(event) {
        const modals = document.querySelectorAll('.modal');
        modals.forEach(modal => {
            if (event.target === modal) {
                modal.style.display = 'none';
                document.body.style.overflow = 'auto';
            }
        });
    };
    
    // Закрытие по Escape
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            const modals = document.querySelectorAll('.modal');
            modals.forEach(modal => {
                if (modal.style.display === 'block') {
                    modal.style.display = 'none';
                    document.body.style.overflow = 'auto';
                }
            });
        }
    });
});

// Анимации CSS (добавляем если нет)
if (!document.getElementById('globalAnimations')) {
    const style = document.createElement('style');
    style.id = 'globalAnimations';
    style.textContent = `
        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }
        
        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }
        
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
        
        .loading-spinner {
            width: 40px;
            height: 40px;
            border: 4px solid rgba(255, 0, 0, 0.1);
            border-top-color: #FF0000;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin: 0 auto 20px;
        }
    `;
    document.head.appendChild(style);
}

console.log('✅ script.js загружен - все утилиты доступны');
