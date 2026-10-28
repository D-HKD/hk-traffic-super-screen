#!/usr/bin/env python3
"""
香港交通警報中心 — Android App Icon 生成器
==========================================

設計與網站品牌一致：
  深藍底（#06111f → #0a1d30）
  青→紫四角星（#32dcff → #8f7bff）
  中央圓點（品牌標記）

輸出：
  android-icons/mipmap-*/ic_launcher.png        （48–192，圓角方形）
  android-icons/mipmap-*/ic_launcher_round.png  （圓形）
  android-icons/mipmap-anydpi-v26/*.xml         （Adaptive Icon）
  android-icons/drawable/ic_launcher_foreground.png
  android-icons/values/colors.xml
  android-icons/play-store-icon-512.png
  android-icons/preview.png

重新生成：python tools/make-android-icons.py
"""

from __future__ import annotations

import math
import os
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

# ── 品牌色 ──────────────────────────────────────────────────────────
BG_TOP = (10, 29, 48)       # #0a1d30
BG_BOTTOM = (4, 11, 20)     # #040b14
RING = (27, 109, 146)       # #1b6d92
CYAN = (50, 220, 255)       # #32dcff
PURPLE = (143, 123, 255)    # #8f7bff
VIOLET = (177, 140, 255)    # #b18cff

SS = 4                      # supersampling factor
OUT = Path(__file__).resolve().parent.parent / "android-icons"


def lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


def mix(c1, c2, t: float):
    return tuple(int(round(lerp(c1[i], c2[i], t))) for i in range(3))


def star_points(cx: float, cy: float, radius: float, inner: float = 0.34, samples_per_edge: int = 26):
    """
    四角星（✦）：八個頂點，長短半徑交替。

    比例直接跟網站 icon.svg（M256 108 → 292 220 → 404 256 …）：
    尖端在半徑 R，凹位在半徑 0.34R，兩者成 45°，形成尖銳內凹。
    每條邊再細分取樣，方便日後微調曲率。
    """
    pts = []
    for i in range(8):
        theta = (i / 8) * 2 * math.pi - math.pi / 2  # 由正上方開始
        r = radius if i % 2 == 0 else radius * inner
        pts.append((cx + r * math.cos(theta), cy + r * math.sin(theta)))
    # 邊上取樣（保持直線，只是多取點讓抗鋸齒更好）
    dense = []
    for i in range(len(pts)):
        a = pts[i]
        b = pts[(i + 1) % len(pts)]
        for s in range(samples_per_edge):
            t = s / samples_per_edge
            dense.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
    return dense


def diagonal_gradient(size: int, c1, c2):
    """左上→右下漸變。"""
    grad = Image.new("RGB", (size, size))
    px = grad.load()
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * (size - 1))
            px[x, y] = mix(c1, c2, t)
    return grad


def gradient_layer(size: int, c1, c2):
    """垂直漸變（星形內部用）。"""
    grad = Image.new("RGB", (size, size))
    px = grad.load()
    for y in range(size):
        t = y / (size - 1)
        row = mix(c1, c2, t)
        for x in range(size):
            px[x, y] = row
    return grad


def rounded_mask(size: int, radius_ratio: float) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(mask)
    r = int(size * radius_ratio)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=r, fill=255)
    return mask


def circle_mask(size: int) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(mask)
    d.ellipse([0, 0, size - 1, size - 1], fill=255)
    return mask


