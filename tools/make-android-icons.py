#!/usr/bin/env python3
"""
香港交通警報中心 — Android App Icon 生成器（路線＋站點版）
==========================================================

設計：
  深藍底（#0a1d30 → #040b14）＋ 左上青光暈
  青色路線（圓頭折線）代表屯馬綫／輕鐵路網
  白色站點（深色外環）代表車站
  背後一條極淡的道路斜線，暗示路網不只鐵路

輸出：
  android-icons/mipmap-*/ic_launcher.png        48–192（圓角方形）
  android-icons/mipmap-*/ic_launcher_round.png  圓形
  android-icons/mipmap-anydpi-v26/*.xml         Adaptive icon
  android-icons/drawable/ic_launcher_foreground.png / _background.png
  android-icons/values/colors.xml
  android-icons/play-store-icon-512.png
  android-icons/preview.png

重新生成：python tools/make-android-icons.py
"""

from __future__ import annotations

import os
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

SS = 4  # supersampling

BG_TOP = (10, 29, 48)      # #0a1d30
BG_BOTTOM = (4, 11, 20)    # #040b14
CYAN = (50, 220, 255)      # #32dcff
CYAN_D = (17, 169, 238)    # #11a9ee
WHITE = (244, 251, 255)
DARK = (4, 11, 20)
RING = (27, 109, 146)

OUT = Path(__file__).resolve().parent.parent / "android-icons"

# 路線的三個轉角（比例座標），由左下走上右上
ROUTE = [
    (0.24, 0.76),
    (0.24, 0.50),
    (0.50, 0.50),
    (0.50, 0.26),
    (0.76, 0.26),
]
STATIONS = [0, 2, 4]


def mix(c1, c2, t):
    return tuple(int(round(c1[i] + (c2[i] - c1[i]) * t)) for i in range(3))


def vertical_gradient(size: int, c1, c2) -> Image.Image:
    g = Image.new("RGB", (size, size))
    px = g.load()
    for y in range(size):
        row = mix(c1, c2, y / (size - 1))
        for x in range(size):
            px[x, y] = row
    return g.convert("RGBA")


def cap_line(draw, pts, width, fill):
    for i in range(len(pts) - 1):
        draw.line([pts[i], pts[i + 1]], fill=fill, width=width)
    r = width / 2
    for p in pts:
        draw.ellipse([p[0] - r, p[1] - r, p[0] + r, p[1] + r], fill=fill)


def draw_background(size: int) -> Image.Image:
    s = size * SS
    base = vertical_gradient(s, BG_TOP, BG_BOTTOM)

    glow = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse([-s * 0.38, -s * 0.48, s * 0.80, s * 0.62], fill=CYAN + (48,))
    base = Image.alpha_composite(base, glow.filter(ImageFilter.GaussianBlur(s * 0.13)))

    d = ImageDraw.Draw(base)
    inset = s * 0.028
    d.rounded_rectangle(
        [inset, inset, s - inset - 1, s - inset - 1],
        radius=int(s * 0.20),
        outline=RING + (110,),
        width=max(1, int(s * 0.006)),
    )
    return base


def draw_mark(size: int, scale: float = 0.62) -> Image.Image:
    s = size * SS
    layer = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)

    def to_px(p):
        x = s / 2 + (p[0] - 0.5) * s * scale / 0.62
        y = s / 2 + (p[1] - 0.5) * s * scale / 0.62
        return (x, y)

    pts = [to_px(p) for p in ROUTE]
    line_w = int(s * 0.105 * scale / 0.62)

    road = [to_px((0.10, 0.30)), to_px((0.90, 0.74))]
    cap_line(d, road, int(line_w * 0.52), (255, 255, 255, 24))

    glow = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    cap_line(ImageDraw.Draw(glow), pts, line_w, CYAN + (150,))
    layer = Image.alpha_composite(layer, glow.filter(ImageFilter.GaussianBlur(s * 0.028)))

    mask = Image.new("L", (s, s), 0)
    cap_line(ImageDraw.Draw(mask), pts, line_w, 255)
    line = vertical_gradient(s, (120, 240, 255), CYAN_D)
    layer = Image.alpha_composite(layer, Image.composite(line, Image.new("RGBA", (s, s), (0, 0, 0, 0)), mask))

    d = ImageDraw.Draw(layer)
    r_out = line_w * 0.72
    for idx in STATIONS:
        x, y = pts[idx]
        d.ellipse([x - r_out, y - r_out, x + r_out, y + r_out], fill=DARK + (255,))
        r_in = r_out * 0.54
        d.ellipse([x - r_in, y - r_in, x + r_in, y + r_in], fill=WHITE + (255,))

    return layer.resize((size, size), Image.LANCZOS)


