const express = require('express');
const path = require('path');
const session = require('express-session');
const axios = require('axios');
const mysql = require('mysql2/promise');

const app = express();
const PORT = process.env.PORT || 9337;

// SeaTalk 設定
const SEATALK_APP_ID = 'MDIxMjA0MDE0MTg3';
const SEATALK_APP_SECRET = process.env.SEATALK_APP_SECRET;
const REDIRECT_URI = 'https://thankuisland.run.ingarena.net/auth/seatalk/callback';

// MySQL 連線池
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4',
});

// 初始化資料庫表格
async function initDB() {
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS user_data (
      uid VARCHAR(255) PRIMARY KEY,
      users_json LONGTEXT,
      letters_json LONGTEXT,
      updated_at BIGINT DEFAULT 0
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

    await pool.query(`CREATE TABLE IF NOT EXISTS profiles (
      id VARCHAR(255) PRIMARY KEY,
      name VARCHAR(255),
      email VARCHAR(255),
      avatar_url TEXT,
      avatar_pos_x INT DEFAULT 50,
      avatar_pos_y INT DEFAULT 50,
      energy INT DEFAULT 0,
      tile_count INT DEFAULT 6,
      island_json LONGTEXT,
      updated_at BIGINT DEFAULT 0
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

    await pool.query(`CREATE TABLE IF NOT EXISTS tiles (
      uid VARCHAR(255) PRIMARY KEY,
      tiles_json LONGTEXT,
      updated_at BIGINT DEFAULT 0
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

    await pool.query(`CREATE TABLE IF NOT EXISTS letters (
      id INT AUTO_INCREMENT PRIMARY KEY,
      from_uid VARCHAR(255),
      from_name VARCHAR(255),
      to_uid VARCHAR(255),
      to_name VARCHAR(255),
      content TEXT,
      timestamp BIGINT,
      card_cost INT DEFAULT 1,
      likes_json TEXT DEFAULT '[]',
      is_read TINYINT(1) DEFAULT 0,
      anon TINYINT(1) DEFAULT 0
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

    await pool.query(`CREATE TABLE IF NOT EXISTS inbox_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      uid VARCHAR(255),
      item_json LONGTEXT,
      timestamp BIGINT,
      INDEX idx_uid (uid)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

    await pool.query(`CREATE TABLE IF NOT EXISTS announcements (
      id INT AUTO_INCREMENT PRIMARY KEY,
      type VARCHAR(50),
      uid VARCHAR(255),
      name VARCHAR(255),
      photo_url TEXT,
      timestamp BIGINT
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

    await pool.query(`CREATE TABLE IF NOT EXISTS gacha_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255),
      emoji VARCHAR(50),
      rarity VARCHAR(50),
      weight INT DEFAULT 10,
      type VARCHAR(50),
      img_url TEXT,
      sprite_url TEXT,
      active TINYINT(1) DEFAULT 1,
      created_at BIGINT DEFAULT 0
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

    await pool.query(`CREATE TABLE IF NOT EXISTS feedbacks (
      id INT AUTO_INCREMENT PRIMARY KEY,
      uid VARCHAR(255),
      name VARCHAR(255),
      email VARCHAR(255),
      avatar_url TEXT,
      content TEXT,
      img_url TEXT,
      timestamp BIGINT,
      is_read TINYINT(1) DEFAULT 0
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

    console.log('資料庫初始化完成');
  } catch (err) {
    console.error('資料庫初始化失敗:', err.message);
  }
}

// Session 設定
app.use(session({
  secret: process.env.SESSION_SECRET || 'thanku-island-secret-2026',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname)));

// 登入驗證 middleware
function requireLogin(req, res, next) {
  if (req.session.user) return next();
  res.status(401).json({ error: 'unauthorized' });
}

// ===== SeaTalk OAuth =====
async function getAppAccessToken() {
  try {
    const res = await axios.post('https://openapi.seatalk.io/auth/app_access_token', {
      app_id: SEATALK_APP_ID,
      app_secret: SEATALK_APP_SECRET
    }, { headers: { 'Content-Type': 'application/json' } });
    if (res.data.code === 0) return res.data.app_access_token;
    throw new Error('取得 Access Token 失敗：' + res.data.code);
  } catch (err) {
    console.error('getAppAccessToken error:', err.message);
    throw err;
  }
}

app.get('/auth/seatalk/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code) return res.redirect('/?error=no_code');
  if (state && req.session.oauthState && state !== req.session.oauthState) {
    return res.redirect('/?error=invalid_state');
  }
  req.session.oauthState = null;
  try {
    const appToken = await getAppAccessToken();
    const userRes = await axios.get('https://openapi.seatalk.io/open_login/code2employee', {
      params: { code },
      headers: { Authorization: `Bearer ${appToken}` }
    });
    if (userRes.data.code !== 0) {
      console.error('code2employee error:', userRes.data);
      return res.redirect('/?error=auth_failed');
    }
    const employee = userRes.data.employee;
    req.session.user = {
      employee_code: employee.employee_code,
      name: employee.name,
      email: employee.email,
      avatar: employee.avatar
    };
    res.redirect('/');
  } catch (err) {
    console.error('Callback error:', err.message);
    res.redirect('/?error=server_error');
  }
});

app.get('/api/me', (req, res) => {
  if (req.session.user) {
    res.json({ success: true, user: req.session.user });
  } else {
    res.json({ success: false });
  }
});

app.get('/auth/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// ===== 使用者資料 API =====
app.get('/api/user', requireLogin, async (req, res) => {
  const uid = req.session.user.employee_code;
  try {
    const [rows] = await pool.query('SELECT * FROM user_data WHERE uid = ?', [uid]);
    if (rows.length === 0) return res.json({ exists: false });
    const row = rows[0];
    res.json({
      exists: true,
      users: JSON.parse(row.users_json || '[]'),
      letters: JSON.parse(row.letters_json || '[]'),
      updatedAt: row.updated_at
    });
  } catch (err) {
    console.error('GET /api/user error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/user', requireLogin, async (req, res) => {
  const uid = req.session.user.employee_code;
  const { users, letters, updatedAt } = req.body;
  try {
    await pool.query(
      `INSERT INTO user_data (uid, users_json, letters_json, updated_at) VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE users_json=VALUES(users_json), letters_json=VALUES(letters_json), updated_at=VALUES(updated_at)`,
      [uid, JSON.stringify(users || []), JSON.stringify(letters || []), updatedAt || Date.now()]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('POST /api/user error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/user', requireLogin, async (req, res) => {
  const uid = req.session.user.employee_code;
  try {
    await pool.query('DELETE FROM user_data WHERE uid = ?', [uid]);
    await pool.query('DELETE FROM profiles WHERE id = ?', [uid]);
    await pool.query('DELETE FROM tiles WHERE uid = ?', [uid]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== 公開 Profile API =====
app.get('/api/profiles', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM profiles ORDER BY updated_at DESC');
    res.json(rows.map(r => ({
      id: r.id,
      name: r.name,
      email: r.email,
      avatarUrl: r.avatar_url,
      avatarPosX: r.avatar_pos_x,
      avatarPosY: r.avatar_pos_y,
      energy: r.energy,
      tileCount: r.tile_count,
      island: JSON.parse(r.island_json || '[]'),
      updatedAt: r.updated_at
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/profiles/:id', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM profiles WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.json({ exists: false });
    const r = rows[0];
    res.json({
      exists: true,
      id: r.id,
      name: r.name,
      email: r.email,
      avatarUrl: r.avatar_url,
      avatarPosX: r.avatar_pos_x,
      avatarPosY: r.avatar_pos_y,
      energy: r.energy,
      tileCount: r.tile_count,
      island: JSON.parse(r.island_json || '[]'),
      updatedAt: r.updated_at
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/profiles', requireLogin, async (req, res) => {
  const uid = req.session.user.employee_code;
  const { name, email, avatarUrl, avatarPosX, avatarPosY, energy, tileCount, island } = req.body;
  try {
    await pool.query(
      `INSERT INTO profiles (id, name, email, avatar_url, avatar_pos_x, avatar_pos_y, energy, tile_count, island_json, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name=VALUES(name), email=VALUES(email), avatar_url=VALUES(avatar_url),
       avatar_pos_x=VALUES(avatar_pos_x), avatar_pos_y=VALUES(avatar_pos_y),
       energy=VALUES(energy), tile_count=VALUES(tile_count), island_json=VALUES(island_json), updated_at=VALUES(updated_at)`,
      [uid, name || '', email || '', avatarUrl || '', avatarPosX ?? 50, avatarPosY ?? 50,
       energy || 0, tileCount || 6, JSON.stringify(island || []), Date.now()]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('POST /api/profiles error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ===== 地形 Tiles API =====
app.get('/api/tiles', requireLogin, async (req, res) => {
  const uid = req.session.user.employee_code;
  try {
    const [rows] = await pool.query('SELECT * FROM tiles WHERE uid = ?', [uid]);
    if (rows.length === 0) return res.json({ exists: false, tiles: [] });
    res.json({ exists: true, tiles: JSON.parse(rows[0].tiles_json || '[]') });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/tiles/:uid', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM tiles WHERE uid = ?', [req.params.uid]);
    if (rows.length === 0) return res.json({ exists: false, tiles: [] });
    res.json({ exists: true, tiles: JSON.parse(rows[0].tiles_json || '[]') });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/tiles', requireLogin, async (req, res) => {
  const uid = req.session.user.employee_code;
  const { tiles, updatedAt } = req.body;
  try {
    await pool.query(
      `INSERT INTO tiles (uid, tiles_json, updated_at) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE tiles_json=VALUES(tiles_json), updated_at=VALUES(updated_at)`,
      [uid, JSON.stringify(tiles || []), updatedAt || Date.now()]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== 感謝信 Letters API =====
app.get('/api/letters', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM letters ORDER BY timestamp DESC LIMIT 100');
    res.json(rows.map(r => ({
      id: String(r.id),
      from: r.from_uid,
      fromName: r.from_name,
      to: r.to_uid,
      toName: r.to_name,
      content: r.content,
      timestamp: r.timestamp,
      cardCost: r.card_cost,
      likes: JSON.parse(r.likes_json || '[]'),
      read: !!r.is_read,
      anon: !!r.anon
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/letters', requireLogin, async (req, res) => {
  const { from, fromName, to, toName, content, timestamp, cardCost, likes, read, anon } = req.body;
  try {
    const [result] = await pool.query(
      'INSERT INTO letters (from_uid, from_name, to_uid, to_name, content, timestamp, card_cost, likes_json, is_read, anon) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [from, fromName || '', to, toName || '', content, timestamp || Date.now(),
       cardCost || 1, JSON.stringify(likes || []), read ? 1 : 0, anon ? 1 : 0]
    );
    res.json({ success: true, id: String(result.insertId) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/letters/:id/likes', requireLogin, async (req, res) => {
  const { likes } = req.body;
  try {
    await pool.query('UPDATE letters SET likes_json=? WHERE id=?', [JSON.stringify(likes || []), req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== 收件箱 Inbox API =====
app.get('/api/inbox', requireLogin, async (req, res) => {
  const uid = req.session.user.employee_code;
  try {
    const [rows] = await pool.query('SELECT * FROM inbox_items WHERE uid=? ORDER BY timestamp DESC', [uid]);
    res.json(rows.map(r => ({ id: String(r.id), ...JSON.parse(r.item_json || '{}') })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/inbox', requireLogin, async (req, res) => {
  const { toUid, ...item } = req.body;
  try {
    const [result] = await pool.query(
      'INSERT INTO inbox_items (uid, item_json, timestamp) VALUES (?, ?, ?)',
      [toUid, JSON.stringify(item), item.timestamp || Date.now()]
    );
    res.json({ success: true, id: String(result.insertId) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/inbox/:id', requireLogin, async (req, res) => {
  const uid = req.session.user.employee_code;
  try {
    const [rows] = await pool.query('SELECT * FROM inbox_items WHERE id=? AND uid=?', [req.params.id, uid]);
    if (rows.length === 0) return res.status(404).json({ error: 'not found' });
    const updated = { ...JSON.parse(rows[0].item_json || '{}'), ...req.body };
    await pool.query('UPDATE inbox_items SET item_json=? WHERE id=?', [JSON.stringify(updated), req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== 公告 Announcements API =====
app.get('/api/announcements', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM announcements ORDER BY timestamp DESC LIMIT 30');
    res.json(rows.map(r => ({
      id: String(r.id),
      type: r.type,
      uid: r.uid,
      name: r.name,
      photoURL: r.photo_url,
      timestamp: r.timestamp
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/announcements', requireLogin, async (req, res) => {
  const { type, uid, name, photoURL, timestamp } = req.body;
  try {
    await pool.query(
      'INSERT INTO announcements (type, uid, name, photo_url, timestamp) VALUES (?, ?, ?, ?, ?)',
      [type || 'welcome', uid || '', name || '', photoURL || '', timestamp || Date.now()]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== 扭蛋物品 Gacha Items API =====
app.get('/api/gacha-items', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM gacha_items WHERE active=1');
    res.json(rows.map(r => ({
      id: String(r.id),
      name: r.name,
      emoji: r.emoji,
      rarity: r.rarity,
      weight: r.weight,
      type: r.type,
      imgUrl: r.img_url,
      spriteUrl: r.sprite_url,
      active: !!r.active,
      createdAt: r.created_at
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/gacha-items/seed', requireLogin, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT COUNT(*) as cnt FROM gacha_items');
    if (rows[0].cnt > 0) return res.json({ seeded: false, count: rows[0].cnt });
    const items = req.body.items || [];
    for (const item of items) {
      await pool.query(
        'INSERT INTO gacha_items (name, emoji, rarity, weight, type, img_url, sprite_url, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [item.name, item.emoji || '', item.rarity || 'normal', item.weight || 10, item.type || 'animal',
         item.imgUrl || '', item.spriteUrl || '', item.active !== false ? 1 : 0, Date.now()]
      );
    }
    res.json({ seeded: true, count: items.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== 意見回饋 Feedback API =====
app.post('/api/feedback', requireLogin, async (req, res) => {
  const { uid, name, email, avatarUrl, content, imgUrl, timestamp } = req.body;
  try {
    await pool.query(
      'INSERT INTO feedbacks (uid, name, email, avatar_url, content, img_url, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [uid || '', name || '', email || '', avatarUrl || '', content || '', imgUrl || '', timestamp || Date.now()]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== 頁面路由 =====
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

// 啟動（先初始化資料庫再監聽）
initDB().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`感恩小島運行中：http://0.0.0.0:${PORT}`);
  });
});