def draw_background(size: int, bleed: bool = False) -> Image.Image:
    """深藍漸變 + 左上青光 + 極細路網紋理。"""
    s = size * SS
    base = diagonal_gradient(s, BG_TOP, BG_BOTTOM).convert("RGBA")

    # 左上角青色光暈
    glow = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse(
        [-s * 0.35, -s * 0.45, s * 0.75, s * 0.65],
        fill=(50, 220, 255, 58),
    )
    glow = glow.filter(ImageFilter.GaussianBlur(s * 0.12))
    base = Image.alpha_composite(base, glow)

    # 細線路網（代表道路／路軌），只在夠大時畫
    if size >= 48:
        net = Image.new("RGBA", (s, s), (0, 0, 0, 0))
        nd = ImageDraw.Draw(net)
        for i in range(-2, 6):
            x = s * (0.12 + i * 0.22)
            nd.line([(x, s * 1.05), (x + s * 0.55, -s * 0.05)], fill=(50, 220, 255, 16), width=max(1, int(s * 0.006)))
        net = net.filter(ImageFilter.GaussianBlur(s * 0.004))
        base = Image.alpha_composite(base, net)

    # 內框（品牌標記的細邊）
    if not bleed:
        d = ImageDraw.Draw(base)
        inset = s * 0.028
        d.rounded_rectangle(
            [inset, inset, s - inset - 1, s - inset - 1],
            radius=int(s * 0.20),
            outline=(27, 109, 146, 120),
            width=max(1, int(s * 0.006)),
        )
    return base


def draw_mark(size: int, star_ratio: float = 0.62, with_glow: bool = True) -> Image.Image:
    """透明的四角星 + 中央圓點（放在背景之上）。"""
    s = size * SS
    layer = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    cx = cy = s / 2
    radius = s * star_ratio / 2

    pts = star_points(cx, cy, radius)

    # 光暈
    if with_glow:
        glow_mask = Image.new("L", (s, s), 0)
        ImageDraw.Draw(glow_mask).polygon(pts, fill=255)
        glow_mask = glow_mask.filter(ImageFilter.GaussianBlur(s * 0.035))
        glow = Image.new("RGBA", (s, s), CYAN + (70,))
        layer = Image.alpha_composite(layer, Image.composite(glow, Image.new("RGBA", (s, s), (0, 0, 0, 0)), glow_mask))

    # 星形本體：青 → 紫
    star_mask = Image.new("L", (s, s), 0)
    ImageDraw.Draw(star_mask).polygon(pts, fill=255)
    star = gradient_layer(s, CYAN, PURPLE).convert("RGBA")
    layer = Image.alpha_composite(layer, Image.composite(star, Image.new("RGBA", (s, s), (0, 0, 0, 0)), star_mask))

    # 中央深色圓 + 青點（品牌標記）
    d = ImageDraw.Draw(layer)
    r_outer = radius * 0.30
    r_inner = radius * 0.16
    d.ellipse([cx - r_outer, cy - r_outer, cx + r_outer, cy + r_outer], fill=(4, 11, 20, 255))
    d.ellipse([cx - r_inner, cy - r_inner, cx + r_inner, cy + r_inner], fill=CYAN + (255,))

    return layer.resize((size, size), Image.LANCZOS)


