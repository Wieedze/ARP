import catalogue from "../../../../catalogue/tools.json";

/**
 * The catalogue's seed: 52 tool URLs, with the name and the sentence this app shows for each.
 *
 * ## Why the title and the purpose are here and not in the atom
 *
 * A tool's atom derives every field from its normalised URL (`toolThing`, ADR `0054`), so the
 * atom's own label is `github.com/stripe/agent-toolkit` — the URL without its scheme. That is
 * deliberate, and it is why `github.com` has one atom under this convention and **five** on
 * mainnet: a free-text name inside a hashed document is a duplicate generator.
 *
 * So the readable name lives in `catalogue/tools.json`, which is this repo, and changing one costs
 * nothing on chain (user, 2026-10-28: _« le nom peut etre dans le front »_). A title carries no
 * authority: a reader of the graph sees the URL, which is the identity.
 *
 * ## Why a URL and not an id we assign
 *
 * An id like `arp:tool:00123` was proposed the same day and rejected. It buys the one property the
 * title already gives — the front end changes without a write — and costs derivability: an
 * external agent could no longer compute the atom id of a tool it had just used without asking us.
 * That makes ARP an authority and the market unreadable outside this app, permanently, because
 * Intuition has no deletion. A URL is a natural key; an assigned id is a surrogate key needing a
 * table that must outlive us.
 *
 * ## The purpose is quoted, never written
 *
 * `purpose` is the description each repository publishes about itself, read once on 2026-10-28. We
 * do not write it: a sentence we invented about a tool we have not run is the claim
 * `rules/claims.md` exists to stop. 45 of the 52 publish one; the rest carry `null` and read as
 * their URL.
 */
export type SeedTool = {
    /** The identity. Normalised by `normaliseToolUrl` before any atom id is derived from it. */
    readonly url: string;
    /** What this repo calls it. Never part of the atom's document. */
    readonly title: string;
    /** Which population it came from. Not on chain either. */
    readonly kind: "skill-repo" | "mcp-server";
    /** The repository's own one-line description, or `null` when it publishes none. */
    readonly purpose: string | null;
    /** GitHub reports the repository as archived. Absent means not archived. */
    readonly archived?: boolean;
};

/** The whole seed, MCP servers first. */
export const SEED_TOOLS: readonly SeedTool[] = catalogue.tools as readonly SeedTool[];

const byKey: ReadonlyMap<string, SeedTool> = new Map(
    SEED_TOOLS.map((tool) => [tool.url.replace(/^https:\/\//, "").toLowerCase(), tool]),
);

/**
 * The atom label the graph returned → the seed entry, or `null` when this repo has none.
 *
 * Tolerant of the three spellings a label arrives in — with a scheme, with a trailing slash, in
 * any case — because `toolThing` writes one form and a hand-registered atom may carry another.
 */
function seedToolOf(atomLabel: string): SeedTool | null {
    const key = atomLabel
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .replace(/\/+$/, "");
    return byKey.get(key) ?? null;
}

/**
 * `"github.com/stripe/agent-toolkit"` → `"Stripe"`, or `null` when this repo has no name for it.
 *
 * `null` rather than a guess: a tool nobody named reads as its URL, which is honest, where an
 * invented name would not be.
 */
export function seedTitleOf(atomLabel: string): string | null {
    return seedToolOf(atomLabel)?.title ?? null;
}
