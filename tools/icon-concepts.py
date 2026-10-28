#!/usr/bin/env python3
"""
香港交通警報中心 — App Icon 概念草圖（三個方向，非星形）
輸出：/tmp 的 concepts.png（192px 預覽 + 96px 縮圖測試）
"""

from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

SS = 4
OUT = Path(__file__).resolve().parent.parent / "android-icons"

BG_TOP = (10, 29, 48)
BG_BOTTOM = (4, 11, 20)
CYAN = (50, 220, 255)
CYAN_D = (17, 169, 238)
AMBER = (255, 186, 92)
WHITE = (244, 251, 255)
DARK = (4, 11, 20)


def mix(c1, c2, t):
    return tuple(int(round(c1[i] + (c2[i] - c1[i]) * t)) for i in range(3))


def bg(size, rounded=True):
    s = size * SS
    img = Image.new("RGBA", (s, s))
    px = img.load()
    for y in range(s):
        row = mix(BG_TOP, BG_BOTTOM, y / (s - 1))
        for x in range(s):
            px[x, y] = row + (255,)
    glow = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(glow)
    d.ellipse([-s * .35, -s * .5, s * .8, s * .6], fill=CYAN + (46,))
    img = Image.alpha_composite(img, glow.filter(ImageFilter.GaussianBlur(s * .12)))
    if rounded:
        mask = Image.new("L", (s, s), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * .225), fill=255)
        out = Image.new("RGBA", (s, s), (0, 0, 0, 0))
        out.paste(img, (0, 0), mask)
        return out
    return img


def cap_line(draw, pts, width, fill):
    """圓頭折線。"""
    for i in range(len(pts) - 1):
        draw.line([pts[i], pts[i + 1]], fill=fill, width=width)
    r = width / 2
    for p in pts:
        draw.ellipse([p[0] - r, p[1] - r, p[0] + r, p[1] + r], fill=fill)


def gradient_square(size):
    g = Image.new("RGB", (size, size))
    px = g.load()
    for y in range(size):
        row = mix(CYAN, CYAN_D, y / (size - 1))
        for x in range(size):
            px[x, y] = row
    return g.convert("RGBA")


# ── 概念 1：路線 + 站點 ────────────────────────────────────────────
def concept_route(size):
    s = size * SS
    img = bg(size)
    layer = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)

    # 背景道路（暗、細）
    road = [(s * .06, s * .30), (s * .94, s * .74)]
    cap_line(d, road, int(s * .055), (255, 255, 255, 26))

    # 主路線
    pts = [(s * .22, s * .78), (s * .22, s * .50), (s * .50, s * .50), (s * .50, s * .24), (s * .78, s * .24)]
    cap_line(d, pts, int(s * .105), CYAN + (255,))

    # 站點
    for (x, y) in [pts[0], pts[2], pts[4]]:
        r = s * .072
        d.ellipse([x - r, y - r, x + r, y + r], fill=DARK + (255,))
        d.ellipse([x - r * .55, y - r * .55, x + r * .55, y + r * .55], fill=WHITE + (255,))
    return img, layer


# ── 概念 2：交通徽章（圓環 + 橫桿） ────────────────────────────────
def concept_roundel(size):
    s = size * SS
    img = bg(size)
    layer = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    c = s / 2
    r = s * .30
    w = int(s * .085)
    d.ellipse([c - r, c - r, c + r, c + r], outline=CYAN + (255,), width=w)
    bar_w = int(s * .085)
    ang = math.radians(-18)
    half = s * .40
    x1, y1 = c - half * math.cos(ang), c - half * math.sin(ang)
    x2, y2 = c + half * math.cos(ang), c + half * math.sin(ang)
    cap_line(d, [(x1, y1), (x2, y2)], bar_w, AMBER + (255,))
    # 中央節點
    rr = s * .075
    d.ellipse([c - rr, c - rr, c + rr, c + rr], fill=DARK + (255,))
    d.ellipse([c - rr * .5, c - rr * .5, c + rr * .5, c + rr * .5], fill=CYAN + (255,))
    return img, layer


# ── 概念 3：列車／巴士正面 ──────────────────────────────────────────
def concept_train(size):
    s = size * SS
    img = bg(size)
    layer = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)

    bw, bh = s * .52, s * .58
    x0, y0 = (s - bw) / 2, (s - bh) / 2 + s * .02
    d.rounded_rectangle([x0, y0, x0 + bw, y0 + bh], radius=int(s * .11), fill=CYAN + (255,))

    # 車窗
    wx0, wy0 = x0 + bw * .13, y0 + bh * .14
    wx1, wy1 = x0 + bw * .87, y0 + bh * .46
    d.rounded_rectangle([wx0, wy0, wx1, wy1], radius=int(s * .045), fill=DARK + (255,))

    # 車頭燈
    hr = s * .045
    for cx in (x0 + bw * .24, x0 + bw * .76):
        d.ellipse([cx - hr, y0 + bh * .68 - hr, cx + hr, y0 + bh * .68 + hr], fill=AMBER + (255,))

    # 路線牌
    d.rounded_rectangle(
        [x0 + bw * .30, y0 + bh * .55, x0 + bw * .70, y0 + bh * .62],
        radius=int(s * .015), fill=WHITE + (235,),
    )
    return img, layer


CONCEPTS = {
    "route": concept_route,
    "roundel": concept_roundel,
    "train": concept_train,
}


def render(name, size):
    img, layer = CONCEPTS[name](size)
    return Image.alpha_composite(img, layer).resize((size, size), Image.LANCZOS)


def font(size):
    for p in (r"C:\Windows\Fonts\msjh.ttc", r"C:\Windows\Fonts\msjhbd.ttc"):
        try:
            return ImageFont.truetype(p, size)
        except Exception:
            pass
    return ImageFont.load_default()


def main():
    names = [("route", "路線＋站點"), ("roundel", "交通徽章"), ("train", "列車正面")]
    cell, pad = 192, 34
    width = pad + len(names) * (cell + pad)
    height = pad + cell + 96 + 120
    sheet = Image.new("RGB", (width, height), (6, 17, 31))
    d = ImageDraw.Draw(sheet)
    f = font(16)
    fs = font(13)

    x = pad
    for key, label in names:
        big = render(key, cell)
        sheet.paste(big, (x, pad), big)
        d.text((x, pad + cell + 14), label, fill=(230, 240, 250), font=f)
        small = render(key, 48)
        sheet.paste(small, (x, pad + cell + 46), small)
        d.text((x + 60, pad + cell + 62), "48px", fill=(130, 160, 180), font=fs)
        x += cell + pad

    sheet.save(OUT / "concepts.png", optimize=True)
    print("已生成", OUT / "concepts.png")


if __name__ == "__main__":
    main()
