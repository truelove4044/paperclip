# Paperclip 專案執行模式分析

更新日期：2026-03-13

## 1. 總覽

Paperclip 的「執行模式」是多層組合，不是單一開關。主要由以下四個維度共同決定：

1. 部署與驗證模式（deployment/auth mode）
2. 資料庫模式（embedded/external postgres）
3. UI 服務模式（vite-dev/static/none）
4. Agent heartbeat 執行模式（timer/assignment/on_demand/automation + adapter）

---

## 2. 部署與驗證模式

### 2.1 Canonical 模型

- `local_trusted`
- `authenticated`（再區分 `private` / `public`）

參考：
- `doc/DEPLOYMENT-MODES.md`
- `packages/shared/src/constants.ts`

### 2.2 實際配置解析（server 啟動時）

- `deploymentMode` 來源優先序：環境變數 -> config file -> 預設 `local_trusted`
- `deploymentExposure` 在 `local_trusted` 下會被強制為 `private`

參考：
- `server/src/config.ts`（`loadConfig()`）

### 2.3 模式約束（硬性檢查）

- `local_trusted` 必須 loopback host（例如 `127.0.0.1`）
- `local_trusted` 只允許 `private` exposure
- `authenticated/public` 要求：
  - `auth.baseUrlMode=explicit`
  - `auth.publicBaseUrl` 必填

參考：
- `server/src/index.ts`

### 2.4 認證行為

- `local_trusted`：Middleware 直接注入 board actor（`local_implicit`）
- `authenticated`：由 Better Auth session 解析 board 身份
- agent：Bearer token（`agent_api_keys` hash 比對）或 local agent JWT

參考：
- `server/src/middleware/auth.ts`
- `server/src/index.ts`（authenticated mode 初始化 Better Auth 區段）

---

## 3. 資料庫模式

### 3.1 外部 Postgres

當 `DATABASE_URL` 有值：

- 直接使用外部 PostgreSQL
- 啟動時檢查/處理 migration

參考：
- `server/src/index.ts`

### 3.2 Embedded PostgreSQL（預設本機模式）

當 `DATABASE_URL` 未設定：

- 啟動 embedded-postgres
- 自動建立 `paperclip` database（若不存在）
- 首次初始化時可自動套 migration

資料目錄預設：
- `~/.paperclip/instances/default/db`

參考：
- `server/src/index.ts`
- `server/src/home-paths.ts`
- `doc/DATABASE.md`

---

## 4. UI 服務模式

server 啟動時會決定 `uiMode`：

- `vite-dev`：開發時透過 Vite middleware 掛在 Express 上
- `static`：提供打包後 UI（`server/ui-dist` 或 `ui/dist`）
- `none`：只跑 API

參考：
- `server/src/index.ts`（`uiMode` 判斷）
- `server/src/app.ts`

補充：
- `pnpm dev` 透過 `scripts/dev-runner.mjs` 會預設 `PAPERCLIP_UI_DEV_MIDDLEWARE=true`，因此常見本機開發是 API+UI 同源。

---

## 5. Agent 執行模式（Heartbeat Runtime）

### 5.1 觸發來源

支援來源：

- `timer`
- `assignment`
- `on_demand`
- `automation`

參考：
- `packages/shared/src/constants.ts`
- `server/src/services/heartbeat.ts`

### 5.2 Scheduler 與背景循環

在同一個 server process 內，以 `setInterval` 方式執行：

- heartbeat timer tick（排程 enqueue）
- orphaned run reaper（清理遺留 run）

參考：
- `server/src/index.ts`

### 5.3 Adapter 執行模型

- `process` adapter：啟動子程序，收 stdout/stderr，支援 timeout/grace
- `http` adapter：發送 HTTP request（可作為 webhook wakeup）
- 另有多種本地 adapter（claude/codex/cursor/gemini/opencode/pi/openclaw_gateway）

參考：
- `server/src/adapters/process/execute.ts`
- `server/src/adapters/http/execute.ts`
- `server/src/adapters/registry.ts`

---

## 6. 開發模式實際行為

### 6.1 預設開發

`pnpm dev`：

- deployment: `local_trusted`
- exposure: `private`
- host 預設 loopback
- DB 預設 embedded PostgreSQL（若無 `DATABASE_URL`）
- UI 走 vite-dev middleware

參考：
- `scripts/dev-runner.mjs`
- `doc/DEVELOPING.md`

### 6.2 Tailscale 友善開發

`pnpm dev --tailscale-auth`：

- 會自動設為 `authenticated/private`
- 綁定 `HOST=0.0.0.0`
- `PAPERCLIP_AUTH_BASE_URL_MODE=auto`

參考：
- `scripts/dev-runner.mjs`
- `doc/DEVELOPING.md`

---

## 7. 執行模式關係圖（摘要）

1. 先決定 deployment/auth：`local_trusted` 或 `authenticated(private/public)`
2. 再決定 DB：`DATABASE_URL` 有無
3. 再決定 UI：`PAPERCLIP_UI_DEV_MIDDLEWARE` 與 `SERVE_UI`
4. 最後在 runtime 內跑 heartbeat scheduler + adapter execution

---

## 8. 觀察到的文件落差

- `AGENTS.md` 第 4 節仍寫「embedded PGlite」，但實際程式碼與其餘文件已是 embedded PostgreSQL。
- 若以目前程式行為為準，應以 `server/src/index.ts` 與 `doc/DATABASE.md` 為主。

---

## 9. 結論

這個專案是「單一 Node server 內整合控制平面」的執行模型：

- HTTP API + UI（可同進程）
- DB（embedded 或 external postgres）
- scheduler/worker（heartbeat + backup + reaper）
- adapter runtime（process/http/各 provider）

在開發體驗上，預設偏向「零設定本機啟動」；在部署上，透過 `authenticated + private/public` 漸進提升安全與外網可用性。