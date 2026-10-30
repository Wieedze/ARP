/**
 * The footer wordmark — the "filigrane", edge to edge.
 *
 * ## Why it is an SVG and not a font-size
 *
 * It was `clamp(150px, 30vw, 420px)` inside the 1320px shell, which the user read as too small and
 * too boxed-in: _« le filigrane en footer est trop petit, il pourrait être étalé sur toute la
 * largeur »_. A clamp cannot fill a width — it guesses at one, and the guess is wrong at every
 * viewport except the one it was tuned on, because the glyphs' own widths change with the font.
 *
 * `textLength` plus `lengthAdjust="spacing"` makes the browser do it exactly: the three letters are
 * laid out to span the viewBox, and **only the gaps between them are stretched**. The letterforms
 * are untouched — `spacingAndGlyphs` would scale the glyphs themselves, which is type distortion
 * and would be visible at this size on an 800-weight face.
 *
 * The viewBox's ratio is the wordmark's ratio, so `width: 100%` sets the height too and the SVG
 * grows with the page instead of against it. Full bleed: the footer's own padding is cancelled with
 * a negative inset so the mark touches both edges, and the bottom is cropped by `overflow-hidden`
 * on the footer plus a negative margin, so it reads as a thing the page is sitting on rather than a
 * thing framed inside it.
 *
 * ## Why it stays type and not decoration
 *
 * `rules/ui.md` bans gradients, glows and shadows, and allows this for the reason it allows
 * negative space to be content: at this size the typeface's width axis is finally legible, and
 * nothing is competing with it. One step off the ground (`--color-watermark: #17181a` against
 * `--color-ground: #0e0f10`), a solid colour rather than an opacity — an alpha composites
 * differently over a panel than over the ground.
 *
 * `aria-hidden` and `select-none`: it is the same three letters the nav already says, so a screen
 * reader would read the site's name twice per page and a drag-select would pick it up.
 */
export function Watermark() {
    return (
        <svg
            aria-hidden="true"
            focusable="false"
            // 760 × 200 is the wordmark's own ratio at `font-stretch: 125%`. The box is what sets
            // the height once the width is 100%, so changing one means re-measuring the other.
            viewBox="0 0 760 200"
            preserveAspectRatio="xMidYMid meet"
            className="pointer-events-none block w-full select-none"
            style={{marginBottom: "-3%"}}
        >
            <text
                x="0"
                y="168"
                textLength="760"
                lengthAdjust="spacing"
                fill="var(--color-watermark)"
                style={{
                    fontFamily: "var(--font-display)",
                    fontSize: "200px",
                    fontWeight: 800,
                    fontStretch: "125%",
                }}
            >
                ARP
            </text>
        </svg>
    );
}
