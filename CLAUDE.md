# ThankU Island 交接文件

更新日期：2026-06-01
主要倉庫：https://github.com/changag-jpg/thanku-island
RUN 網址：https://thankuisland.run.ingarena.net
本機工作目錄：`E:\工單\Github\thanku-island`
RUN 工作目錄：`/app`

這份文件給 Claude、Codex 或其他 AI 接手時使用。請先讀這份，再看程式碼。

## 協作規則

- 使用繁體中文回覆使用者。
- 使用者希望每次完成後都提醒是否需要同步 GitHub，並寫下「紀錄名稱」。
- 若有程式或文件修改，通常要提交並推到 `origin/main`，除非使用者明確說不要。
- 不要覆蓋使用者未提交的改動；先看 `git status --short`。
- 不要把密碼、DB password、SeaTalk secret、SSH password 寫進 GitHub。
- 機密資訊請只放在 `CLAUDE.secret.md` 或 RUN 的 `/app/.env.run`。

## 技術架構

- 前台：Vue 3 CDN，主要都在 `index.html`，沒有 build step。
- 後台：`admin.html`。
- 後端：Node.js + Express，入口 `server.js`。
- 資料庫：MySQL，使用 `mysql2/promise`。
- Session：`express-session` + `express-mysql-session`。
- 登入：SeaTalk OAuth。
- Process manager：PM2，RUN 上服務名稱是 `thanku-island`。
- 靜態資源：`assets/`。

## 重要檔案

- `index.html`：主 App、抽卡、信箱、小島、每日任務 Zip 遊戲。
- `admin.html`：管理後台、白名單、發獎、卡池、兌換申請、使用者資料。
- `server.js`：API、DB 初始化、SeaTalk OAuth、PM2 啟動目標。
- `daily-task.html`、`zip-game.html`：每日任務 / Zip 小遊戲相關頁面。
- `assets/ui/origin-power-256.png`：起源之力小圖示。
- `assets/ui/origin-power-512.png`：起源之力大圖示。
- `CLAUDE.secret.md`：只放機密提示，不要公開。

## RUN / Cursor 啟動流程

使用者目前會透過 Cursor 連到 RUN 主機，在 Cursor 終端機貼以下指令。

```bash
cd /app
git fetch origin main
git pull --ff-only origin main

set -a
. /app/.env.run
set +a

if ./node_modules/.bin/pm2 describe thanku-island >/dev/null 2>&1; then
  ./node_modules/.bin/pm2 restart thanku-island --update-env
else
  ./node_modules/.bin/pm2 start server.js --name thanku-island --update-env
fi

./node_modules/.bin/pm2 save
./node_modules/.bin/pm2 list
./node_modules/.bin/pm2 logs thanku-island --lines 60 --nostream
```

成功判斷：

- `pm2 list` 有 `thanku-island`。
- `status` 是 `online`。
- log 有 `感恩小島運行中：http://0.0.0.0:9337`。
- 若 DB 正常，會看到 `資料庫初始化完成`。

如果 PM2 顯示 `Process or Namespace thanku-island not found`，直接使用上面的完整流程即可，因為它會自動改用 `pm2 start`。

## 環境變數

RUN 端使用 `/app/.env.run` 載入環境變數。需要的 key：

- `DB_HOST`
- `DB_PORT`
- `DB_USER`
- `DB_PASSWORD`
- `DB_NAME`
- `SEATALK_APP_SECRET`

注意：

- `DB_HOST` 只放 host，不要包含 `:3306`。
- `DB_PORT` 另外放 `3306`。
- 不要在交接或 commit message 裡寫出實際密碼。

## 最近重要提交

- `7f0c058` - `Replace origin power icon assets`
  - 新增 `assets/ui/origin-power-256.png` 和 `assets/ui/origin-power-512.png`。
  - 前台與後台把舊票券圖示換成起源之力圖片。
- `786828b` - `Improve visit mode refresh and gacha card readability`
  - 參觀別人小島時顯示參觀狀態、隱藏編輯按鈕。
  - 每次參觀都呼叫 `/api/island/:uid` 重新讀取最新島嶼與地形。
  - 抽卡結果改白底，傳說品質用微金色光暈。
- `a0e008c` - `Show remaining thank cards in admin users`
  - 後台使用者清單可看到剩餘感謝卡。
- `f50d146` - `Force resource refresh after cards and gacha spend`
  - 寄卡與抽卡後強制刷新前端資源顯示。
- `b88cbba` - `Add gacha summon reveal animation`
  - 單抽與十連抽加入抽卡儀式感。
