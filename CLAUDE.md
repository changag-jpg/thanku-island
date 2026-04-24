# 感恩小島 ThankU Island — Claude 工作手冊

這份文件是給 Claude Code 看的，包含所有需要知道的專案資訊，讓每次對話都能直接接手，不需要重新交接。

---

## 使用者背景

- 使用者**沒有開發背景**，需要每個步驟都說清楚具體操作
- 例如：「點左側原始檔控制 → 輸入說明 → 點提交」，不能只說「提交程式碼」
- 每完成一件事，**主動告訴使用者下一步**，不要等他問

---

## 專案基本資訊

| 項目 | 內容 |
|------|------|
| 本機路徑 | `E:\工單\Github\thanku-island\` |
| GitHub | https://github.com/changag-jpg/thanku-island |
| 正式網址 | https://thankuisland.run.ingarena.net |
| 部署平台 | RUN 平台（https://run.ingarena.net） |

---

## 技術架構

- **前端**：Vue 3 CDN，單一 `index.html`，無 build step（不需要 npm run build）
- **後端**：Node.js + Express（`server.js`）
- **資料庫**：MySQL（已從 Firebase 遷移，由 RUN 平台提供）
- **圖片托管**：Cloudinary（Cloud name: `djjbj67s5`，preset: `gsik1r4i`）
- **登入系統**：SeaTalk OAuth（官方 JS 按鈕）
- **Session 管理**：express-session
- **Process Manager**：pm2（安裝在 node_modules 內）
- **部署方式**：RUN 平台 Docker 容器，透過 SSH 管理

---

## 伺服器 SSH 連線資訊

> 詳細帳密見 **CLAUDE.secret.md**（本機存放，不上傳 GitHub）

| 項目 | 內容 |
|------|------|
| SSH Port | 見 CLAUDE.secret.md |
| SSH User | 見 CLAUDE.secret.md |
| SSH 密碼 | 見 CLAUDE.secret.md |
| 容器 ID | 見 CLAUDE.secret.md |
| 專案路徑 | /app |

---

## 環境變數（伺服器上需設定，不可寫入 Git）

啟動 pm2 時需要帶入以下環境變數（向使用者索取 DB 相關資訊）：

| 變數名稱 | 說明 |
|----------|------|
| `SEATALK_APP_SECRET` | SeaTalk OAuth 密鑰（向使用者確認） |
| `DB_HOST` | MySQL 主機位址（向使用者確認） |
| `DB_PORT` | MySQL 連接埠，通常是 3306 |
| `DB_USER` | MySQL 使用者名稱（向使用者確認） |
| `DB_PASSWORD` | MySQL 密碼（向使用者確認） |
| `DB_NAME` | MySQL 資料庫名稱（向使用者確認） |

---

## SeaTalk OAuth 設定

> App ID 與 Secret 見 **CLAUDE.secret.md**

| 項目 | 內容 |
|------|------|
| App ID | 見 CLAUDE.secret.md |
| App Secret | 見 CLAUDE.secret.md |
| Redirect URI | https://thankuisland.run.ingarena.net/auth/seatalk/callback |

---

## 部署流程（三種情境）

### 情境 A：一般更新（只改程式碼，沒加新套件）

**① VS Code**
1. 左側「原始檔控制」→ 輸入說明 → 點「提交」
2. 點「同步變更」

**② SSH 伺服器**
```bash
cd /app
git pull origin main
./node_modules/.bin/pm2 restart thanku-island
```

---

### 情境 B：有新增 npm 套件（package.json 有變動）

**① VS Code**：提交 → 同步變更

**② SSH 伺服器**
```bash
cd /app
git pull origin main
npm install
./node_modules/.bin/pm2 restart thanku-island
```

---

### 情境 C：全新部署 / 容器被重置（第一次或環境被清空）

**① VS Code**：提交 → 同步變更

**② RUN 平台網頁**
1. 登入 https://run.ingarena.net
2. 找到 `thanku-island` 專案
3. 點「重新部署」或「Git 導入」→ 填入 `https://github.com/changag-jpg/thanku-island` → 選 `main` 分支
4. 等待部署完成

**③ SSH 伺服器**
```bash
cd /app
git clone https://github.com/changag-jpg/thanku-island .
npm install
./node_modules/.bin/pm2 delete thanku-island
```
然後執行（完整指令含密鑰見 **CLAUDE.secret.md**，DB 資訊向使用者確認）：
```bash
DB_HOST='你的主機' DB_PORT='3306' DB_USER='你的帳號' DB_PASSWORD='你的密碼' DB_NAME='你的資料庫名' SEATALK_APP_SECRET='見CLAUDE.secret.md' ./node_modules/.bin/pm2 start server.js --name thanku-island
```

