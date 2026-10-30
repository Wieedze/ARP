import {
  type DeclarePlan,
  type PreparedCall,
  type StakePlan,
  type ToolUsage,
} from '@arp-protocol/core';

/** Amounts are strings: a TRUST figure does not survive JSON's number type. */
export function serialise(usage: ToolUsage) {
  const side = (s: { totalAssets: bigint | null; positionCount: number | null }) => ({
    total_assets_wei: (s.totalAssets ?? 0n).toString(),
    position_count: s.positionCount ?? 0,
  });
  return {
    tool_atom_id: usage.toolAtomId,
    label: usage.label,
    pinned_uri: usage.pinnedUri,
    totals: {
      support_assets_wei: usage.totals.supportAssets.toString(),
      oppose_assets_wei: usage.totals.opposeAssets.toString(),
      support_positions: usage.totals.supportPositions,
      oppose_positions: usage.totals.opposePositions,
    },
    edges: usage.edges.map((e) => ({
      triple_id: e.tripleId,
      agent: e.agent,
      support: side(e.support),
      oppose: side(e.oppose),
      // The tier a reader must not flatten: an edge with no stake behind it is not weak
      // evidence, it is none (docs/14).
      //
      // Keyed on the POSITION COUNT, not the assets. Creating a triple seeds its vault with
      // `minShare`, so `total_assets` is never zero for an edge that exists — measured on mainnet
      // 2026-10-19, every unbacked IPFS edge reports exactly 1000000 wei with zero positions. This
      // line read `totalAssets > 0n` and so answered `staked: true` for all 7 of IPFS's edges,
      // including the 4 nobody has backed. The caveat below promises the flag means something; it
      // did not. ADR `0042`.
      staked: (e.support.positionCount ?? 0) > 0,
    })),
    provenance: usage.provenance,
    caveat:
      'Each edge is an assertion somebody wrote; the market prices it. An edge with ' +
      'staked=false carries no weight at all. ARP composes no score.',
  };
}

export const serialiseCall = (call: PreparedCall) => ({
  kind: call.kind,
  // On every call, not only on the plan: each MultiVault is codeless on the other chain, and a
  // value-bearing call to a codeless address succeeds as a plain transfer instead of reverting.
  chain_id: call.chainId,
  to: call.to,
  value_wei: call.value.toString(),
  data: call.data,
  why: call.why,
  // What the chain says the call buys, read before anything is signed. `shares: "0"` means the
  // term would be born with no position — on the chain, and not a market (ADR `0053`).
  ...(call.preview === undefined
    ? {}
    : {
        preview: {
          shares: call.preview.shares.toString(),
          assets_after_fees_wei: call.preview.assetsAfterFees.toString(),
        },
      }),
});

/** Said on every plan, because a caller who assumes ARP executed it will not check that it did. */
export const UNSIGNED_CAVEAT =
  'These calls are UNSIGNED and nothing has been sent. ARP holds no key and has no send ' +
  'path: sign them with your own wallet, in the order given, and send them yourself. ' +
  'Creating a term costs a non-recoverable fee — compare total_value_wei against your budget ' +
  'first.';

export function serialiseDeclarePlan(plan: DeclarePlan) {
  return {
    chain_id: plan.chainId,
    subject_atom_id: plan.subject,
    predicate_term_id: plan.predicate,
    tools: plan.tools.map((tool) => ({
      uri: tool.uri,
      // Not always `uri`: for an http(s) URL the atom derives from a Thing computed off the
      // normalised URL, so this is the `ipfs://` string the id is actually the hash of.
      atom_uri: tool.atomUri,
      atom_id: tool.atomId,
      atom_source: tool.atomSource,
      triple_id: tool.tripleId,
      atom_exists: tool.atomExists,
      triple_exists: tool.tripleExists,
      // The bytes to pin for this atom to read as a name instead of a hash. Creating, declaring
      // and staking all work without it; only legibility does not.
      ...(tool.pinDocument === undefined ? {} : { pin_document: tool.pinDocument }),
      ...(tool.bareUrlWarning === undefined ? {} : { bare_url_warning: tool.bareUrlWarning }),
    })),
    calls: plan.calls.map(serialiseCall),
    existing_terms: plan.existingTerms,
    total_value_wei: plan.totalValue.toString(),
    caveat: UNSIGNED_CAVEAT,
  };
}

export function serialiseStakePlan(plan: StakePlan) {
  return {
    chain_id: plan.chainId,
    curve_id: plan.curveId.toString(),
    min_deposit_wei: plan.minDeposit.toString(),
    targets: plan.targets.map((target) => ({
      triple_id: target.tripleId,
      receiver: target.receiver,
      amount_wei: target.amount.toString(),
      exists: target.exists,
    })),
    calls: plan.calls.map(serialiseCall),
    total_value_wei: plan.totalValue.toString(),
    caveat: UNSIGNED_CAVEAT,
  };
}
