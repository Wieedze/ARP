/**
 * The footer wordmark — the "filigrane" the user asked for (2026-10-27).
 *
 * `ARP` at `clamp(150px, 30vw, 420px)`, one step off the ground colour
 * (`--color-watermark: #17181a` against `--color-ground: #0e0f10`), centred, and bleeding off the
 * bottom edge by a negative margin so it is cropped rather than framed. Straight out of
 * `arp-design-handoff/arp-design-handoff 2/reference/landing.html` — `.giant`, its numbers and all.
 *
 * ## Why it is not decoration
 *
 * `rules/ui.md` bans gradients, glows and shadows, and allows this for the same reason it allows
 * negative space to be content: it is **type**, at the one size where the typeface's width axis is
 * actually legible, in the one place where nothing else is competing. It sets the bottom of every
 * page rather than letting the content just stop.
 *
 * Three things keep it from becoming noise:
 *
 * - `aria-hidden` and `select-none`. It is the same three letters the nav already says, so a
 *   screen reader would read the site's name twice per page and a drag-select would pick it up.
 * - `overflow-hidden` on the footer, which is what makes the crop a crop.
 * - `--color-watermark` rather than an opacity. An alpha would composite differently over a panel
 *   than over the ground; a solid colour is the same everywhere and is what the reference uses.
 */
export function Watermark() {
    return (
        <div
            aria-hidden="true"
            className="type-display select-none text-center text-[length:var(--text-giant)] leading-[var(--leading-giant)] tracking-[-0.04em] text-[color:var(--color-watermark)]"
            style={{marginBottom: "-0.12em"}}
        >
            ARP
        </div>
    );
}
