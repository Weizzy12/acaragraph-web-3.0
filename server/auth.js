const { get, run, logEvent } = require('./database');

// ========== ПРОВЕРКА ПРАВ ПОЛЬЗОВАТЕЛЕЙ ==========

/**
 * Проверяет, является ли пользователь администратором
 * @param {number} userId - ID пользователя
 * @returns {Promise<boolean>} - true если админ
 */
async function checkAdmin(userId) {
  try {
    // Если нет ID, сразу false
    if (!userId || isNaN(userId)) {
      console.log('⚠️ checkAdmin: Неверный userId');
      return false;
    }

    console.log(`🔍 Проверка админа ID: ${userId}`);

    // Получаем данные пользователя
    const user = await get(
      "SELECT role, is_banned FROM users WHERE id = ?",
      [userId]
    );

    if (!user) {
      console.log(`⚠️ Пользователь ${userId} не найден`);
      return false;
    }

    // Проверяем бан
    if (user.is_banned) {
      console.log(`🚫 Пользователь ${userId} забанен`);
      return false;
    }

    // Проверяем роль (админ ИЛИ супер-админ)
    const isAdmin = user.role === 'admin' || user.role === 'super_admin';
    
    console.log(`✅ Роль пользователя ${userId}: ${user.role}, админ: ${isAdmin}`);
    
    // Логируем проверку прав
    if (isAdmin) {
      await logEvent(
        userId, 
        'admin_check', 
        `Проверка прав администратора - доступ разрешен`,
        'system'
      );
    }

    return isAdmin;

  } catch (error) {
    console.error(`❌ Ошибка проверки админа (ID: ${userId}):`, error);
    return false;
  }
}

/**
 * Проверяет, является ли пользователь супер-администратором
 * @param {number} userId - ID пользователя
 * @returns {Promise<boolean>} - true если супер-админ
 */
async function checkSuperAdmin(userId) {
  try {
    if (!userId) return false;

    const user = await get(
      "SELECT role, is_banned FROM users WHERE id = ?",
      [userId]
    );

    if (!user || user.is_banned) return false;

    const isSuperAdmin = user.role === 'super_admin';
    
    if (isSuperAdmin) {
      console.log(`👑👑👑 Супер-админ обнаружен: ID ${userId}`);
      await logEvent(
        userId,
        'super_admin_check',
        'Проверка прав супер-администратора',
        'system'
      );
    }

    return isSuperAdmin;

  } catch (error) {
    console.error('❌ Ошибка проверки супер-админа:', error);
    return false;
  }
}

/**
 * Проверяет права пользователя на действие
 * @param {number} userId - ID пользователя
 * @param {string} permission - Требуемое право
 * @returns {Promise<boolean>} - true если есть право
 */
async function checkPermission(userId, permission) {
  try {
    if (!userId || !permission) return false;

    const user = await get(
      "SELECT role, is_banned FROM users WHERE id = ?",
      [userId]
    );

    if (!user || user.is_banned) return false;

    // Матрица прав для каждой роли
    const permissions = {
      super_admin: [
        'all', 'admin.*', 'user.*', 'message.*', 'code.*',
        'ban_user', 'unban_user', 'mute_user', 'unmute_user',
        'make_admin', 'remove_admin', 'delete_message',
        'view_logs', 'system_settings', 'create_codes'
      ],
      admin: [
        'user.view', 'user.manage', 'message.delete',
        'ban_user', 'mute_user', 'view_stats',
        'create_codes', 'deactivate_codes'
      ],
      user: [
        'send_message', 'edit_profile', 'view_users'
      ],
      guest: [
        'view_messages', 'send_message'  // с ограничениями
      ]
    };

    // Получаем права для роли пользователя
    const userPermissions = permissions[user.role] || permissions['guest'];
    
    // Проверяем специальные случаи
    if (permission === 'all') {
      return user.role === 'super_admin';
    }

    if (permission.includes('.*')) {
      const prefix = permission.split('.*')[0];
      return userPermissions.some(p => p.startsWith(prefix) || p === 'all');
    }

    // Проверяем конкретное право
    const hasPermission = userPermissions.includes(permission);
    
    if (!hasPermission) {
      console.log(`🚫 У пользователя ${userId} нет права: ${permission}`);
      await logEvent(
        userId,
        'permission_denied',
        `Отказано в доступе: ${permission}`,
        'system'
      );
    }

    return hasPermission;

  } catch (error) {
    console.error('❌ Ошибка проверки прав:', error);
    return false;
  }
}

