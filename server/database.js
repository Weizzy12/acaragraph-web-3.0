const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Используем файловую БД для сохранения данных
const dbPath = path.join(__dirname, 'acaragraph.db'); // Оставить так же
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Ошибка подключения к БД:', err);
  } else {
    console.log('✅ Подключено к базе данных:', dbPath);
  }
});

// Включение внешних ключей
db.run("PRAGMA foreign_keys = ON");

// ========== ИНИЦИАЛИЗАЦИЯ ТАБЛИЦ ==========

const initDatabase = async () => {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // 1. ТАБЛИЦА ПОЛЬЗОВАТЕЛЕЙ
      db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username VARCHAR(50) UNIQUE,
        nickname VARCHAR(100) NOT NULL,
        tg_username VARCHAR(100) NOT NULL,
        role VARCHAR(20) DEFAULT 'user',
        avatar_color VARCHAR(7) DEFAULT '#FF0000',
        status VARCHAR(20) DEFAULT 'offline',
        bio TEXT,
        level INTEGER DEFAULT 1,
        experience INTEGER DEFAULT 0,
        message_count INTEGER DEFAULT 0,
        is_verified BOOLEAN DEFAULT 0,
        is_banned BOOLEAN DEFAULT 0,
        muted_until DATETIME,
        last_seen DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`, (err) => {
        if (err) console.error('❌ Ошибка создания таблицы users:', err);
      });

      // 2. ТАБЛИЦА ИНВАЙТ-КОДОВ
      db.run(`CREATE TABLE IF NOT EXISTS invite_codes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code VARCHAR(50) UNIQUE NOT NULL,
        type VARCHAR(20) DEFAULT 'user',
        created_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        used_by INTEGER,
        used_at DATETIME,
        max_uses INTEGER DEFAULT 1,
        uses_count INTEGER DEFAULT 0,
        expires_at DATETIME,
        is_active BOOLEAN DEFAULT 1,
        notes TEXT,
        FOREIGN KEY (created_by) REFERENCES users(id),
        FOREIGN KEY (used_by) REFERENCES users(id)
      )`, (err) => {
        if (err) console.error('❌ Ошибка создания таблицы invite_codes:', err);
      });

      // 3. ТАБЛИЦА СООБЩЕНИЙ
      db.run(`CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        text TEXT NOT NULL,
        type VARCHAR(20) DEFAULT 'text',
        media_url TEXT,
        reply_to INTEGER,
        reactions TEXT DEFAULT '{}',
        is_edited BOOLEAN DEFAULT 0,
        edited_at DATETIME,
        is_pinned BOOLEAN DEFAULT 0,
        deleted_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (reply_to) REFERENCES messages(id)
      )`, (err) => {
        if (err) console.error('❌ Ошибка создания таблицы messages:', err);
      });

      // 4. ТАБЛИЦА СОБЫТИЙ/ЛОГОВ
      db.run(`CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        event_type VARCHAR(50) NOT NULL,
        description TEXT,
        ip_address VARCHAR(45),
        user_agent TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )`, (err) => {
        if (err) console.error('❌ Ошибка создания таблицы events:', err);
      });

      // 5. ТАБЛИЦА СИСТЕМНЫХ НАСТРОЕК
      db.run(`CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key VARCHAR(100) UNIQUE NOT NULL,
        value TEXT,
        type VARCHAR(20) DEFAULT 'string',
        description TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`, (err) => {
        if (err) console.error('❌ Ошибка создания таблицы settings:', err);
      });

      // Проверяем создание всех таблиц
      setTimeout(async () => {
        try {
          await createDefaultData();
          console.log('✅ Все таблицы созданы успешно');
          resolve();
        } catch (error) {
          reject(error);
        }
      }, 1000);
    });
  });
};

// ========== СОЗДАНИЕ ТЕСТОВЫХ ДАННЫХ ==========

const createDefaultData = async () => {
  try {
    // Проверяем, есть ли уже данные
    const userCount = await get("SELECT COUNT(*) as count FROM users");
    const codeCount = await get("SELECT COUNT(*) as count FROM invite_codes");

    // Создаем тестового администратора если нет пользователей
    if (userCount.count === 0) {
      console.log('👑 Создаем тестового администратора...');
      
      const adminResult = await run(
        `INSERT INTO users (nickname, tg_username, role, avatar_color, is_verified) 
         VALUES (?, ?, ?, ?, ?)`,
        ['Администратор', '@admin', 'admin', '#FF0000', 1]
      );

      const adminId = adminResult.id;
      console.log(`✅ Администратор создан с ID: ${adminId}`);

      // Создаем стандартные коды
      const defaultCodes = [
        {
          code: 'ADMIN-777',
          type: 'admin',
          created_by: adminId,
          max_uses: 5,
          expires_at: null,
          notes: 'Код для создания администраторов'
        },
        {
          code: 'USER-123',
          type: 'user', 
          created_by: adminId,
          max_uses: 100,
          expires_at: null,
          notes: 'Стандартный код для пользователей'
        },
        {
          code: 'SUPER-001',
          type: 'super_admin',
          created_by: adminId,
          max_uses: 1,
          expires_at: null,
          notes: 'Мастер-код супер-администратора'
        },
        {
          code: 'GUEST-999',
          type: 'guest',
          created_by: adminId,
          max_uses: 50,
          expires_at: '2024-12-31 23:59:59',
          notes: 'Временный гостевой доступ'
        }
      ];

      for (const codeData of defaultCodes) {
        await run(
          `INSERT INTO invite_codes (code, type, created_by, max_uses, expires_at, notes)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [codeData.code, codeData.type, codeData.created_by, 
           codeData.max_uses, codeData.expires_at, codeData.notes]
        );
        console.log(`🔑 Создан код: ${codeData.code} (${codeData.type})`);
      }

      // Создаем тестового пользователя
      await run(
        `INSERT INTO users (nickname, tg_username, role, avatar_color) 
         VALUES (?, ?, ?, ?)`,
        ['Тестовый Пользователь', '@testuser', 'user', '#FF4D4D']
      );

      console.log('👤 Тестовый пользователь создан');

      // Создаем системные настройки
      const defaultSettings = [
        ['app_name', 'Acaragraph Red', 'string', 'Название приложения'],
        ['app_version', '1.0.0', 'string', 'Версия приложения'],
        ['theme', 'dark_red', 'string', 'Цветовая тема'],
        ['max_message_length', '2000', 'number', 'Максимальная длина сообщения'],
        ['allow_registration', '1', 'boolean', 'Разрешить регистрацию'],
        ['maintenance_mode', '0', 'boolean', 'Режим техобслуживания']
      ];

      for (const [key, value, type, desc] of defaultSettings) {
        await run(
          `INSERT OR REPLACE INTO settings (key, value, type, description)
           VALUES (?, ?, ?, ?)`,
          [key, value, type, desc]
        );
      }

      console.log('⚙️  Системные настройки созданы');

      // Создаем тестовые сообщения
      const testMessages = [
        [adminId, '🎉 Добро пожаловать в Acaragraph!', 'system'],
        [adminId, 'Это приватный мессенджер на кодах доступа.', 'text'],
        [adminId, 'Используйте коды для приглашения друзей.', 'text']
      ];

      for (const [userId, text, type] of testMessages) {
        await run(
          `INSERT INTO messages (user_id, text, type) VALUES (?, ?, ?)`,
          [userId, text, type]
        );
      }

      console.log('💬 Тестовые сообщения созданы');
      
      console.log(`
      ============================================
      🎯 ТЕСТОВЫЕ ДАННЫЕ СОЗДАНЫ:
      👑 Админ код: ADMIN-777
      👤 Пользователь код: USER-123  
      🔐 Супер-админ код: SUPER-001
      👥 Гостевой код: GUEST-999
      ============================================
      `);

    } else {
      console.log(`✅ В базе уже есть ${userCount.count} пользователей и ${codeCount.count} кодов`);
    }

  } catch (error) {
    console.error('❌ Ошибка создания тестовых данных:', error);
  }
};

