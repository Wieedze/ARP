import { readFileSync } from 'node:fs';
import {
  corroborationOf,
  parseSessionLog,
  prepareDeclareUsed,
  resolveDeclarationSubject,
  resolveInvocations,
  type SignedContentReceipt,
  verifyContentReceipt,
} from '@arp-protocol/core';

import {
  SESSION_LOG,
  RECEIPTS_LOG,
  chainId,
  sessionCatalogue,
  acceptedSigners,
  GRAPHQL,
  reads,
  toolAtoms,
} from '../config.js';
import { type JsonRpcId, fail, text, isAddress } from '../rpc.js';
import { UNSIGNED_CAVEAT, serialiseDeclarePlan } from '../serialise.js';

/**
 * The receipts this machine kept, keyed by atom id.
 *
 * Written by `apps/mcp/src/fetch-skill.ts`. Absent is the normal case and not an error: a
 * declaration with no receipt is exactly the declaration this project has always had, which is
 * ADR `0080`'s point — a receipt can only add.
 *
 * The last receipt for an atom wins. Fetching the same tool twice is the same tool, and the later
 * fetch is the one whose digest matches what is on disk now.
 */
async function readLocalReceipts(): Promise<Map<string, SignedContentReceipt>> {
  const held = new Map<string, SignedContentReceipt>();
  let text: string;
  try {
    text = readFileSync(RECEIPTS_LOG, 'utf8');
  } catch {
    return held;
  }
  for (const line of text.split('\n')) {
    if (line.trim().length === 0) continue;
    try {
      const row = JSON.parse(line) as { atom?: string; receipt?: SignedContentReceipt };
      if (typeof row.atom !== 'string' || row.receipt === undefined) continue;
      held.set(row.atom.toLowerCase(), row.receipt);
    } catch {
      // A half-written last line is how this file ends while a session runs.
      continue;
    }
  }
  return held;
}

/** The agent a declaration is about, with its registry when the caller named one. */
function agentRefOf(chainId: number, tokenId: string, registry: unknown) {
  return {
    chainId,
    tokenId,
    ...(typeof registry === 'string' && isAddress(registry) ? { registry } : {}),
  };
}

export async function declareUsed(id: JsonRpcId, args: Record<string, unknown>) {
  const agentChainId = args['agent_chain_id'];
  const agentTokenId = args['agent_token_id'];
  const tools = args['tools'];
  if (typeof agentChainId !== 'number' || !Number.isInteger(agentChainId) || agentChainId <= 0) {
    return fail(id, -32602, 'agent_chain_id must be a positive integer');
  }
  if (typeof agentTokenId !== 'string' || !/^\d+$/.test(agentTokenId)) {
    return fail(id, -32602, 'agent_token_id must be a decimal string');
  }
  if (!Array.isArray(tools) || tools.some((tool) => typeof tool !== 'string')) {
    return fail(id, -32602, 'tools must be an array of URI strings');
  }
  const registryRaw = args['registry'];
  if (registryRaw !== undefined && !isAddress(registryRaw)) {
    return fail(id, -32602, 'registry, when given, must be a 20-byte hex address');
  }

  const subject = await resolveDeclarationSubject({
    agent: agentRefOf(agentChainId, agentTokenId, registryRaw),
    graphqlUrl: GRAPHQL,
  });
  const plan = await prepareDeclareUsed({
    subject,
    tools: tools as string[],
    reads,
    lookup: toolAtoms,
  });
  return text(id, serialiseDeclarePlan(plan));
}

/**
 * Declare what the session actually invoked, from the hook's log.
 *
 * `tasks/31` deliverable 4. The difference from `arp_declare_used` is where the list comes from:
 * there the agent passes the tools it believes it used, which is the agent's word about the agent.
 * Here the list is the runtime's own record, written by a hook the model never touched.
 *
 * **It plans only for what it can name exactly.** A skill's name is carried by several
 * repositories, so an ambiguous one is reported with every candidate and gets no call. Picking one
 * would write an edge about a repository the agent may never have touched, with a position behind
 * it — worse on this project's ladder than no claim at all.
 */
