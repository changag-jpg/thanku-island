const express = require('express');
const path = require('path');
const session = require('express-session');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 9337;

// SeaTalk App 設定（Secret 從環境變數讀取）
const SEATALK_APP_ID = 'MDIxMjA0MDE0MTg3';
const SEATALK_APP_SECRET = process.env.SEATALK_APP_SECRET;
const REDIRECT_URI = 'https://thankuisland.run.ingarena.net/auth/seatalk/callback';

// Session 設定
app.use(session({
  secret: process.env.SESSION_SECRET || 'thanku-island-secret-2026',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// 取得 App Access Token
async function getAppAccessToken() {
  try {
    const res = await axios.post('https://openapi.seatalk.io/auth/app_access_token', {
      app_id: SEATALK_APP_ID,
      app_secret: SEATALK_APP_SECRET
    }, {
      headers: { 'Content-Type': 'application/json' }
    });
    if (res.data.code === 0) return res.data.app_access_token;
    throw new Error('取得 Access Token 失敗：' + res.data.code);
  } catch (err) {
    console.error('getAppAccessToken error:', err.message);
    throw err;
  }
}

// SeaTalk 登入發起路由
app.get('/auth/seatalk/login', (req, res) => {
  const state = Math.random().toString(36).substring(2);
  req.session.oauthState = state;
  const authUrl = `https://login.seatalk.io/authorize?app_id=${SEATALK_APP_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&state=${state}`;
  res.redirect(authUrl);
});

// SeaTalk 登入 Callback
app.get('/auth/seatalk/callback', async (req, res) => {
  const { code, state } = req.query;

  if (!code) return res.redirect('/?error=no_code');

  // 驗證 state 防止 CSRF
  if (state && req.session.oauthState && state !== req.session.oauthState) {
    return res.redirect('/?error=invalid_state');
  }
  req.session.oauthState = null;

  try {
    // Step 1: 取得 App Access Token
    const appToken = await getAppAccessToken();

    // Step 2: 用 code 換取用戶資料
    const userRes = await axios.get('https://openapi.seatalk.io/open_login/code2employee', {
      params: { code },
      headers: { Authorization: `Bearer ${appToken}` }
    });

    if (userRes.data.code !== 0) {
      console.error('code2employee error:', userRes.data);
      return res.redirect('/?error=auth_failed');
    }

    const employee = userRes.data.employee;

    // Step 3: 存入 session
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

// 取得目前登入用戶 API
app.get('/api/me', (req, res) => {
  if (req.session.user) {
    res.json({ success: true, user: req.session.user });
  } else {
    res.json({ success: false });
  }
});

// 登出
app.get('/auth/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// 頁面路由
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`感恩小島運行中：http://0.0.0.0:${PORT}`);
});