def rounded_mask(size: int, ratio: float = 0.225) -> Image.Image:
    m = Image.new("L", (size, size), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * ratio), fill=255)
    return m


def circle_mask(size: int) -> Image.Image:
    m = Image.new("L", (size, size), 0)
    ImageDraw.Draw(m).ellipse([0, 0, size - 1, size - 1], fill=255)
    return m


def compose(size: int, mask: str = "rounded", adaptive_fg: bool = False) -> Image.Image:
    if adaptive_fg:
        return draw_mark(size, scale=0.52)

    bg = draw_background(size).resize((size, size), Image.LANCZOS)
    img = Image.alpha_composite(bg, draw_mark(size, scale=0.62))

    if mask == "rounded":
        out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        out.paste(img, (0, 0), rounded_mask(size))
        return out
    if mask == "circle":
        out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        out.paste(img, (0, 0), circle_mask(size))
        return out
    return img


def cjk_font(size: int):
    for path in (
        r"C:\Windows\Fonts\msjh.ttc",
        r"C:\Windows\Fonts\msjhbd.ttc",
        r"C:\Windows\Fonts\mingliu.ttc",
        "/System/Library/Fonts/PingFang.ttc",
    ):
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                continue
    return ImageFont.load_default()


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)

    densities = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
    for name, px in densities.items():
        folder = OUT / f"mipmap-{name}"
        folder.mkdir(parents=True, exist_ok=True)
        compose(px, "rounded").save(folder / "ic_launcher.png", optimize=True)
        compose(px, "circle").save(folder / "ic_launcher_round.png", optimize=True)
        print(f"  mipmap-{name}: {px}px")

    fg = OUT / "drawable"
    fg.mkdir(parents=True, exist_ok=True)
    compose(432, adaptive_fg=True).save(fg / "ic_launcher_foreground.png", optimize=True)
    draw_background(432).save(fg / "ic_launcher_background.png", optimize=True)

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
        '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#0A1D30</color>\n</resources>\n',
        encoding="utf-8",
    )

    compose(512, "square").convert("RGB").save(OUT / "play-store-icon-512.png", optimize=True)
    make_preview(densities)
    print("完成：", OUT)


def make_preview(densities) -> None:
    pad = 28
    sizes = [192, 144, 96, 72, 48]
    width = pad * 2 + sum(sizes) + pad * (len(sizes) - 1)
    height = pad * 2 + 192 + 230
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

    round_icon = compose(120, "circle")
    sheet.paste(round_icon, (pad, pad + 240), round_icon)
    d.text((pad, pad + 240 + 128), "round", fill=(155, 185, 202), font=small)
    d.text((pad + 130, pad + 250), "Adaptive icon 由系統裁形，", fill=(120, 150, 170), font=small)
    d.text((pad + 130, pad + 272), "圓形／方形／水滴都會自動適應。", fill=(120, 150, 170), font=small)

    phone_x = width + 24
    d.rounded_rectangle([phone_x, pad, phone_x + 250, pad + 420], radius=26, fill=(12, 26, 44))
    big = compose(108, "rounded")
    sheet.paste(big, (phone_x + 71, pad + 46), big)
    d.text((phone_x + 58, pad + 172), "香港交通警報中心", fill=(244, 251, 255), font=label)
    d.text((phone_x + 84, pad + 196), "屯元天即時交通", fill=(155, 185, 202), font=small)

    sheet.save(OUT / "preview.png", optimize=True)


if __name__ == "__main__":
    main()