**確認成功**：
```bash
./node_modules/.bin/pm2 logs thanku-island --lines 30
```
看到「資料庫初始化完成」和「感恩小島運行中」= 成功。

---

## 目前進度（2026-04-24）

### 剛完成：Firebase → MySQL 遷移

已將所有 Firestore 操作全部換成內部 API（`fetch('/api/...')`）：

| 原本（Firestore） | 現在（MySQL API） |
|-------------------|-------------------|
| `db.collection('users')` | `fetch('/api/user')` |
| `db.collection('profiles')` | `fetch('/api/profiles')` |
| `db.collection('tiles')` | `fetch('/api/tiles')` |
| `db.collection('letters')` | `fetch('/api/letters')` |
| `db.collection('inboxes')` | `fetch('/api/inbox')` |
| `db.collection('announcements')` | `fetch('/api/announcements')` |
| `db.collection('gacha_items')` | `fetch('/api/gacha-items')` |
| `db.collection('feedbacks')` | `fetch('/api/feedback')` |

Firebase SDK 已從 `index.html` 完全移除。

### 目前卡關的步驟

使用者正在做情境 C 部署中的 SSH 步驟，執行到：
```bash
git clone https://github.com/changag-jpg/thanku-island .
```
（因為 `/app` 裡只有 `package-lock.json`，沒有其他檔案）

下一步是 `git clone` 完成後繼續 `npm install` 和 pm2 啟動。

---

## 待完成事項

1. **MySQL 部署完成並測試**（目前進行中）
2. **9 隻島民美術**：靜止圖 256×256px + 走路雪碧圖 1024×256px
3. **裝飾品圖片更換**
4. **EmailJS 站外通知**（待設定）

---

## server.js API 路由總覽

### 認證
- `GET /api/me` — 取得目前登入使用者（session）
- `GET /auth/seatalk/callback` — SeaTalk OAuth callback
- `GET /auth/logout` — 登出

### 使用者資料
- `GET /api/user` — 取得自己的完整資料（需登入）
- `POST /api/user` — 儲存自己的資料（需登入）
- `DELETE /api/user` — 刪除自己的帳號（需登入）

### 公開 Profile
- `GET /api/profiles` — 取得所有使用者公開資料
- `GET /api/profiles/:id` — 取得特定使用者公開資料
- `POST /api/profiles` — 更新自己的公開資料（需登入）

### 地形
- `GET /api/tiles` — 取得自己的地形（需登入）
- `GET /api/tiles/:uid` — 取得任何人的地形（公開）
- `POST /api/tiles` — 儲存自己的地形（需登入）

### 感謝信
- `GET /api/letters` — 取得全站感謝信（公開）
- `POST /api/letters` — 寄出感謝信（需登入）
- `POST /api/letters/:id/likes` — 更新按讚（需登入）

### 收件箱
- `GET /api/inbox` — 取得自己的收件箱（需登入）
- `POST /api/inbox` — 寫入收件人的 inbox（需登入，body 帶 `toUid`）
- `PATCH /api/inbox/:id` — 更新 inbox 項目（需登入，限本人）

### 公告
- `GET /api/announcements` — 取得公告（公開）
- `POST /api/announcements` — 新增公告（需登入）

### 扭蛋物品
- `GET /api/gacha-items` — 取得扭蛋清單（公開）
- `POST /api/gacha-items/seed` — 初始化預設物品（若資料庫為空）

### 回饋
- `POST /api/feedback` — 送出意見回饋（需登入）

---

## MySQL 資料表結構

伺服器啟動時會自動建立所有資料表（`initDB()` 函式），不需要手動建立。

| 資料表 | 用途 |
|--------|------|
| `user_data` | 使用者主資料（island, warehouse, letters 等） |
| `profiles` | 公開 profile（供 Sea 群島顯示） |
| `tiles` | 島嶼地形資料 |
| `letters` | 全站感謝信（佈告欄） |
| `inbox_items` | 收件箱（含信件、管理員發放道具） |
| `announcements` | 系統公告（新帳號歡迎等） |
| `gacha_items` | 扭蛋物品池 |
| `feedbacks` | 使用者意見回饋 |

---

## 重要注意事項

1. **index.html 是單一大檔**，所有 Vue 前端程式碼都在裡面，沒有獨立的 .vue 檔案
2. **沒有 build step**，直接修改 index.html 就是前端部署
3. **pm2 不讀取 ~/.bashrc**，所以環境變數必須在 pm2 start 指令中帶入，不能靠 export
4. **伺服器重置後 pm2 環境變數會消失**，需重新用情境 C 啟動
5. **RUN 平台重新匯入會清空 /app**，需重新 git clone 和 npm install
6. **Firebase 已完全移除**，不要再加回 Firebase 相關程式碼
