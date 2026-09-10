# 香港交通控制中心 ULTIMATE 6

緊湊型香港交通控制中心介面。

## 內容
- 屯馬綫實時 ETA：天水圍、朗屏、屯門
- 輕鐵實時 ETA：天榮、屯門站、兆禧
- 運輸署最新交通消息
- 主要道路監察狀態
- GPS 定位 + 最近天文台觀測站天氣
- 智能語音報告、夜間模式、全螢幕

## Cloudflare Worker
網站使用：
`https://hk-traffic-super-proxy.idyl-2014061.workers.dev`

不要修改舊的 `mtr-eta-proxy` Worker。


ULTIMATE7 fixes:
- Tuen Ma Line and Light Rail now use the stable `/mtr?url=...` proxy endpoint, so no new Cloudflare Worker route is required if the existing proxy already supports `/mtr`.
- Rail loading uses Promise.allSettled so one failed Light Rail station cannot hide all rail data.
- Mobile clock is smaller and constrained to prevent overflow.
- Mobile status cards no longer create a clipped horizontal strip.
- This is still a web/PWA dashboard. It is not a native Apple CarPlay app; the dashboard itself cannot be rendered as a CarPlay screen from Safari/GitHub Pages.
