# Worker 部署指南

這份 Worker 提供前端用到的 `/api/rail`、`/api/bus`、`/api/roads`、`/weather`、`/trafficnews`，
以及可選的 Web Push。**部署一次之後，前端不用改任何設定**（Workers 網址不變）。

部署後：
- 巴士面板會由「`/api/bus` 404」變成真實班次
- 道路面板會由「無車速數據」變成真實車速

---

## 0. 前置檢查

在終端機輸入：

```bash
node -v
npx --version
```

兩個都要有版本號。

> 如果顯示「找不到命令」，先安裝 Node.js LTS：https://nodejs.org/（安裝後重開終端機）。
> 這部機的 `node` 可能只在 DeepSeek Harness 的內建路徑，系統 PATH 沒有——最穩妥是自己裝一次 Node。

有 Cloudflare 帳號（免費方案已夠）就繼續；未有的話先去 https://dash.cloudflare.com/sign-up 註冊。

---

## 1. 進入 worker 資料夾

```bash
cd hk-traffic-rewrite/worker
```

## 2. 登入 Cloudflare

```bash
npx wrangler login
```

瀏覽器會彈出授權頁，按 **Allow**。完成後確認身份：

```bash
npx wrangler whoami
```

應該見到你的 email 同帳戶。

## 3. 部署（第一次，先不啟用推送）

```bash
npx wrangler deploy
```

成功會印出類似：

```
Uploaded hk-traffic-super-proxy
Deployed hk-traffic-super-proxy triggers
  https://hk-traffic-super-proxy.<你的子網域>.workers.dev
  schedule: */5 * * * *
```

> 如果出現 `KV namespace ... not found`，表示 `wrangler.toml` 內的 KV 段仍被註解掉了——這是預期行為，
> 因為推送未啟用。想啟用就做第 5 步。

## 4. 驗證

```bash
curl "https://hk-traffic-super-proxy.<你的子網域>.workers.dev/api/roads"
curl "https://hk-traffic-super-proxy.<你的子網域>.workers.dev/api/bus?stops=79D68EE7C6CBAB9D"
```

- `/api/roads` 應回 `{"ok":true,"period":"...","roads":{...}}`
- `/api/bus` 應回 `{"ok":true,"stops":{...}}`

之後重新整理網站，巴士同車速就會出真數據。

---

## 5.（可選）啟用 Web Push

推送需要額外兩樣：KV（存訂閱）＋ VAPID 金鑰。

### 5.1 建 KV

```bash
npx wrangler kv namespace create SUBSCRIPTIONS
```

回傳類似：

```
[[kv_namespaces]]
binding = "SUBSCRIPTIONS"
id = "abc123def456..."
```

把 `id` 貼入 `wrangler.toml`，並**取消註解**整段 `[[kv_namespaces]]`。

### 5.2 產生 VAPID 金鑰

```bash
node ../tools/make-vapid-keys.mjs
```

會印出兩行，逐個設為 secret：

```bash
npx wrangler secret put VAPID_PUBLIC_KEY     # 貼 VAPID_PUBLIC_KEY= 後面那串
npx wrangler secret put VAPID_PRIVATE_KEY   # 貼 VAPID_PRIVATE_KEY= 後面那串
npx wrangler secret put VAPID_SUBJECT       # 例如 mailto:you@example.com
```

### 5.3 重新部署

```bash
npx wrangler deploy
```

### 5.4 驗證

```bash
curl "https://hk-traffic-super-proxy.<你的子網域>.workers.dev/api/push/key"
```

應回 `{"ok":true,"key":"B..."}`；然後到網站按右上角 🔔 訂閱。

---

## 常見錯誤

| 訊息 | 原因 | 解決 |
|---|---|---|
| `Not logged in` / `Invalid API Token` | 未登入或登入過期 | `npx wrangler login` |
| `KV namespace ... not found` | `wrangler.toml` 的 KV id 未填 | 做第 5.1 步，或保持 KV 段註解（不需要推送時） |
| `Could not resolve "..."` | 依賴未安裝 | 在專案根目錄 `pnpm install` |
| `npx: command not found` | 未裝 Node.js | 安裝 Node LTS 後重開終端機 |
| 部署後仍是 404 | 前端連去舊 Worker 網址 | 檢查 `src/config.ts` 的 `APP.proxyBase` 是否指對 |

## 修改後重新部署

```bash
cd hk-traffic-rewrite/worker
npx wrangler deploy
```

Worker 沒有 build step，改完直接 deploy 即生效。
