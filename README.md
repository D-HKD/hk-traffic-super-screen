# 香港交通控制中心 ULTIMATE 4

以「香港交通控制中心」風格重新設計：
- 大型動態鐵路／輕鐵示意運行圖
- 屯馬綫、輕鐵實時 ETA
- 列車沿線動畫
- GPS 位置光點
- GPS → 最近香港天文台觀測站 → 所在地區天氣
- 天氣圖示／狀態
- 最新運輸署交通消息
- 交通狀態燈號
- 男聲／女聲／自動語音報告
- 5 / 10 / 15 / 30 分鐘自動語音
- 全螢幕／夜間模式
- 手機／平板／顯示器響應式

## GitHub
上傳根目錄：
index.html
style.css
app.js
manifest.json
README.md

cloudflare/worker.js 可保留作 Worker 備份。

## Cloudflare
本網站使用新 Worker：
https://hk-traffic-super-proxy.idyl-2014061.workers.dev

不要修改舊 mtr-eta-proxy。

## 資料
MTR / Light Rail 官方實時 API、香港天文台 Open Data、運輸署交通消息。