export async function declareSession(id: JsonRpcId, args: Record<string, unknown>) {
  const agentChainId = args['agent_chain_id'];
  const agentTokenId = args['agent_token_id'];
  if (typeof agentChainId !== 'number' || !Number.isInteger(agentChainId) || agentChainId <= 0) {
    return fail(id, -32602, 'agent_chain_id must be a positive integer');
  }
  if (typeof agentTokenId !== 'string' || !/^\d+$/.test(agentTokenId)) {
    return fail(id, -32602, 'agent_token_id must be a decimal string');
  }
  const declarer = args['declarer'];
  if (declarer !== undefined && !isAddress(declarer)) {
    return fail(id, -32602, 'declarer must be a 20-byte hex address');
  }
  const registryRaw = args['registry'];
  if (registryRaw !== undefined && !isAddress(registryRaw)) {
    return fail(id, -32602, 'registry, when given, must be a 20-byte hex address');
  }

  const given = args['log'];
  if (given !== undefined && typeof given !== 'string') {
    return fail(id, -32602, 'log must be the JSONL text of a session log');
  }
  let raw: string;
  if (typeof given === 'string') {
    raw = given;
  } else {
    try {
      raw = readFileSync(SESSION_LOG, 'utf8');
    } catch {
      return fail(
        id,
        -32602,
        `no log passed and ${SESSION_LOG} is not readable — wire apps/hook/src/hook.ts as a PostToolUse hook, or pass \`log\``,
      );
    }
  }

  // A server on a chain with no recorded catalogue would answer `unknown` for every invocation —
  // "I have never heard of any of your tools" — when the truth is that this server is pointed at a
  // chain where no skill is recorded. That is the trap `configuredAttestor` documents in
  // `config.ts`: a result of zero reads as "the world is empty" rather than as "this server is
  // misconfigured". The info document prints `catalogued_skills`, which is the right
  // instinct in the wrong place — an agent reads the tool response, not the document.
  if (sessionCatalogue.length === 0) {
    return fail(
      id,
      -32602,
      `no skill catalogue is recorded for chain ${chainId}, so nothing in a log can be named. ` +
        'Only 13579 has one today: start the server with ARP_TARGET=testnet to use this tool.',
    );
  }

  const resolutions = resolveInvocations(parseSessionLog(raw), sessionCatalogue);
  const resolved = resolutions.filter((row) => row.status === 'resolved');

  // The receipts the agent kept, read once. A resolution with no receipt is not a worse claim than
  // a declaration has always been — it is exactly that claim, which is the point of ADR `0080`.
  const receipts = await readLocalReceipts();
  const corroboration = new Map<string, string>();
  for (const row of resolved) {
    if (row.status !== 'resolved') continue;
    const held = receipts.get(row.atomId.toLowerCase());
    if (held === undefined) continue;
    const verdict = await verifyContentReceipt(held);
    if (verdict.status !== 'valid') {
      corroboration.set(row.atomId, `receipt did not verify: ${verdict.status}`);
      continue;
    }
    // **Only against the address that will sign.** This fell back to `held.receipt.to` when
    // `declarer` was omitted, which made `served === declarer` true by construction and the
    // verdict a constant: every receipt that verified read as corroborating, computed against the
    // server's own claim about who it served. A missing declarer is a missing input, and saying so
    // is the only honest answer.
    if (!isAddress(declarer)) {
      corroboration.set(
        row.atomId,
        'a receipt is held — pass `declarer` (the address that will sign) to have it assessed',
      );
      continue;
    }
    const read = corroborationOf(held.receipt, verdict.signer, declarer, acceptedSigners());
    corroboration.set(row.atomId, `${read.status} (signed by ${verdict.signer})`);
  }

  const plan =
    resolved.length === 0
      ? null
      : await prepareDeclareUsed({
          subject: await resolveDeclarationSubject({
            agent: agentRefOf(agentChainId, agentTokenId, registryRaw),
            graphqlUrl: GRAPHQL,
          }),
          tools: resolved.map((row) => (row.status === 'resolved' ? row.url : '')),
          reads,
          lookup: toolAtoms,
        });

  return text(id, {
    invocations: resolutions.map((row) => ({
      status: row.status,
      name: row.name,
      calls: row.calls,
      ...(row.status === 'resolved'
        ? {
            repo: row.repo,
            url: row.url,
            atom_id: row.atomId,
            // What a second party says about the access, where one was asked. ADR `0080`: it
            // attests ACCESS and never use, and a self-signed receipt is labelled, not refused.
            access: corroboration.get(row.atomId) ?? 'no receipt — this is your own word',
          }
        : {}),
      ...(row.status === 'ambiguous' ? { candidates: row.candidates } : {}),
      // One tool carries this name and the catalogue has no atom id for it. 61 of 662 rows on
      // 13579, and their atoms DO exist on chain — so the URL goes out, because a caller that can
      // derive the id itself has everything it needs.
      ...(row.status === 'unrecorded' ? { repo: row.repo, url: row.url } : {}),
      ...(row.status === 'unknown' ? { kind: row.kind } : {}),
    })),
    // Said plainly, because the difference between "nothing was invoked" and "nothing could be
    // named" is the difference between an idle session and a defect.
    planned_for: resolved.length,
    not_planned_for: resolutions.length - resolved.length,
    plan: plan === null ? null : serialiseDeclarePlan(plan),
    caveat: UNSIGNED_CAVEAT,
  });
}