// ========== ПРОВЕРКА СТАТУСА ПОЛЬЗОВАТЕЛЯ ==========

/**
 * Проверяет статус пользователя (бан, мут)
 * @param {number} userId - ID пользователя
 * @returns {Promise<Object>} - { canSend: boolean, reason: string }
 */
async function checkUserStatus(userId) {
  try {
    if (!userId) {
      return { 
        canSend: false, 
        reason: 'Пользователь не найден' 
      };
    }

    console.log(`🔍 Проверка статуса пользователя ID: ${userId}`);

    const user = await get(
      "SELECT is_banned, muted_until, role FROM users WHERE id = ?",
      [userId]
    );

    if (!user) {
      console.log(`⚠️ Пользователь ${userId} не найден при проверке статуса`);
      return { 
        canSend: false, 
        reason: 'Пользователь не найден' 
      };
    }

    // Проверка бана
    if (user.is_banned) {
      console.log(`🚫 Пользователь ${userId} забанен`);
      await logEvent(
        userId,
        'banned_user_tried_send',
        'Забаненный пользователь попытался отправить сообщение',
        'system'
      );
      return { 
        canSend: false, 
        reason: '🚫 Вы забанены и не можете отправлять сообщения' 
      };
    }

    // Проверка мута
    if (user.muted_until) {
      const muteUntil = new Date(user.muted_until);
      const now = new Date();
      
      if (muteUntil > now) {
        const minutesLeft = Math.ceil((muteUntil - now) / (1000 * 60));
        console.log(`🔇 Пользователь ${userId} замьючен на ${minutesLeft} минут`);
        
        return { 
          canSend: false, 
          reason: `🔇 Вы замьючены. Можно будет писать через ${minutesLeft} минут` 
        };
      } else {
        // Мут истек - очищаем
        await run(
          "UPDATE users SET muted_until = NULL WHERE id = ?",
          [userId]
        );
        console.log(`✅ Мут пользователя ${userId} истек и очищен`);
      }
    }

    // Супер-админы и админы всегда могут отправлять
    if (user.role === 'super_admin' || user.role === 'admin') {
      return { canSend: true };
    }

    // Для обычных пользователей - все ок
    return { canSend: true };

  } catch (error) {
    console.error('❌ Ошибка проверки статуса:', error);
    return { 
      canSend: false, 
      reason: 'Ошибка проверки статуса. Попробуйте позже.' 
    };
  }
}

/**
 * Обновляет время последней активности пользователя
 * @param {number} userId - ID пользователя
 */
async function updateUserActivity(userId) {
  try {
    if (!userId) return;

    await run(
      "UPDATE users SET last_seen = CURRENT_TIMESTAMP WHERE id = ?",
      [userId]
    );

  } catch (error) {
    console.error('❌ Ошибка обновления активности:', error);
  }
}

/**
 * Изменяет статус пользователя (online, offline, away)
 * @param {number} userId - ID пользователя
 * @param {string} status - Новый статус
 */
async function setUserStatus(userId, status = 'offline') {
  try {
    if (!userId || !['online', 'offline', 'away'].includes(status)) return;

    await run(
      "UPDATE users SET status = ?, last_seen = CURRENT_TIMESTAMP WHERE id = ?",
      [status, userId]
    );

    console.log(`📊 Статус пользователя ${userId} изменен на: ${status}`);

  } catch (error) {
    console.error('❌ Ошибка изменения статуса:', error);
  }
}

// ========== ВАЛИДАЦИЯ ДАННЫХ ==========

/**
 * Валидация имени пользователя
 * @param {string} nickname - Имя для проверки
 * @returns {Object} - { valid: boolean, error: string }
 */