- `035146b` - `Fix Zip task tab initialization`
  - 修正每日任務頁初始化。

## 目前功能狀態

### 起源之力

- 原「傳說點券」已改名為「起源之力」。
- 收到 1 張感謝卡會得到 1 點起源之力。
- 起源之力可在「起源兌換處」送出兌換申請。
- 申請會進後台，工作人員後續發送到傳說對決遊戲中。
- 後台兌換資料 API 在 `server.js` 的「起源之力兌換」區塊。
- UI 圖示使用：
  - 小型：`assets/ui/origin-power-256.png`
  - 大型：`assets/ui/origin-power-512.png`

### 每日任務 / Zip 除草小遊戲

- 主要前端在 `index.html` 的 Zip 區塊。
- 後端資料表：`zip_scores`、`zip_settlements`。
- 主要 API：
  - `GET /api/zip/today`
  - `POST /api/zip/start`
  - `POST /api/zip/score`
  - `GET /api/zip/weekly`
- 設計重點：
  - 第一次按開始會建立當日紀錄與 `started_at`。
  - 完成後寫入秒數與 `completed=1`。
  - 完成後今日不能重玩。
  - 每日排行榜與每週排行榜從 MySQL 讀取。
- 重要坑：
  - `submitScore(scoreSeconds)` 必須送出秒數，不可以退回 `body:'{}'`。
  - RUN 若沒有拉到最新 Git，會出現排行榜不保存或完成狀態消失。
  - 前端切頁離開遊戲時要暫停本地計時，不要讓背景持續加秒。

### 抽卡

- 抽卡 UI 在 `index.html`。
- 單抽與十連抽有 reveal animation。
- 結果卡片都應維持白底，避免黑字看不清。
- 傳說品質只用微金色光暈與邊框標示，不要整張變深色。

### 參觀別人的島

- 前端方法：`visitUser(id)`。
- 後端 API：`GET /api/island/:uid`。
- 參觀時：
  - 會顯示「參觀中」狀態。
  - 右上角「裝飾小島」與「編輯小島」會隱藏。
  - 每次都用 `cache: 'no-store'` 向伺服器拿最新島嶼與地形。
  - `window.islandEngine.importTiles([])` 必須能清空舊地形，避免快取殘留。

### 後台

- 後台入口：`/admin`。
- 使用 SeaTalk session + `admin_whitelist` 判斷權限。
- 後台目前支援：
  - 使用者清單，包含剩餘感謝卡、能量、起源之力。
  - 管理員發獎。
  - 卡池與卡池分組管理。
  - 全站公告。
  - 使用者反饋。
  - 起源之力兌換申請與 CSV 匯出。
  - 白名單管理。

## 常見問題

### RUN 顯示 PM2 沒有 thanku-island

使用完整啟動流程，不要只跑 restart。完整流程會自動判斷 start/restart。

### `./node_modules/.bin/pm2` 不存在

通常是 RUN 上 `npm install` 後 PM2 位置或版本被動到。先跑：

```bash
cd /app
npm install
```

再跑完整啟動流程。

### DB 初始化失敗：Access denied

代表 DB 帳密、host 授權或 `/app/.env.run` 有問題。不要把密碼貼進公開文件。確認：

- `/app/.env.run` 有載入。
- `DB_PASSWORD` 長度正確。
- `DB_HOST` 是 RUN 可連線的 host。
- MySQL 允許 RUN 容器來源連線。

### avatar_url 太長

曾看過 log：

```text
POST /api/profiles error: Data too long for column 'avatar_url'
```

這代表 `profiles.avatar_url` 欄位長度不足。尚未整理成正式修復時，接手者要小心這可能影響 profile 儲存。

## 本機檢查指令

提交前建議至少跑：

```powershell
node --check server.js
node -e "const fs=require('fs'),vm=require('vm'); for (const f of ['index.html','admin.html','daily-task.html','zip-game.html']) { const s=fs.readFileSync(f,'utf8'); const scripts=[...s.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]); scripts.forEach((code,i)=>new vm.Script(code,{filename:f+'#script'+i})); console.log(f,'inline scripts ok:',scripts.length); }"
git diff --check
git status --short
```

## Git 提交習慣

常用流程：

```bash
git status --short
git add <changed-files>
git commit -m "Record name here"
git push origin main
```

回覆使用者時要附：

- 做了什麼。
- 驗證跑了什麼。
- GitHub 是否已上傳。
- Commit SHA。
- 紀錄名稱。
- 若需要部署，附 RUN/Cursor 啟動流程或最新 cache-bust URL，例如 `?v=<commit>`。
