# ULTIMATE11｜香港交通警報中心｜MULTI PLATFORM

設計目標：
- PC / Mac：寬屏三欄控制中心
- iPhone / Android：單欄 + 底部導航
- iPad / Android Tablet：雙欄
- Android TV / 小米盒子：16:9 橫向 TV 版，適合遙控器瀏覽

資料：
- 屯馬綫 / 輕鐵：官方 DATA.GOV.HK MTR API，經 hk-traffic-super-proxy
- 天氣：香港天文台
- 交通消息：運輸署

注意：
- 小米盒子需要可用的 Android TV 瀏覽器並以 HTTPS 開啟網站。
- GPS、通知權限會按裝置及瀏覽器政策要求授權。
- 目前 route planner 的「預計分鐘」是前端智能提示，不等同 Google Maps/真正導航路線引擎。
