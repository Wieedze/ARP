import {
  INTUITION_HAS_TAG_MAINNET as HAS_TAG,
  planReachability,
  privateProbeTarget,
  probeEndpoint,
  readReachabilityState,
  verdictOf,
} from '@arp-protocol/core';

import { chainId, MULTI_VAULT, reads, REACHABLE_ATOM } from '../config.js';
import { type JsonRpcId, fail, text, isTermId, isAddress } from '../rpc.js';
import { serialiseCall, UNSIGNED_CAVEAT } from '../serialise.js';

/**
 * Does this endpoint answer?
 *
 * The verdict vocabulary is the prober's and the asymmetry in it is principled: a timeout **is** an
 * answer about the agent, because an endpoint that cannot respond in eight seconds is not serving
 * callers; a TLS or DNS failure is **not**, because it could equally be us; a `429` is never a
 * verdict, it is the host asking us to stop. Some genuinely dead endpoints therefore land in
 * `inconclusive` — a true positive given up rather than a false accusation risked, and the observed
 * body is carried so a caller can draw its own conclusion from the same evidence.
 *
 * It lives here and not in the app for one reason: a probe in a browser would be every reader of a
 * page firing at somebody else's host.
 */
export async function probe(id: JsonRpcId, args: Record<string, unknown>) {
  const url = args['url'];
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
    return fail(id, -32602, 'url must be an http or https address');
  }
  // `privateProbeTarget` lives in the package, with its boundary tests — 172.15 and 172.32 are
  // public and only 172.16 through 172.31 are not, and `10.example.com` is a real host.
  const local = process.env['ARP_ALLOW_PRIVATE_PROBE'] === '1' ? null : privateProbeTarget(url);
  if (local !== null) {
    return fail(
      id,
      -32602,
      `${local} is not a public address. This probe exists to ask somebody else's endpoint ` +
        "whether it answers; pointed at a private one it reads the operator's own network and " +
        'reports it back. Set ARP_ALLOW_PRIVATE_PROBE=1 if you are probing your own rig.',
    );
  }
  const protocolRaw = args['protocol'];
  if (protocolRaw !== undefined && protocolRaw !== 'mcp' && protocolRaw !== 'a2a') {
    return fail(id, -32602, "protocol, when given, must be 'mcp' or 'a2a'");
  }

  const outcome = await probeEndpoint({
    declaredUnder: 'endpoints',
    name: protocolRaw ?? null,
    protocol: (protocolRaw as 'mcp' | 'a2a' | undefined) ?? null,
    version: null,
    capabilities: [],
    classification: { status: 'probeable', url, declared: url },
  });
  return text(id, { url, outcome });
}

/**
 * Probe an endpoint and plan the position that records what you found.
 *
 * The server has been producing the only reproducible claim in this system and throwing it away. This
 * writes it — or rather, prepares the write: the caller signs with **its own** key, so what lands is
 * *this agent's* verdict and not ARP's. ARP's index reads the attestor's positions; everybody
 * else's sit beside them, and a disagreement between them is the signal to re-probe.
 *
 * **One observation is enough here, and that is deliberate.** The scheduled prober needs three
 * consecutive down verdicts before condemning, because it is making a public judgement about
 * somebody else's service from the outside and condemning takes an author's visibility away. An
 * agent that called an endpoint and got nothing is reporting **what happened to it**. Asking it for
 * three confirmations would be asking it to doubt its own experience.
 *
 * It plans and does not sign (ADR `0038`), like every other write path on this server.
 */
export async function recordReachable(id: JsonRpcId, args: Record<string, unknown>) {
  const url = args['url'];
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
    return fail(id, -32602, 'url must be an http or https address');
  }
  const toolAtomId = args['tool_atom_id'];
  if (!isTermId(toolAtomId)) {
    return fail(id, -32602, 'tool_atom_id must be 0x + 32 bytes — arp_find_tools returns them');
  }
  const receiver = args['receiver'];
  if (!isAddress(receiver)) return fail(id, -32602, 'receiver must be a 0x address');
  const protocolRaw = args['protocol'];
  if (protocolRaw !== undefined && protocolRaw !== 'mcp' && protocolRaw !== 'a2a') {
    return fail(id, -32602, "protocol, when given, must be 'mcp' or 'a2a'");
  }

  const outcome = await probeEndpoint({
    declaredUnder: 'endpoints',
    name: protocolRaw ?? null,
    protocol: (protocolRaw as 'mcp' | 'a2a' | undefined) ?? null,
    version: null,
    capabilities: [],
    classification: { status: 'probeable', url, declared: url },
  });

  const verdict = verdictOf(outcome);
  const curveId = await reads.defaultCurveId();
  const state = await readReachabilityState(
    reads,
    receiver,
    toolAtomId,
    HAS_TAG,
    REACHABLE_ATOM,
    curveId,
  );

  // `minDeposit` read per call, never copied: it is 10x apart between chains and governance may
  // move it (`rules/portability.md` rule 3).
  const stake = await reads.minDeposit();
  // Read for the same reason as `stake`, and spent only when the claim is not on chain yet — which
  // is the common case for a tool nobody has reported on before.
  const tripleCost = await reads.tripleCost();
  const plan = planReachability(state, [verdict], {
    multiVault: MULTI_VAULT,
    chainId,
    receiver,
    curveId,
    stake,
    tripleCost,
    toolLabel: url,
    // First hand. See the note above.
    condemnAfter: 1,
  });

  return text(id, {
    url,
    // The probe's own result, carried whole: a confirmed outcome holds the exact request, so
    // anybody can reproduce this verdict with one curl. That is what replaces an oracle here.
    outcome,
    verdict,
    triple_id: state.terms.triple,
    counter_triple_id: state.terms.counter,
    you_currently_assert: state.recorded,
    // Nothing in this server creates it, but a caller that deposited by hand could, and resolving it
    // silently would hide a contradiction the reader is entitled to see.
    ...(state.bothSides ? { warning: 'this address holds a position on BOTH sides' } : {}),
    would_become: plan.to,
    why: plan.why,
    calls: plan.calls.map(serialiseCall),
    total_value_wei: plan.calls.reduce((sum, call) => sum + call.value, 0n).toString(),
    caveat: UNSIGNED_CAVEAT,
  });
}
