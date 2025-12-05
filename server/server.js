const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { query, run, get } = require('./database');
const { checkAdmin, getUserProfile, checkUserStatus } = require('./auth');

// ========== НАСТРОЙКА СЕРВЕРА ==========
const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

// WebSocket с настройками
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  transports: ['websocket', 'polling']
});

// ========== БЕЗОПАСНОСТЬ ==========
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
      fontSrc: ["'self'", "https://cdnjs.cloudflare.com"],
      imgSrc: ["'self'", "data:", "https:"]
    }
  }
}));
app.use(compression());

// Лимит запросов
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use('/api/', limiter);

// ========== MIDDLEWARE ==========
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Статические файлы
app.use(express.static(path.join(__dirname, '../public')));
// ========== API МАРШРУТЫ ==========

// 1. Тест API
app.get('/api/ping', (req, res) => {
  res.json({ 
    success: true, 
    message: '⚡ Acaragraph API работает!',
    timestamp: new Date().toISOString(),
    version: '1.0.0-red'
  });
});

// 2. Проверка кода доступа
app.post('/api/auth/check-code', async (req, res) => {
  try {
    const { code } = req.body;
    
    if (!code || code.length < 3) {
      return res.json({ 
        success: false, 
        message: 'Код должен быть не менее 3 символов' 
      });
    }

    const codeData = await get(
      `SELECT id, code, type, max_uses, uses_count, expires_at 
       FROM invite_codes 
       WHERE code = ? AND is_active = 1 
       AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
       AND (max_uses IS NULL OR uses_count < max_uses)`,
      [code]
    );

    if (!codeData) {
      return res.json({ 
        success: false, 
        message: '❌ Неверный, истёкший или использованный код' 
      });
    }

    res.json({
      success: true,
      codeId: codeData.id,
      codeType: codeData.type,
      message: '✅ Код принят!'
    });

  } catch (error) {
    console.error('❌ Ошибка проверки кода:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Ошибка сервера' 
    });
  }
});

