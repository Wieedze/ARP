/**
 * An ARP README badge, as one SVG string. Pure: no font loading, no network, no DOM.
 *
 * **Status: prototype, not shipped.** The badges belong to the production release (the v0 spec's
 * week 4). This file exists so the design can be tested now: `test-badges.mjs` renders it the way
 * GitHub does, inside an `<img>`, in light and dark, and checks the text fits.
 *
 * Two segments, 20 px high, radius 4, like every badge it sits next to:
 *
 * - left: graphite, the Saffron core, `ARP`;
 * - right: the fact, computed from public data only.
 *
 * **Never a colour for good or bad.** A badge that turns red would be a score, and ARP grades
 * nobody (ADR 0046). The only variation is `muted`, for "nothing yet", in grey text.
 *
 * **Fonts.** An SVG shown through `<img>` cannot load a web font, so Geist Mono will not be there
 * on GitHub. The text is set in the platform monospace and **pinned with `textLength`**: every
 * monospace face is about 0.6 em wide, the width is computed from that, and `textLength` makes the
 * glyphs fill exactly that box whatever face the viewer has. Nothing can overflow the segment.
 *
 * **Theme.** One file serves both README themes: a `<style>` inside the SVG switches the right
 * segment on `prefers-color-scheme`, which browsers apply to SVG images too.
 */
export type BadgeInput = {
    message: string;
    /** Grey text, for a state with nothing to count yet. */
    muted?: boolean;
};

const FONT_SIZE = 11;
const ADVANCE = 0.6 * FONT_SIZE; // a monospace glyph, any face
const HEIGHT = 20;
const PAD = 8;
const CORE_R = 3.6;
const LABEL = "ARP";

function escapeXml(text: string): string {
    return text.replace(/[&<>"']/g, (c) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;"})[c] ?? c);
}

export function badgeWidth(message: string): {left: number; right: number; total: number} {
    const left = Math.round(PAD + CORE_R * 2 + 6 + LABEL.length * ADVANCE + PAD);
    const right = Math.round(PAD + [...message].length * ADVANCE + PAD);
    return {left, right, total: left + right};
}

export function renderBadge({message, muted = false}: BadgeInput): string {
    const text = escapeXml(message);
    const {left, right, total} = badgeWidth(message);
    const labelX = PAD + CORE_R * 2 + 6;
    const fit = (chars: number) => (chars * ADVANCE).toFixed(1);
    return [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${total}" height="${HEIGHT}" viewBox="0 0 ${total} ${HEIGHT}" role="img" aria-label="ARP: ${text}">`,
        `<title>ARP: ${text}</title>`,
        `<style>`,
        `.r{fill:#eaeef2}.t{fill:${muted ? "#6e7781" : "#1f2328"}}`,
        `.e{fill:none;stroke:none}`,
        `@media (prefers-color-scheme:dark){.e{stroke:#3d444d}.r{fill:#21262d}.t{fill:${muted ? "#7d8590" : "#e6edf3"}}}`,
        `text{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,"DejaVu Sans Mono","Liberation Mono",monospace;font-size:${FONT_SIZE}px}`,
        `</style>`,
        `<clipPath id="c"><rect width="${total}" height="${HEIGHT}" rx="4"/></clipPath>`,
        `<g clip-path="url(#c)"><rect width="${left}" height="${HEIGHT}" fill="#121314"/><rect class="r" x="${left}" width="${right}" height="${HEIGHT}"/></g>`,
        `<rect class="e" x=".5" y=".5" width="${total - 1}" height="${HEIGHT - 1}" rx="3.5"/>`,
        `<circle cx="${PAD + CORE_R}" cy="10" r="${CORE_R}" fill="#ffb020"/>`,
        `<text x="${labelX}" y="14" fill="#e6e8e6" font-weight="600" textLength="${fit(LABEL.length)}" lengthAdjust="spacingAndGlyphs">${LABEL}</text>`,
        `<text class="t" x="${left + PAD}" y="14" textLength="${fit([...message].length)}" lengthAdjust="spacingAndGlyphs">${text}</text>`,
        `</svg>`,
    ].join("");
}