function validateNickname(nickname) {
  if (!nickname || typeof nickname !== 'string') {
    return { valid: false, error: 'Имя не может быть пустым' };
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
 * Валидация Telegram username
 * @param {string} username - Telegram для проверки
 * @returns {Object} - { valid: boolean, error: string }
 */
function validateTelegram(username) {
  if (!username || typeof username !== 'string') {
    return { valid: false, error: 'Telegram не может быть пустым' };
  }

  // Форматируем если нужно
  let formatted = username.trim();
  if (!formatted.startsWith('@')) {
    formatted = '@' + formatted;
  }

  if (formatted.length < 2) {
    return { valid: false, error: 'Некорректный Telegram' };
  }

  if (formatted.length > 32) {
    return { valid: false, error: 'Telegram слишком длинный' };
  }

  // Разрешенные символы в Telegram
  const telegramRegex = /^@[a-zA-Z0-9_]{1,}$/;
  if (!telegramRegex.test(formatted)) {
    return { 
      valid: false, 
      error: 'Telegram может содержать только буквы, цифры и нижнее подчеркивание' 
    };
  }

  return { valid: true, error: null, formatted: formatted };
}

/**
 * Валидация сообщения
 * @param {string} text - Текст сообщения
 * @returns {Object} - { valid: boolean, error: string, cleaned: string }
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

  // Очистка от потенциально опасных тегов (базовая защита от XSS)
  const cleaned = trimmed
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  return { 
    valid: true, 
    error: null, 
    cleaned: cleaned,
    length: cleaned.length
  };
}

// ========== ГЕНЕРАЦИЯ КОДОВ ==========

/**
 * Генерирует случайный инвайт-код
 * @param {string} type - Тип кода (user, admin, super_admin, guest)
 * @returns {string} - Сгенерированный код
 */
function generateInviteCode(type = 'user') {
  const prefix = type.toUpperCase().substring(0, 3);
  const timestamp = Date.now().toString(36).slice(-4).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  
  return `${prefix}-${timestamp}${random}`;
}

/**
 * Проверяет формат кода
 * @param {string} code - Код для проверки
 * @returns {boolean} - true если формат корректный
 */
function validateCodeFormat(code) {
  if (!code || typeof code !== 'string') return false;
  
  // Формат: XXX-XXXXXX (например: USR-ABC123, ADM-DEF456)
  const codeRegex = /^[A-Z]{3}-[A-Z0-9]{6}$/;
  return codeRegex.test(code);
}

// ========== ЛОГИРОВАНИЕ БЕЗОПАСНОСТИ ==========

/**
 * Логирует попытку входа
 * @param {number} userId - ID пользователя
 * @param {boolean} success - Успешность входа
 * @param {string} ip - IP адрес
 * @param {string} userAgent - User Agent браузера
 */
async function logLoginAttempt(userId, success, ip = '', userAgent = '') {
  try {
    const eventType = success ? 'login_success' : 'login_failed';
    const description = success 
      ? 'Успешный вход в систему' 
      : 'Неудачная попытка входа';

    await logEvent(userId, eventType, description, ip, userAgent);

  } catch (error) {
    console.error('❌ Ошибка логирования входа:', error);
  }
}

/**
 * Логирует подозрительную активность
 * @param {number} userId - ID пользователя
 * @param {string} activity - Описание активности
 * @param {string} details - Детали
 */
async function logSuspiciousActivity(userId, activity, details = '') {
  try {
    await logEvent(
      userId,
      'suspicious_activity',
      `${activity}: ${details}`,
      'security_system'
    );
    
    console.warn(`⚠️ Подозрительная активность от пользователя ${userId}: ${activity}`);

  } catch (error) {
    console.error('❌ Ошибка логирования подозрительной активности:', error);
  }
}

// ========== ЭКСПОРТ ВСЕХ ФУНКЦИЙ ==========

module.exports = {
  // Проверка прав
  checkAdmin,
  checkSuperAdmin,
  checkPermission,
  
  // Проверка статуса
  checkUserStatus,
  updateUserActivity,
  setUserStatus,
  
  // Валидация
  validateNickname,
  validateTelegram,
  validateMessage,
  validateCodeFormat,
  
  // Генерация кодов
  generateInviteCode,
  
  // Логирование безопасности
  logLoginAttempt,
  logSuspiciousActivity,
  logEvent
};