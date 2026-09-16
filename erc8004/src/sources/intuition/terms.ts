/**
 * Intuition term IDs.
 *
 * Every constant here is frozen. Nothing in this package resolves a predicate or
 * an object by label at runtime, ever: on mainnet `use`, `implement`, `has tag`
 * and `Base` each resolve to several atoms, `has trust provider` resolves to
 * two, and picking the first match would silently read a different graph than
 * the one the ecosystem writes to.
 *
 * Sources for each value:
 *
 *   - Published — listed in Appendix B of `docs/07_INTUITION_ERC8004_PARTNER_GUIDE.md`
 *     and re-confirmed against live mainnet in `docs/08` Appendix B on 2026-09-16.
 *   - Derived — resolved once against `https://mainnet.intuition.sh/v1/graphql`,
 *     with the zero/multiple-match check recorded inline below.
 *
 * This file is the only place in the package where a term ID may appear.
 */

/** `same as` — the canonical ERC-8004 identity edge. Published. */
export const SAME_AS =
    "0xbeebfb7d177cbd96ffc239d2196c72ec346efe81f39dc595773f13d83506f5f0" as const;

/** `has type`. Published. */
export const HAS_TYPE =
    "0xa632a94306ab1d56911cff8c06473659a7caa2dfec6de3921bc23ec8ebf96ced" as const;

/** `implement`. Published. */
export const IMPLEMENT =
    "0xfa02609bfde5a9a7ba18fa8afc1c42bc643edfaf7d44e3ce9e50835290d03324" as const;

/** `available on`. Published. */
export const AVAILABLE_ON =
    "0xa974ce85010776bb6eb81e4492bdb8712f127aa75ae737f02cbe80e72409f7d3" as const;

/** `use`. Published. */
export const USE = "0x9ddda4ac2477ec6908e9561ab31ccd767bf3642e0ed0531fd61d447badd896ab" as const;

/** `compatible with`. Published. */
export const COMPATIBLE_WITH =
    "0xaf3ca6cd6db1cc57c5ae68b1177ba1fd426488bd781494166ab8cb0ed28a6ea3" as const;

/** `has tag` — the mainnet vocabulary's atom (the testnet ecosystem writes with a different one). Published. */
export const HAS_TAG =
    "0x7ec36d201c842dc787b45cb5bb753bea4cf849be3908fb1b0a7d067c3c3cc1f5" as const;

/** `has category`. Published. */
export const HAS_CATEGORY =
    "0x96c20ddd7f83034666e200aa976cbe2249946bf76a7c66333212be82f284ad4b" as const;

/** `has trust provider`. Published. */
export const HAS_TRUST_PROVIDER =
    "0xdc3c5639b39f9b6553b75b37c47fa4810961392b28956234ba9f401a98f43888" as const;

/**
 * `has trust assessment`.
 *
 * Derived 2026-09-16: `atoms(where: {label: {_eq: "has trust assessment"}})`
 * returned two atoms — this one and `0xd88f212c…`. Disambiguated by edge count
 * (`triples_aggregate` by `predicate_id`): 28,757 edges here against 1 on the
 * other. This value also matches Appendix B of the partner guide exactly, which
 * is the cross-check that settles it.
 */
export const HAS_TRUST_ASSESSMENT =
    "0x7f455fb041f766c3f24552db4c943888c6778c2475d4f2d434b84ad03298457c" as const;

/**
 * `provided by`.
 *
 * Derived 2026-09-16, same procedure: two atoms by label, this one and
 * `0xde9de640…`, 28,751 edges against 1. Matches Appendix B.
 */
export const PROVIDED_BY =
    "0x9a310b5ca895009792e5b1dc0131539f36c054e8e32987989367ec73a1a3ef19" as const;

/**
 * `uses` — a second, distinct predicate from `use`, not published in Appendix B.
 *
 * Derived 2026-09-16: two atoms by label, this one and `0xba5de379…`,
 * 183 edges against 1. Frozen here rather than resolved at runtime.
 */
export const USES = "0x5c0bde1cc696456c0268248c4656acdf9621fdb39e605bc99b0a83dc8ff6e800" as const;

/** The trust-pattern predicates, in the order the trust surface query filters on. */
export const TRUST_PREDICATE_IDS: readonly string[] = [HAS_TRUST_PROVIDER, HAS_TRUST_ASSESSMENT];

/** Predicates that carry a capability declaration, mapped in `map.ts`. */
export const CAPABILITY_PREDICATE_IDS: readonly string[] = [
    HAS_TYPE,
    IMPLEMENT,
    USE,
    USES,
    COMPATIBLE_WITH,
    AVAILABLE_ON,
    HAS_TAG,
    HAS_CATEGORY,
];
