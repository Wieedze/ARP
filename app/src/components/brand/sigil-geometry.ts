/**
 * Where a sigil's dots go. Pure: no React, no DOM, no colour.
 *
 * Separated from `Sigil.tsx` because this is the part that has to be **stable** — the same agent
 * must produce the same glyph everywhere, forever, or the sigil stops being an identity and becomes
 * decoration. A pure function is the only version of that a test can pin (`rules/code.md`), and the
 * reference implementation lived inside a 700-line HTML page where nothing could reach it.
 *
 * Ported from `arp-design-handoff/reference/agents.html`'s `sigil()`, values unchanged. ADR `0057`
 * §5. **The reference's connecting lines are deliberately not ported**: `HANDOFF.md` §4 records that
 * the user tried links, containers and backgrounds, and rejected all three. Its `MODE !== 'linked'`
 * guard means that code was already dead in the approved version.
 */

/** 7 × 7 grid in a 60-unit viewBox. `STEP` and `ORIGIN` place a cell's centre. */
export const GRID = 7;
export const STEP = 8.5;
export const ORIGIN = 4.5;

/**
 * The cells a module may claim: columns 0–3, rows 0–6, minus the centre (3,3).
 *
 * 27 of them, and that is the whole budget. Columns 0–2 are drawn twice, mirrored on the vertical
 * axis; column 3 sits on the axis and is drawn once. The centre is reserved for the core.
 */
export const CELLS: readonly (readonly [number, number])[] = (() => {
    const cells: [number, number][] = [];
    for (let row = 0; row < GRID; row++) {
        for (let col = 0; col < 4; col++) {
            if (row === 3 && col === 3) continue;
            cells.push([col, row]);
        }
    }
    return cells;
})();

/**
 * Dot radii by tier, picked from the hash.
 *
 * Two sets because the smallest tier vanishes at row size: at 48px a 1.3-unit dot is under half a
 * device pixel. Below 64px the whole set grows and the floor comes up.
 */
const TIER_LARGE = [1.3, 2.2, 3.2] as const;
const TIER_SMALL = [2.2, 3.1, 3.9] as const;

/** The size at which the large tier set takes over. */
export const LARGE_FROM = 64;

/**
 * What the market knows about one module of this agent.
 *
 * `proven` — a third party's receipt exists: a redeemed delegation, a payment, an on-chain call.
 * `declared` — the agent said so and nothing confirms it.
 * `mismatch` — used but never declared. The **only** place the alarm colour appears on a sigil.
 *
 * The three are `docs/14`'s distinction, which is the one the glyph exists to make legible at 24px.
 */
export type ModuleState = "proven" | "declared" | "mismatch";

export type SigilModule = {
    /** The module's atom id when it has one, else its name. Only stability matters. */
    name: string;
    state: ModuleState;
};

export type SigilDot = {
    /** Centre in viewBox units. */
    cx: number;
    cy: number;
    r: number;
    state: ModuleState;
    /** True for the mirrored twin, so a caller can key React children without colliding. */
    mirrored: boolean;
};

/** FNV-1a, 32-bit. The reference's hash, unchanged — a different one moves every sigil. */
export function fnv1a(input: string): number {
    let hash = 2166136261;
    for (const char of input) {
        hash ^= char.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

/**
 * Place every dot for one agent.
 *
 * Each module claims `max(3, ceil(12 / moduleCount))` cells, so a one-module agent still reads as a
 * glyph and a twelve-module agent still fits. The cell index is the hash modulo 27 with linear
 * probing past taken cells, and the next cell re-hashes the previous hash — so the sequence is
 * deterministic in `(name, agentId)` and independent of how many agents came before.
 *
 * Returns the dots in claim order. A module that cannot be placed because the grid is full is
 * silently dropped, which is the reference's behaviour: 27 cells is the ceiling and a glyph that
 * overflowed would stop being comparable with the others.
 */
export function sigilDots(
    agentId: string,
    modules: readonly SigilModule[],
    size: number,
): SigilDot[] {
    const tiers = size >= LARGE_FROM ? TIER_LARGE : TIER_SMALL;
    const taken = new Map<number, {state: ModuleState; r: number}>();

    for (const module of modules) {
        let hash = fnv1a(module.name + agentId);
        const per = Math.max(3, Math.ceil(12 / modules.length));
        for (let claimed = 0; claimed < per && taken.size < CELLS.length; claimed++) {
            let index = hash % CELLS.length;
            while (taken.has(index)) index = (index + 1) % CELLS.length;
            taken.set(index, {state: module.state, r: tiers[(hash >>> 5) % 3]});
            hash = fnv1a(String(hash));
        }
    }

    const dots: SigilDot[] = [];
    for (const [index, {state, r}] of taken) {
        const cell = CELLS[index];
        const [col, row] = cell;
        const cy = ORIGIN + STEP * row;
        dots.push({cx: ORIGIN + STEP * col, cy, r, state, mirrored: false});
        // Column 3 is on the mirror axis, so mirroring it would draw the same dot twice.
        if (col < 3) dots.push({cx: 60 - ORIGIN - STEP * col, cy, r, state, mirrored: true});
    }
    return dots;
}

/** The faint trame under the glyph: every cell of the 7 × 7, including the ones nothing claims. */
export function trameDots(size: number): {cx: number; cy: number; r: number}[] {
    const r = size >= LARGE_FROM ? 0.6 : 0.9;
    const dots: {cx: number; cy: number; r: number}[] = [];
    for (let row = 0; row < GRID; row++) {
        for (let col = 0; col < GRID; col++) {
            dots.push({cx: ORIGIN + STEP * col, cy: ORIGIN + STEP * row, r});
        }
    }
    return dots;
}