def compose(size: int, mask: str = "rounded", adaptive_fg: bool = False, bleed: bool = False) -> Image.Image:
    bg = draw_background(size, bleed=bleed).resize((size, size), Image.LANCZOS)
    if adaptive_fg:
        mark = draw_mark(size, star_ratio=0.52)
        return mark  # 前景透明，背景由 Android 提供
    mark = draw_mark(size, star_ratio=0.62)
    img = Image.alpha_composite(bg, mark)
    if mask == "rounded":
        out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        out.paste(img, (0, 0), rounded_mask(size, 0.225))
        return out
    if mask == "circle":
        out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        out.paste(img, (0, 0), circle_mask(size))
        return out
    return img


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    densities = {
        "mdpi": 48,
        "hdpi": 72,
        "xhdpi": 96,
        "xxhdpi": 144,
        "xxxhdpi": 192,
    }

    for name, px in densities.items():
        folder = OUT / f"mipmap-{name}"
        folder.mkdir(parents=True, exist_ok=True)
        compose(px, "rounded").save(folder / "ic_launcher.png", optimize=True)
        compose(px, "circle").save(folder / "ic_launcher_round.png", optimize=True)
        print(f"  mipmap-{name}: {px}px")

    # Adaptive icon（前景 432 = 108dp @ xxxhdpi，安全區 66dp）
    fg_dir = OUT / "drawable"
    fg_dir.mkdir(parents=True, exist_ok=True)
    compose(432, adaptive_fg=True).save(fg_dir / "ic_launcher_foreground.png", optimize=True)
    # 背景（純色就夠，Android 會裁形）
    compose(432, "square", bleed=True).save(fg_dir / "ic_launcher_background.png", optimize=True)

    anydpi = OUT / "mipmap-anydpi-v26"
    anydpi.mkdir(parents=True, exist_ok=True)
    xml = """<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/ic_launcher_background" />
    <foreground android:drawable="@drawable/ic_launcher_foreground" />
    <monochrome android:drawable="@drawable/ic_launcher_foreground" />
</adaptive-icon>
"""
    (anydpi / "ic_launcher.xml").write_text(xml, encoding="utf-8")
    (anydpi / "ic_launcher_round.xml").write_text(xml, encoding="utf-8")

    values = OUT / "values"
    values.mkdir(parents=True, exist_ok=True)
    (values / "colors.xml").write_text(
        """<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#0A1D30</color>
</resources>
""",
        encoding="utf-8",
    )

    # Play Store：512×512、無透明、滿版
    play = compose(512, "square", bleed=True).convert("RGB")
    play.save(OUT / "play-store-icon-512.png", optimize=True)

    # 預覽圖
    make_preview(densities)
    print("完成：", OUT)



def cjk_font(size: int):
    """預覽圖用中文字型；找不到就退返預設（會顯示方框）。"""
    for path in (
        r"C:\Windows\Fonts\msjh.ttc",
        r"C:\Windows\Fonts\msjhbd.ttc",
        r"C:\Windows\Fonts\mingliu.ttc",
        "/System/Library/Fonts/PingFang.ttc",
        "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
    ):
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                continue
    return ImageFont.load_default()
def make_preview(densities: dict[str, int]) -> None:
    pad = 28
    sizes = [192, 144, 96, 72, 48]
    width = pad * 2 + sum(sizes) + pad * (len(sizes) - 1)
    height = 192 + pad * 2 + 230
    sheet = Image.new("RGB", (width + 320, height), (6, 17, 31))
    d = ImageDraw.Draw(sheet)

    small = cjk_font(13)
    label = cjk_font(15)

    x = pad
    for s in sizes:
        icon = compose(s, "rounded")
        sheet.paste(icon, (x, pad + (192 - s)), icon)
        d.text((x, pad + 200), f"{s}px", fill=(155, 185, 202), font=small)
        x += s + pad

    # 圓形版本
    round_icon = compose(120, "circle")
    sheet.paste(round_icon, (pad, pad + 240), round_icon)
    d.text((pad, pad + 240 + 128), "round", fill=(155, 185, 202), font=small)
    d.text((pad + 130, pad + 250), "Adaptive icon 會由系統裁形，", fill=(120, 150, 170), font=small)
    d.text((pad + 130, pad + 270), "圓形／方形／水滴都會自動適應。", fill=(120, 150, 170), font=small)

    # 右側：模擬手機桌面
    phone_x = width + 30
    d.rounded_rectangle([phone_x, pad, phone_x + 250, pad + 420], radius=26, fill=(12, 26, 44))
    big = compose(108, "rounded")
    sheet.paste(big, (phone_x + 71, pad + 46), big)
    d.text((phone_x + 58, pad + 172), "香港交通警報中心", fill=(244, 251, 255), font=label)
    d.text((phone_x + 96, pad + 196), "屯元天即時交通", fill=(155, 185, 202), font=small)

    sheet.save(OUT / "preview.png", optimize=True)


if __name__ == "__main__":
    main()
