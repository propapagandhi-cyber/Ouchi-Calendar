"""Generate PWA icons for おうちカレンダー into impl/web/icons/.

Usage: python impl/tools/make_icons.py   (requires Pillow)
Design: warm orange tile, white calendar page with a small house in the middle.
"""
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parents[1] / "web" / "icons"
BG = (240, 120, 30)
BG_DARK = (217, 72, 15)
WHITE = (255, 255, 255)
HOUSE = (217, 72, 15)
ROOF = (232, 89, 12)
DOOR = (255, 214, 168)
SS = 4  # supersampling factor


def draw_icon(size: int, maskable: bool) -> Image.Image:
    s = size * SS
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    if maskable:
        d.rectangle([0, 0, s, s], fill=BG)
        scale = 0.62  # keep the motif inside the maskable safe zone
    else:
        d.rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 0.22), fill=BG)
        scale = 0.74

    # subtle lower band for depth
    band = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    ImageDraw.Draw(band).rectangle([0, int(s * 0.72), s, s], fill=BG_DARK + (70,))
    if not maskable:
        mask = Image.new("L", (s, s), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 0.22), fill=255)
        band.putalpha(Image.composite(band.getchannel("A"), Image.new("L", (s, s), 0), mask))
    img = Image.alpha_composite(img, band)
    d = ImageDraw.Draw(img)

    w = s * scale
    x0 = (s - w) / 2
    y0 = (s - w) / 2 + s * 0.02
    x1 = x0 + w
    y1 = y0 + w * 0.92
    r = w * 0.12
    # calendar page
    d.rounded_rectangle([x0, y0, x1, y1], radius=r, fill=WHITE)
    # header band
    hb = y0 + w * 0.24
    d.rounded_rectangle([x0, y0, x1, hb], radius=r, fill=(255, 232, 217))
    d.rectangle([x0, hb - r, x1, hb], fill=(255, 232, 217))
    # rings
    for fx in (0.28, 0.72):
        cx = x0 + w * fx
        d.rounded_rectangle([cx - w * 0.04, y0 - w * 0.07, cx + w * 0.04, y0 + w * 0.1], radius=w * 0.04, fill=(90, 60, 40))

    # house
    hx = (x0 + x1) / 2
    base_top = y0 + w * 0.52
    base_bot = y0 + w * 0.82
    half = w * 0.2
    d.polygon([(hx - half * 1.32, base_top + w * 0.01), (hx, y0 + w * 0.31), (hx + half * 1.32, base_top + w * 0.01)], fill=ROOF)
    d.rectangle([hx - half, base_top, hx + half, base_bot], fill=HOUSE)
    dw = w * 0.07
    d.rounded_rectangle([hx - dw, base_bot - w * 0.16, hx + dw, base_bot], radius=w * 0.03, fill=DOOR)

    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    draw_icon(192, False).save(OUT / "icon-192.png")
    draw_icon(512, False).save(OUT / "icon-512.png")
    draw_icon(512, True).save(OUT / "icon-maskable-512.png")
    apple = Image.new("RGBA", (180, 180), BG + (255,))
    apple.alpha_composite(draw_icon(180, True))
    apple.convert("RGB").save(OUT / "apple-touch-icon.png")
    (OUT / "favicon.svg").write_text(
        """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<rect width="64" height="64" rx="14" fill="#F0781E"/>
<rect x="10" y="13" width="44" height="40" rx="6" fill="#fff"/>
<path d="M10 19a6 6 0 0 1 6-6h32a6 6 0 0 1 6 6v5H10z" fill="#FFE8D9"/>
<path d="M20 36 32 24l12 12z" fill="#E8590C"/>
<rect x="23" y="35" width="18" height="13" fill="#D9480F"/>
<rect x="29.5" y="41" width="5" height="7" rx="1.5" fill="#FFD6A8"/>
</svg>
""",
        encoding="utf-8",
    )
    print("icons written to", OUT)


if __name__ == "__main__":
    main()