// 3. Регистрация пользователя
app.post('/api/auth/register', async (req, res) => {
  try {
    const { nickname, tgUsername, codeId } = req.body;
    
    // Валидация
    if (!nickname || nickname.length < 2 || nickname.length > 20) {
      return res.status(400).json({
        success: false,
        message: 'Имя должно быть от 2 до 20 символов'
      });
    }

    if (!tgUsername || !tgUsername.startsWith('@')) {
      return res.status(400).json({
        success: false,
        message: 'Telegram должен начинаться с @'
      });
    }

    // Проверка кода
    const code = await get(
      `SELECT code, type FROM invite_codes 
       WHERE id = ? AND is_active = 1 
       AND (max_uses IS NULL OR uses_count < max_uses)`,
      [codeId]
    );

    if (!code) {
      return res.status(400).json({
        success: false,
        message: 'Код недействителен'
      });
    }

    // Генерация цвета аватара (красная палитра)
    const redColors = [
      '#FF0000', '#FF3333', '#FF6666', '#FF9999', '#FF4D4D',
      '#E60000', '#CC0000', '#B30000', '#990000', '#800000',
      '#FF1A1A', '#FF4D4D', '#FF8080', '#FFB3B3', '#FFE6E6'
    ];
    const avatarColor = redColors[Math.floor(Math.random() * redColors.length)];

    // Определение роли по типу кода
    let role = 'user';
    if (code.type === 'admin') role = 'admin';
    if (code.type === 'super_admin') role = 'super_admin';

    // Создание пользователя
    const userResult = await run(
      `INSERT INTO users (nickname, tg_username, avatar_color, role) 
       VALUES (?, ?, ?, ?)`,
      [nickname, tgUsername, avatarColor, role]
    );

    const userId = userResult.id;

    // Обновление счетчика использования кода
    await run(
      `UPDATE invite_codes 
       SET uses_count = uses_count + 1, 
           used_by = ?, 
           used_at = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      [userId, codeId]
    );

    // Получаем данные пользователя
    const newUser = await get(
      `SELECT id, nickname, tg_username, role, avatar_color, created_at 
       FROM users WHERE id = ?`,
      [userId]
    );

    // Логируем регистрацию
    console.log(`👤 Новый пользователь: ${newUser.nickname} (${role})`);

    res.json({
      success: true,
      user: newUser,
      message: '🎉 Добро пожаловать в Acaragraph!'
    });

  } catch (error) {
    console.error('❌ Ошибка регистрации:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка регистрации'
    });
  }
});

// 4. Получить данные текущего пользователя
app.get('/api/auth/me', async (req, res) => {
  try {
    const authHeader = req.headers['x-user-id'] || req.query.userId;
    let user = null;

    if (authHeader) {
      user = await get(
        `SELECT id, nickname, tg_username, role, avatar_color, 
                created_at, last_seen, status, message_count
         FROM users WHERE id = ?`,
        [authHeader]
      );
    }

    if (!user) {
      // Проверяем есть ли пользователи в системе
      const users = await query("SELECT * FROM users LIMIT 1");
      if (users.length > 0) {
        user = users[0];
      } else {
        return res.json({
          success: false,
          message: 'Пользователь не найден'
        });
      }
    }

    res.json({
      success: true,
      user: user
    });

  } catch (error) {
    console.error('❌ Ошибка получения пользователя:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка сервера'
    });
  }
});

// 5. Получить историю сообщений
app.get('/api/chat/messages', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const offset = parseInt(req.query.offset) || 0;

    const messages = await query(`
      SELECT m.id, m.text, m.timestamp, m.type,
             u.id as user_id, u.nickname, u.avatar_color, 
             u.tg_username, u.role, u.status
      FROM messages m
      JOIN users u ON m.user_id = u.id
      WHERE m.deleted_at IS NULL
      ORDER BY m.timestamp DESC
      LIMIT ? OFFSET ?
    `, [limit, offset]);

    res.json({
      success: true,
      messages: messages.reverse(),
      total: messages.length
    });

  } catch (error) {
    console.error('❌ Ошибка получения сообщений:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка загрузки сообщений'
    });
  }
});

// 6. Получить онлайн пользователей
app.get('/api/chat/online', async (req, res) => {
  try {
    const onlineUsers = await query(`
      SELECT id, nickname, avatar_color, role, status, last_seen
      FROM users 
      WHERE status = 'online' 
      ORDER BY nickname ASC
    `);

    res.json({
      success: true,
      users: onlineUsers,
      count: onlineUsers.length
    });

  } catch (error) {
    console.error('❌ Ошибка получения онлайн пользователей:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка сервера'
    });
  }
});

// ========== АДМИН API ==========

// 7. Создать новый инвайт-код
app.post('/api/admin/codes/create', async (req, res) => {
  try {
    const { adminId, type = 'user', maxUses = 1, expiresIn = 30 } = req.body;

    if (!adminId) {
      return res.status(400).json({
        success: false,
        message: 'Требуется ID администратора'
      });
    }

    // Проверка прав
    const isAdmin = await checkAdmin(adminId);
    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        message: '🚫 Требуются права администратора'
      });
    }

    // Генерация кода
    const code = 'ACARA-' + Math.random().toString(36).substring(2, 8).toUpperCase();
    
    // Расчет даты истечения
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresIn);

    await run(
      `INSERT INTO invite_codes (code, type, created_by, max_uses, expires_at) 
       VALUES (?, ?, ?, ?, ?)`,
      [code, type, adminId, maxUses, expiresAt.toISOString()]
    );

    console.log(`🔑 Админ ${adminId} создал код: ${code} (тип: ${type})`);

    res.json({
      success: true,
      code: code,
      expiresAt: expiresAt.toISOString(),
      message: `✅ Код создан: ${code}`
    });

  } catch (error) {
    console.error('❌ Ошибка создания кода:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка сервера'
    });
  }
});

// 8. Получить все коды
app.get('/api/admin/codes', async (req, res) => {
  try {
    const { adminId } = req.query;

    if (!adminId) {
      return res.status(400).json({
        success: false,
        message: 'Требуется ID администратора'
      });
    }

    const isAdmin = await checkAdmin(adminId);
    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        message: '🚫 Требуются права администратора'
      });
    }

    const codes = await query(`
      SELECT ic.*, 
             u.nickname as used_by_nickname,
             creator.nickname as creator_nickname
      FROM invite_codes ic
      LEFT JOIN users u ON ic.used_by = u.id
      LEFT JOIN users creator ON ic.created_by = creator.id
      ORDER BY ic.created_at DESC
    `);

    res.json({
      success: true,
      codes: codes,
      count: codes.length
    });

  } catch (error) {
    console.error('❌ Ошибка получения кодов:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка сервера'
    });
  }
});

// 9. Получить всех пользователей
app.get('/api/admin/users', async (req, res) => {
  try {
    const { adminId } = req.query;

    if (!adminId) {
      return res.status(400).json({
        success: false,
        message: 'Требуется ID администратора'
      });
    }

    const isAdmin = await checkAdmin(adminId);
    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        message: '🚫 Требуются права администратора'
      });
    }

    const users = await query(`
      SELECT u.id, u.nickname, u.tg_username, u.role, u.avatar_color,
             u.created_at, u.last_seen, u.status, u.is_banned, u.muted_until,
             (SELECT COUNT(*) FROM messages m WHERE m.user_id = u.id) as message_count
      FROM users u
      ORDER BY u.created_at DESC
    `);

    res.json({
      success: true,
      users: users,
      count: users.length
    });

  } catch (error) {
    console.error('❌ Ошибка получения пользователей:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка сервера'
    });
  }
});

// 10. Действия с пользователем
app.post('/api/admin/users/action', async (req, res) => {
  try {
    const { adminId, userId, action, duration = 5 } = req.body;

    if (!adminId || !userId || !action) {
      return res.status(400).json({
        success: false,
        message: 'Не все параметры указаны'
      });
    }

    const isAdmin = await checkAdmin(adminId);
    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        message: '🚫 Требуются права администратора'
      });
    }

    let sql, params, message;

    switch (action) {
      case 'ban':
        sql = "UPDATE users SET is_banned = 1 WHERE id = ?";
        params = [userId];
        message = 'Пользователь забанен';
        break;

      case 'unban':
        sql = "UPDATE users SET is_banned = 0 WHERE id = ?";
        params = [userId];
        message = 'Пользователь разбанен';
        break;

      case 'mute':
        const muteUntil = new Date(Date.now() + duration * 60 * 1000);
        sql = "UPDATE users SET muted_until = ? WHERE id = ?";
        params = [muteUntil.toISOString(), userId];
        message = `Пользователь замьючен на ${duration} минут`;
        break;

      case 'unmute':
        sql = "UPDATE users SET muted_until = NULL WHERE id = ?";
        params = [userId];
        message = 'Пользователь размьючен';
        break;

      case 'make_admin':
        sql = "UPDATE users SET role = 'admin' WHERE id = ?";
        params = [userId];
        message = 'Пользователь назначен администратором';
        break;

      case 'remove_admin':
        sql = "UPDATE users SET role = 'user' WHERE id = ?";
        params = [userId];
        message = 'Права администратора сняты';
        break;

      default:
        return res.status(400).json({
          success: false,
          message: 'Неизвестное действие'
        });
    }

    await run(sql, params);

    // Отправляем уведомление через WebSocket
    io.emit('admin_action', {
      userId: userId,
      action: action,
      timestamp: new Date().toISOString(),
      byAdminId: adminId
    });

    console.log(`🔨 Админ ${adminId} выполнил действие ${action} над пользователем ${userId}`);

    res.json({
      success: true,
      message: message
    });

  } catch (error) {
    console.error('❌ Ошибка действия админа:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка сервера'
    });
  }
});

// ========== WebSocket ОБРАБОТЧИКИ ==========

const onlineUsers = new Map(); // { socketId: userData }

io.on('connection', (socket) => {
  console.log(`🔌 Новое подключение: ${socket.id}`);

  // 1. Авторизация пользователя
  socket.on('auth', async (userData) => {
    try {
      if (!userData || !userData.id) {
        socket.emit('error', { message: 'Неверные данные пользователя' });
        return;
      }

      // Обновляем статус пользователя в БД
      await run(
        "UPDATE users SET status = 'online', last_seen = CURRENT_TIMESTAMP WHERE id = ?",
        [userData.id]
      );

      // Сохраняем в памяти
      onlineUsers.set(socket.id, {
        socketId: socket.id,
        ...userData
      });

      // Отправляем список онлайн пользователей всем
      broadcastOnlineUsers();

      console.log(`✅ Пользователь ${userData.nickname} онлайн`);

    } catch (error) {
      console.error('❌ Ошибка авторизации:', error);
      socket.emit('error', { message: 'Ошибка авторизации' });
    }
  });

  // 2. Получить историю сообщений
  socket.on('get_messages', async () => {
    try {
      const messages = await query(`
        SELECT m.id, m.text, m.timestamp, m.type,
               u.id as user_id, u.nickname, u.avatar_color, 
               u.tg_username, u.role
        FROM messages m
        JOIN users u ON m.user_id = u.id
        WHERE m.deleted_at IS NULL
        ORDER BY m.timestamp DESC
        LIMIT 100
      `);

      socket.emit('messages_history', messages.reverse());

    } catch (error) {
      console.error('❌ Ошибка истории сообщений:', error);
      socket.emit('error', { message: 'Ошибка загрузки истории' });
    }
  });

  // 3. Отправить сообщение
  socket.on('send_message', async (data) => {
    try {
      const { userId, text, type = 'text' } = data;
      const trimmedText = text.trim();

      if (!trimmedText || !userId) {
        socket.emit('error', { message: 'Пустое сообщение' });
        return;
      }

      // Проверка бана/мута
      const status = await checkUserStatus(userId);
      if (!status.canSend) {
        socket.emit('error', { message: status.reason });
        return;
      }

      // Сохраняем в БД
      const messageResult = await run(
        "INSERT INTO messages (user_id, text, type) VALUES (?, ?, ?)",
        [userId, trimmedText, type]
      );

      // Получаем данные отправителя
      const sender = await get(
        `SELECT id, nickname, avatar_color, role, status
         FROM users WHERE id = ?`,
        [userId]
      );

      if (!sender) {
        socket.emit('error', { message: 'Отправитель не найден' });
        return;
      }

      // Создаем объект сообщения для рассылки
      const messageData = {
        id: messageResult.id,
        text: trimmedText,
        type: type,
        user: sender,
        timestamp: new Date().toISOString()
      };

      // Рассылаем всем подключенным
      io.emit('new_message', messageData);

      // Обновляем счетчик сообщений пользователя
      await run(
        "UPDATE users SET message_count = message_count + 1 WHERE id = ?",
        [userId]
      );

      console.log(`💬 ${sender.nickname}: ${trimmedText}`);

    } catch (error) {
      console.error('❌ Ошибка отправки сообщения:', error);
      socket.emit('error', { message: 'Ошибка отправки' });
    }
  });

  // 4. Пользователь печатает
  socket.on('typing', (data) => {
    const user = onlineUsers.get(socket.id);
    if (user) {
      socket.broadcast.emit('user_typing', {
        userId: user.id,
        nickname: user.nickname
      });
    }
  });

  // 5. Отключение пользователя
  socket.on('disconnect', async () => {
    const user = onlineUsers.get(socket.id);
    
    if (user) {
      // Обновляем статус в БД
      await run(
        "UPDATE users SET status = 'offline', last_seen = CURRENT_TIMESTAMP WHERE id = ?",
        [user.id]
      );

      onlineUsers.delete(socket.id);
      broadcastOnlineUsers();

      console.log(`❌ Пользователь ${user.nickname} отключился`);
    }
  });

  // 6. Обработка ошибок
  socket.on('error', (error) => {
    console.error(`❌ WebSocket ошибка (${socket.id}):`, error);
  });
});

// ========== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==========

// Рассылка списка онлайн пользователей
function broadcastOnlineUsers() {
  const users = Array.from(onlineUsers.values()).map(u => ({
    id: u.id,
    nickname: u.nickname,
    avatar_color: u.avatar_color,
    role: u.role || 'user',
    status: u.status || 'online'
  }));

  io.emit('online_users_update', {
    users: users,
    count: users.length
  });
}

// Периодическая проверка онлайн статуса
setInterval(async () => {
  try {
    // Обновляем статус пользователей, которые не обновляли статус более 60 секунд
    await run(`
      UPDATE users 
      SET status = 'away' 
      WHERE status = 'online' 
      AND last_seen < datetime('now', '-60 seconds')
    `);
    
    broadcastOnlineUsers();
  } catch (error) {
    console.error('❌ Ошибка обновления статуса:', error);
  }
}, 30000);

// ========== ЗАПУСК СЕРВЕРА ==========

// Главная страница
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Страница чата
app.get('/chat', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'chat.html'));
});

// Админ панель
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Обработка 404
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Запуск сервера
server.listen(PORT, () => {
  console.log(`
  ⚡⚡⚡ ACARAGRAPH RED EDITION ⚡⚡⚡
  ============================================
  🚀 Сервер запущен на порту: ${PORT}
  🔗 URL: http://localhost:${PORT}
  📁 Папка статики: ${__dirname}/public
  🔥 Цветовая тема: КРАСНО-ЧЕРНАЯ
  ============================================
  👑 Код администратора: ADMIN-777
  👤 Обычный код: USER-123
  ============================================
  `);
});

// Обработка ошибок сервера
server.on('error', (error) => {
  console.error('❌ Ошибка сервера:', error);
  if (error.code === 'EADDRINUSE') {
    console.error(`⚠️ Порт ${PORT} уже занят! Попробуйте другой порт.`);
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('⚠️ Получен сигнал завершения...');
  server.close(() => {
    console.log('✅ Сервер корректно остановлен');
    process.exit(0);
  });
});