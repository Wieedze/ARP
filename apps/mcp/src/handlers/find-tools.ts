import catalogue from '../../../../data/catalogue/tools.json';
import {
  INTUITION_HAS_TAG_MAINNET as HAS_TAG,
  INTUITION_IS_A_SUB_DOMAIN_OF as IS_A_SUB_DOMAIN_OF,
  listRegisteredTools,
  listTools,
  type ToolListingOrder,
  toolsInDomain,
} from '@arp-protocol/core';

import { GRAPHQL, DOMAIN_ROOT, DOMAIN_ATTESTOR } from '../config.js';
import { type JsonRpcId, fail, text } from '../rpc.js';

/**
 * `data/catalogue/tools.json`'s entry for an atom label, as the two fields a caller gets.
 *
 * Keyed on the label the graph returns, which `toolThing` writes as the URL minus its scheme.
 * Tolerant of a scheme, a trailing slash and case, because a hand-registered atom may carry any
 * of them. Both fields are `null` for a tool nobody catalogued — a caller then has the URL, which
 * is the identity and was always enough.
 */
function seedFor(label: string | null): { title: string | null; purpose: string | null } {
  if (label === null) return { title: null, purpose: null };
  const key = label
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '');
  const hit = SEED_BY_KEY.get(key);
  return { title: hit?.title ?? null, purpose: hit?.purpose ?? null };
}

