# Android App Icon — 香港交通警報中心

為 https://d-hkd.github.io/hk-traffic-super-screen/ 而設的 Android launcher icon。

![預覽](preview.png)

## 設計

沿用網站本身的品牌語言，不是另創一套：

| 元素 | 取自 |
|---|---|
| 深藍底 `#0a1d30 → #040b14` | 網站 `--bg` / `--panel` |
| 青→紫四角星 `#32dcff → #8f7bff` | `icon.svg` 的 `mark` 漸變 |
| 中央深色圓 + 青點 | `.brand-mark` 標記 |
| 左上青色光暈 + 極淡斜向路網 | 頁首 `radial-gradient` 與道路意象 |

星形比例直接跟 `icon.svg` 的路徑：尖端半徑 `R`、凹位半徑 `0.34R`，兩者成 45°，
所以縮到 48px 仍然是清晰的四角星，不會糊成一團。

## 檔案

```
android-icons/
├── mipmap-mdpi/ic_launcher.png           48×48
├── mipmap-hdpi/ic_launcher.png           72×72
├── mipmap-xhdpi/ic_launcher.png          96×96
├── mipmap-xxhdpi/ic_launcher.png        144×144
├── mipmap-xxxhdpi/ic_launcher.png       192×192
├── mipmap-*/ic_launcher_round.png        圓形版本（同上各尺寸）
├── mipmap-anydpi-v26/ic_launcher.xml     Adaptive icon（連 monochrome）
├── mipmap-anydpi-v26/ic_launcher_round.xml
├── drawable/ic_launcher_foreground.png   432×432（前景，透明底）
├── drawable/ic_launcher_background.png   432×432（背景，滿版）
├── values/colors.xml                     背景色 #0A1D30
├── play-store-icon-512.png               512×512、無透明（Play Store 用）
└── preview.png                           各種尺寸對照
```

## 放入 Android Studio

1. 把 `mipmap-*`、`drawable`、`values`、`mipmap-anydpi-v26` 全部複製到
   `app/src/main/res/` 之下（同名資料夾合併）
2. `AndroidManifest.xml` 的 `<application>` 確認：

```xml
android:icon="@mipmap/ic_launcher"
android:roundIcon="@mipmap/ic_launcher_round"
```

3. Adaptive icon 已經處理安全區：前景內容約佔 52%，系統用 66dp 安全區裁形時
   不會切到星角。圓形、方形、水滴形都會自動適應。
4. `monochrome` 已指向同一個前景，Android 13+ 主題圖示（Material You）可用。

## 重新生成

改顏色或星形比例，改 `tools/make-android-icons.py` 頂部的常數，然後：

```bash
python tools/make-android-icons.py
```

需要 Pillow。所有尺寸、XML、Play Store 圖、預覽圖會一次過重出。

## 如果要做成 APK

最簡單是用 **TWA（Trusted Web Activity）** 包裝現有網站：

- 用 [PWABuilder](https://www.pwabuilder.com/) 或 `bubblewrap init --manifest
  https://d-hkd.github.io/hk-traffic-super-screen/manifest.webmanifest`
- 直接沿用本資料夾的 icon（PWABuilder 亦可自動生成，但會是預設樣式）
- TWA 需要 `assetlinks.json` 放在 `docs/.well-known/` 之下