// ========== УТИЛИТЫ ДЛЯ РАБОТЫ С БАЗОЙ ==========

// Выполнить запрос с возвратом всех строк
function query(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        console.error('❌ Ошибка SQL запроса:', err.message);
        console.error('SQL:', sql);
        console.error('Параметры:', params);
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

// Выполнить запрос без возврата данных (INSERT, UPDATE, DELETE)
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) {
        console.error('❌ Ошибка SQL выполнения:', err.message);
        console.error('SQL:', sql);
        console.error('Параметры:', params);
        reject(err);
      } else {
        resolve({ 
          id: this.lastID, 
          changes: this.changes,
          sql: sql
        });
      }
    });
  });
}

// Получить одну строку
function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        console.error('❌ Ошибка SQL получения:', err.message);
        console.error('SQL:', sql);
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
}

// Получить значение настройки
async function getSetting(key, defaultValue = null) {
  try {
    const setting = await get(
      "SELECT value, type FROM settings WHERE key = ?",
      [key]
    );
    
    if (!setting) return defaultValue;
    
    // Конвертируем значение в правильный тип
    switch (setting.type) {
      case 'number':
        return parseInt(setting.value) || defaultValue;
      case 'boolean':
        return setting.value === '1' || setting.value === 'true';
      case 'json':
        try {
          return JSON.parse(setting.value);
        } catch {
          return defaultValue;
        }
      default:
        return setting.value || defaultValue;
    }
  } catch (error) {
    console.error(`❌ Ошибка получения настройки ${key}:`, error);
    return defaultValue;
  }
}

