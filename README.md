# 香港交通控制中心 ULTIMATE 8

全新重新定義的交通資訊頁面。這版不再使用大型鐵路運行圖，主頁直接突出：

- 屯馬綫實時 ETA：天水圍、朗屏、屯門
- 輕鐵實時 ETA：天榮、屯門、兆禧
- 主要道路交通狀態
- 最新運輸署交通消息
- GPS 選取最近天文台觀測站及天氣
- 語音即時／定時報告
- 手機直向版重新排版

## GitHub
替換：`index.html`、`style.css`、`app.js`、`manifest.json`、`README.md`。

## Cloudflare
`cloudflare/worker.js` 是配套 Proxy。它保留 `/tml`、`/lrt`、`/mtr`、`/weather`、`/trafficnews`。如果現有 `hk-traffic-super-proxy` 已經能正常提供這些 endpoint，可以不重新部署；如仍出現「連線重試」，再把此 worker 更新。

## 資料來源
MTR 官方實時列車／輕鐵 API、運輸署交通消息、香港天文台開放數據。
