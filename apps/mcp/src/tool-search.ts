/**
 * What `arp_find_tools` says about one tool, and how a free-text query finds it (task 49).
 *
 * Pure: the catalogue and the skill facts are passed in, so this is testable on literals.
 *
 * **Why a short row.** A row used to carry twelve fields, among them two 32-byte ids, an IPFS URI and
 * three amounts in wei, and one domain search answered 16.6 KB for 25 tools (Claude Desktop,
 * testnet 13579, 2026-11-02). An agent choosing a tool reads a name, what it is for, where it lives
 * and whether anybody uses it. The rest is still there with `detail: "full"`.
 */

export type SkillFact = { description: string | null; installs: number | null };

export type CatalogueEntry = { title: string; purpose: string | null };

export type Described = {
  /** The skill's name for a skill, the catalogue's title for a tool, else the label. */
  name: string;
  /** One sentence, at most {@link PURPOSE_MAX} characters. `null` when nobody described it. */
  purpose: string | null;
  /** The whole description, for matching only. */
  text: string;
  /** skills.sh's install count for a skill; `null` for a tool or a skill it does not list. */
  installs: number | null;
};

const PURPOSE_MAX = 140;

/** The label as both lookups key it: the URL without its scheme or trailing slash, lowercased. */
export function keyOf(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '');
}

/** The first sentence, cut at a word under {@link PURPOSE_MAX} characters. */
export function shortPurpose(text: string | null): string | null {
  if (text === null) return null;
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat === '') return null;
  const sentence = /^(.+?[.!?])(\s|$)/.exec(flat)?.[1] ?? flat;
  if (sentence.length <= PURPOSE_MAX) return sentence;
  const cut = sentence.slice(0, PURPOSE_MAX);
  return `${cut.slice(0, cut.lastIndexOf(' ') > 40 ? cut.lastIndexOf(' ') : PURPOSE_MAX).trimEnd()}…`;
}

export function describe(
  label: string | null,
  catalogue: ReadonlyMap<string, CatalogueEntry>,
  skills: ReadonlyMap<string, SkillFact>,
): Described {
  if (label === null) return { name: '', purpose: null, text: '', installs: null };
  const key = keyOf(label);
  const skill = /[?&]skill=([^&]+)/.exec(key)?.[1];
  const fact = skills.get(key);
  const entry = catalogue.get(key);
  const full = entry?.purpose ?? fact?.description ?? null;
  return {
    name: skill ?? entry?.title ?? key,
    purpose: shortPurpose(full),
    text: [key, entry?.title ?? '', full ?? ''].join(' ').toLowerCase(),
    installs: fact?.installs ?? null,
  };
}

/** A query word's root: "editing" also finds "edit", "emails" finds "email". */
function rootOf(word: string): string {
  return word.length > 5 ? word.replace(/(ing|ed|es|s)$/, '') : word;
}

/** Words that say nothing about a need: "tools for my emails" asks about emails. */
const FILLER = new Set(
  'a an and any app apps are can do for from help how i in is it me my of on or the to tool tools use what with you your'.split(' '),
);

/**
 * How well a tool's text answers `query`. Every word of the query must be found, or the answer is
 * zero: "card payments" used to return ten tools that only said "card" (orbit cards, marketplace
 * cards), and an agent read all ten before answering from memory (task 51). A word found counts
 * one, two when it is in the name. It orders search results and is never returned: it measures
 * words matched, not the tool.
 */
export function relevance(query: string, described: Described): number {
  // At the start of a word: "form" is not in "platform", "performance" or "Terraform".
  const words = query
    .toLowerCase()
    .split(/[^a-z0-9+#.-]+/)
    .filter((word) => word.length >= 2 && !FILLER.has(word))
    .map((word) => new RegExp(`(^|[^a-z0-9])${rootOf(word).replace(/[.+#-]/g, '\\$&')}`));
  const name = described.name.toLowerCase();
  let score = 0;
  for (const word of words) {
    if (!word.test(described.text)) return 0;
    score += word.test(name) ? 2 : 1;
  }
  return score;
}

/**
 * Where a matched tool ranks: its {@link relevance}, scaled by how many agents declared using it
 * (the user, 2026-11-03: usage and relevance mixed, ADR `0131`). Logarithmic, so usage lifts a
 * tool past a better-worded one without burying the words: 12 declarations multiply by about 3.6,
 * one by 1.7. A declaration is one agent's edge, so one agent counts once per tool.
 */
export function rankOf(relevanceScore: number, declarations: number): number {
  return relevanceScore * (1 + Math.log(1 + Math.max(0, declarations)));
}

/**
 * One entry per name and purpose. The copy kept is the one with the most declarations, then the
 * most installs: a copy an agent declared must never be hidden behind an undeclared one
 * (`product-photography` was, testnet 13579, 2026-11-02). Declarations are not summed across
 * copies: each copy is its own entry in the registry, so a sum would add separate claims.
 * The kept entry takes the place of the first copy, so a ranked list stays ranked.
 */
export function collapseCopies<T extends { about: Described }>(
  entries: readonly T[],
  declarationsOf: (entry: T) => number,
): (T & { copies: number })[] {
  const groups = new Map<string, T & { copies: number }>();
  const better = (a: T, b: T): boolean =>
    declarationsOf(a) !== declarationsOf(b)
      ? declarationsOf(a) > declarationsOf(b)
      : (a.about.installs ?? -1) > (b.about.installs ?? -1);
  for (const entry of entries) {
    const key = `${entry.about.name}\u0000${entry.about.purpose ?? ''}`;
    const kept = groups.get(key);
    if (kept === undefined) groups.set(key, { ...entry, copies: 1 });
    else if (better(entry, kept)) groups.set(key, { ...entry, copies: kept.copies + 1 });
    else kept.copies += 1;
  }
  return [...groups.values()];
}

/** One page of `entries`, the total, and where the next page starts (`null` on the last). */
export function pageOf<T>(
  entries: readonly T[],
  offset: number,
  limit: number,
): { rows: T[]; total: number; nextOffset: number | null } {
  return {
    rows: entries.slice(offset, offset + limit),
    total: entries.length,
    nextOffset: offset + limit < entries.length ? offset + limit : null,
  };
}