const SEED_BY_KEY = new Map(
  (catalogue.tools as { url: string; title: string; purpose: string | null }[]).map((tool) => [
    tool.url.replace(/^https:\/\//, '').toLowerCase(),
    tool,
  ]),
);

/**
 * Tools agents declared using, with where each is hosted and what stands behind it.
 *
 * The step the rest of this server assumed somebody else had taken. `arp_tool_reputation` prices a
 * tool whose atom id you already know; nothing let an agent **find** one, and a pointer nobody can
 * enumerate is not a pointer (ADR `0051`).
 *
 * `hosted_at` is the field that makes this actionable: ARP stores no tool, so an agent reads the
 * listing, **goes to the host**, and decides for itself. It is a home page, not a call target — 28
 * of the 85 distinct tools on mainnet `uses` edges carry none at all, and 9 more carry the string
 * `"null"` (re-measured 2026-10-28; it was 80 and 3 on 2026-10-20).
 *
 * **None of those 85 is reachable through the declared read, and that is the point of the second
 * one.** `listTools` requires the subject to be an identified agent — a `same as` edge — and
 * measured 2026-10-28, **zero** of the 186 mainnet `uses` edges has one. Three of 167 do on
 * testnet. So the declared population is a real zero on mainnet, which is our own non-activity
 * and not a property of the graph, and a catalogue built on it alone answers nothing.
 *
 * ## Two populations, and it used to return one
 *
 * A **declared** tool is the object of an agent's `uses` edge. A **registered** tool is an atom
 * somebody created, which needs no agent and carries a market of its own (ADR `0039`). Returning
 * only the first made the whole catalogue invisible to an agent until somebody had already
 * declared something — and nobody had, ARP included, so on testnet this answered with an empty
 * list while 52 registered tools sat one query away.
 *
 * `provenance` says which read a row came from, because the two answer different questions and a
 * merged list that hid the difference would be the kind of summed figure `rules/claims.md`
 * forbids. A collision keeps the declared row: it carries the per-edge market this tool is about.
 *
 * Agent declarations only on the declared side: the `uses` predicate is shared and most of what
 * sits on it is ordinary prose, filtered out in the query rather than returned under a caveat.
 * That filter is why `arp_find_tools` no longer answers with Bitcoin and Obsidian.
 *
 * ## `title` and `purpose` are this repo's, not the chain's
 *
 * Read from `data/catalogue/tools.json`. The atom carries only its URL (ADR `0054`), so a readable name
 * cannot come from the graph; and `purpose` is the description each repository publishes about
 * itself, quoted and dated, never written by us. Absent for a tool we have not catalogued, which
 * is most of the graph — a caller gets `null` and the URL, not a guess.
 */

export async function findTools(id: JsonRpcId, args: Record<string, unknown>) {
  const orderRaw = args['order'] ?? 'priced-edges';
  if (orderRaw !== 'priced-edges' && orderRaw !== 'conviction' && orderRaw !== 'declarations') {
    return fail(id, -32602, "order must be 'priced-edges', 'conviction' or 'declarations'");
  }
  const limitRaw = args['limit'] ?? 25;
  if (
    typeof limitRaw !== 'number' ||
    !Number.isInteger(limitRaw) ||
    limitRaw < 1 ||
    limitRaw > 100
  ) {
    return fail(id, -32602, 'limit must be an integer between 1 and 100');
  }
  const curveRaw = args['curve_id'];
  if (curveRaw !== undefined && (typeof curveRaw !== 'number' || !Number.isInteger(curveRaw))) {
    return fail(id, -32602, 'curve_id must be an integer');
  }
  const domainRaw = args['domain'];
  if (domainRaw !== undefined && typeof domainRaw !== 'string') {
    return fail(id, -32602, 'domain must be a string');
  }
  // Whose index to read is **not** a request parameter, and that is the safety net (the user,
  // 2026-10-28: « je ne veux pas que ce soit modulable par un agent ou un mcp ou n'importe quoi,
  // c'est le filet de sécurité du classement des info »).
  //
  // The reasoning: `has tag` and the hierarchy are permissionless to write, so the only thing
  // separating ARP's index from anything anybody published is which positions it is read through.
  // A caller that can pass its own attestor — or `any` — can make the index say whatever it likes,
  // and then a curated index guarantees nothing. An earlier version of this handler took
  // `attestor` from the arguments; it was wrong for exactly one turn.
  //
  // The attestor is a property of the SERVER, not of the request. Anybody who wants a different
  // index runs a server with a different `ARP_DOMAIN_ATTESTOR`. Nobody changes it per call.
  const attestor = DOMAIN_ATTESTOR;
  if (domainRaw !== undefined && attestor === undefined) {
    // Refuses rather than falling back to the unfiltered graph. The fallback is the failure this
    // whole design exists to prevent, and it would have been silent: a search returning more rows
    // than it should looks like a better answer, not like a missing guard rail.
    return fail(
      id,
      -32603,
      'this server has no domain attestor configured, so it cannot answer a domain search. ' +
        'Set ARP_DOMAIN_ATTESTOR (or AGENT_ADDRESS) to the address whose filings are the index. ' +
        'Reading the hierarchy unfiltered would return every triple anybody has ever published ' +
        'under the predicate, which is not an index.',
    );
  }

  // Searching by need, which is the whole reason this parameter exists: the agent names a domain
  // and the subtree under it is resolved before anything is ranked. A tool carries one tag at its
  // deepest domain and the ancestors are derived (ADR `0074`), so `payment` has to descend to
  // `card` before it can find Stripe.
  let domainScope: {
    domains: string[];
    atomIds: Set<string>;
    backed: Set<string>;
    othersHidden: number;
  } | null = null;
  if (domainRaw !== undefined) {
    const normalised = domainRaw.trim().toLowerCase();
    const { domains, tools } = await toolsInDomain(
      {
        graphqlUrl: GRAPHQL,
        hierarchyPredicate: IS_A_SUB_DOMAIN_OF,
        tagPredicate: HAS_TAG,
        root: DOMAIN_ROOT,
        attestor,
      },
      normalised,
    );
    // `has tag` is permissionless to write: anybody can publish `(anything, has tag, payment)` for
    // the price of one triple. An index is therefore a *reading* of those filings, and `attestor`
    // picks whose — ARP's by default, the caller's own, somebody else's, or none at all.
    const kept = tools.filter((tool) => tool.attestorBacked);
    domainScope = {
      domains,
      atomIds: new Set(kept.map((tool) => tool.atomId.toLowerCase())),
      backed: new Set(
        tools.filter((tool) => tool.attestorBacked).map((tool) => tool.atomId.toLowerCase()),
      ),
      othersHidden: tools.length - kept.length,
    };
  }

  const [page, registered] = await Promise.all([
    listTools({
      graphqlUrl: GRAPHQL,
      order: orderRaw as ToolListingOrder,
      ...(curveRaw === undefined ? {} : { curveId: curveRaw }),
    }),
    listRegisteredTools({
      graphqlUrl: GRAPHQL,
      ...(curveRaw === undefined ? {} : { curveId: curveRaw }),
    }),
  ]);

  const declared = new Set(page.tools.map((tool) => tool.atomId.toLowerCase()));
  const registeredRows = registered.tools
    .filter((tool) => !declared.has(tool.atomId.toLowerCase()))
    .filter((tool) => domainScope === null || domainScope.atomIds.has(tool.atomId.toLowerCase()))
    .map((tool) => ({
      tool_atom_id: tool.atomId,
      label: tool.label,
      provenance: 'registered' as const,
      ...seedFor(tool.label),
      hosted_at: tool.url,
      atom_uri: tool.uri,
      declarations: tool.declarations,
      // `null`, not `0`: pricing a registered row's declarations needs the per-edge vaults, which
      // is `listTools`'s read. A zero under "paid for" would read as "nobody paid", a claim this
      // read cannot make.
      paid_declarations: null,
      support_assets_wei: tool.assets.toString(),
      oppose_assets_wei: null,
      // Creating a term seeds its vault with `minShare` (ADR `0042`), so assets alone never say
      // whether anybody staked. This does.
      position_count: tool.positionCount,
    }));

  const inScope = (atomId: string): boolean =>
    domainScope === null || domainScope.atomIds.has(atomId.toLowerCase());

  return text(id, {
    curve_id: page.curveId,
    edges_read: page.edgesRead,
    truncated: page.truncated || registered.truncated,
    purpose_read_at: catalogue.readAt,
    // Present only when a domain was asked for. `domains_walked` is the derivation made visible:
    // a tool tagged `card` comes back under `payment` because the hierarchy says so, and the
    // reader should be able to see which hop did it rather than take the filter on trust.
    ...(domainScope === null
      ? {}
      : {
          domain: String(domainRaw).trim().toLowerCase(),
          domains_walked: domainScope.domains,
          domain_tagged_tools: domainScope.atomIds.size,
          // Whose tree was walked. Named in the response because "the domain tree" is a reading,
          // not a fact about the chain, and a reader should never have to guess whose it was.
          // Echoed verbatim although the caller cannot set it. "The domain tree" is a reading
          // and not a fact about the chain, so a reader must never have to guess whose it was —
          // and an address in the wrong case returns an empty tree, which this makes diagnosable
          // instead of looking like "this domain has nothing in it".
          domain_attestor: attestor,
          // How many filings under this domain this attestor does not back, and were left out.
          // Reported even when zero, so a reader never wonders whether the question was asked.
          tags_from_others_hidden: domainScope.othersHidden,
        }),
    tools: [
      ...page.tools
        .filter((tool) => inScope(tool.atomId))
        .map((tool) => ({
          tool_atom_id: tool.atomId,
          label: tool.label,
          provenance: 'declared' as const,
          ...seedFor(tool.label),
          // Where to go and look. ARP hosts nothing; this is the pointer and the point.
          hosted_at: tool.hostedAt,
          atom_uri: tool.uri,
          declarations: tool.edgeCount,
          // How many of those declarations somebody paid to stand behind. Never a summed position
          // count: positions are counted per vault and a sum across edges counts nothing (ADR `0023`).
          paid_declarations: tool.pricedEdges,
          support_assets_wei: tool.supportAssetsSum.toString(),
          oppose_assets_wei: tool.opposeAssetsSum.toString(),
          position_count: null,
        })),
      ...registeredRows,
    ].slice(0, limitRaw),
  });
}