// Установить значение настройки
async function setSetting(key, value, type = 'string', description = '') {
  try {
    let formattedValue = value;
    
    // Форматируем значение по типу
    if (type === 'boolean') {
      formattedValue = value ? '1' : '0';
    } else if (type === 'json') {
      formattedValue = JSON.stringify(value);
    } else if (type === 'number') {
      formattedValue = value.toString();
    }
    
    await run(
      `INSERT OR REPLACE INTO settings (key, value, type, description, updated_at)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [key, formattedValue, type, description]
    );
    
    return true;
  } catch (error) {
    console.error(`❌ Ошибка установки настройки ${key}:`, error);
    return false;
  }
}

// Логирование события
async function logEvent(userId, eventType, description = '', ip = '', userAgent = '') {
  try {
    await run(
      `INSERT INTO events (user_id, event_type, description, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, eventType, description, ip, userAgent]
    );
    return true;
  } catch (error) {
    console.error('❌ Ошибка логирования события:', error);
    return false;
  }
}

// Получить статистику
async function getStats() {
  try {
    const stats = await query(`
      SELECT 
        (SELECT COUNT(*) FROM users) as total_users,
        (SELECT COUNT(*) FROM users WHERE status = 'online') as online_users,
        (SELECT COUNT(*) FROM messages) as total_messages,
        (SELECT COUNT(*) FROM invite_codes) as total_codes,
        (SELECT COUNT(*) FROM invite_codes WHERE is_active = 1) as active_codes,
        (SELECT COUNT(*) FROM users WHERE is_banned = 1) as banned_users
    `);
    
    return stats[0] || {};
  } catch (error) {
    console.error('❌ Ошибка получения статистики:', error);
    return {};
  }
}

// ========== ИНИЦИАЛИЗАЦИЯ ПРИ ЗАПУСКЕ ==========

// Инициализируем базу при импорте модуля
initDatabase().then(() => {
  console.log('✅ База данных Acaragraph готова к работе');
}).catch(error => {
  console.error('❌ Критическая ошибка инициализации БД:', error);
});

// ========== ЭКСПОРТ ФУНКЦИЙ ==========

module.exports = {
  db,
  query,
  run,
  get,
  getSetting,
  setSetting,
  logEvent,
  getStats
};