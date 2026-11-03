"""Writes the favicon and the README lockup from the Source mark (ADR `0057` §1, HANDOFF.md §2).

The geometry is the one `apps/web/src/components/brand/SourceMark.tsx` generates. The wordmark is
"ARP" in Archivo 800 at width 125%, converted to paths: GitHub serves a README image without
loading a webfont, so text in the SVG would fall back to whatever the reader has.

    python3 scripts/build/brand-assets.py "<path to Archivo[wdth,wght].ttf>"

The variable font is github.com/google/fonts, `ofl/archivo/`.
"""

import math
import sys
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = Path(__file__).resolve().parents[2]

PAPER, STEEL, ACCENT = "#e6e8e6", "#8a9096", "#ffb020"
# On a light page paper dots vanish; graphite and grey take their place. The core stays Saffron.
INK, GREY = "#121314", "#6b7075"

RINGS = [(18, 6, 4.4, "a"), (33, 12, 3.4, "a"), (47, 18, 2.2, "b")]

STYLE = (
    f"<style>.a{{fill:{PAPER}}}.b{{fill:{STEEL}}}"
    f"@media (prefers-color-scheme: light){{.a{{fill:{INK}}}.b{{fill:{GREY}}}}}</style>"
)


def mark(ring_count: int, scale: float = 1, dx: float = 0, dy: float = 0) -> str:
    def dot(cx: float, cy: float, r: float, cls: str) -> str:
        return f'<circle class="{cls}" cx="{dx + cx * scale:.2f}" cy="{dy + cy * scale:.2f}" r="{r * scale:.2f}"/>'

    dots = [
        dot(54 + radius * math.cos(2 * math.pi * k / n - math.pi / 2),
            54 + radius * math.sin(2 * math.pi * k / n - math.pi / 2), r, cls)
        for radius, n, r, cls in RINGS[:ring_count]
        for k in range(n)
    ]
    core = f'<circle cx="{dx + 54 * scale:.2f}" cy="{dy + 54 * scale:.2f}" r="{6 * scale:.2f}" fill="{ACCENT}"/>'
    return "".join(dots) + core


def wordmark(font_path: str, cap_height: float, x: float, baseline: float) -> tuple[str, float]:
    font = instantiateVariableFont(TTFont(font_path), {"wght": 800, "wdth": 125})
    glyphs, cmap = font.getGlyphSet(), font.getBestCmap()
    upm = font["head"].unitsPerEm
    scale = cap_height / font["OS/2"].sCapHeight
    tracking = -0.02 * upm

    paths, advance = [], 0.0
    for char in "ARP":
        name = cmap[ord(char)]
        pen = SVGPathPen(glyphs)
        glyphs[name].draw(TransformPen(pen, (scale, 0, 0, -scale, x + advance * scale, baseline)))
        paths.append(pen.getCommands())
        advance += glyphs[name].width + tracking
    width = (advance - tracking) * scale
    return f'<path class="a" d="{" ".join(paths)}"/>', width


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit(__doc__)

    # Below 24px only ring 1 and the core remain, so the favicon is cropped to ring 1.
    favicon = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="30 30 48 48">'
        f"{STYLE}{mark(1)}</svg>\n"
    )
    (ROOT / "apps/web/public/favicon.svg").write_text(favicon)

    height, gap = 96, 28
    text, text_width = wordmark(sys.argv[1], cap_height=44, x=height + gap, baseline=height / 2 + 22)
    width = math.ceil(height + gap + text_width)
    lockup = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
        f'viewBox="0 0 {width} {height}" role="img" aria-label="ARP">'
        f"{STYLE}{mark(3, height / 108)}{text}</svg>\n"
    )
    (ROOT / "docs/design/brand/arp-lockup.svg").write_text(lockup)


if __name__ == "__main__":
    main()
