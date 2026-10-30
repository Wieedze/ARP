import {
  type AgentListOrder,
  fetchableDocumentUrl,
  listAgents,
  MAX_DOCUMENT_HOPS,
  nextDocumentHop,
  partitionByCheckability,
  readDeclaredEndpoints,
  resolveAgent,
  resolveDeclarationSubject,
  toCaip19,
} from '@arp-protocol/core';

import { GRAPHQL, directory } from '../config.js';
import { type JsonRpcId, fail, text, isAddress } from '../rpc.js';

/**
 * Where another agent said it can be reached.
 *
 * **ARP is not in the path of what you do with it.** `docs/12`: unplug ARP's servers and every
 * agent-to-agent call still completes. This hands over an address the agent published about itself;
 * the call that follows is between the two of you, and ADR `0060` is why there is no step in
 * between — a delegation names its delegate by address, an agent's runtime address is not on the
 * graph, so brokering a meeting is a promise with no mechanism. Handing over a published address is
 * not brokering.
 *
 * Declared, **not verified**: an agent writes its own card. `arp_probe_endpoint` is the separate
 * question, deliberately separate, because what was published and what answers are two facts.
 */
export async function agentEndpoints(id: JsonRpcId, args: Record<string, unknown>) {
  const agentChainId = args['agent_chain_id'];
  const agentTokenId = args['agent_token_id'];
  if (typeof agentChainId !== 'number' || !Number.isInteger(agentChainId) || agentChainId <= 0) {
    return fail(id, -32602, 'agent_chain_id must be a positive integer');
  }
  if (typeof agentTokenId !== 'string' || !/^\d+$/.test(agentTokenId)) {
    return fail(id, -32602, 'agent_token_id must be a decimal string');
  }
  const registryRaw = args['registry'];
  if (registryRaw !== undefined && !isAddress(registryRaw)) {
    return fail(id, -32602, 'registry, when given, must be a 20-byte hex address');
  }

  const agent = {
    chainId: agentChainId,
    tokenId: agentTokenId,
    ...(registryRaw === undefined ? {} : { registry: registryRaw }),
  };
  const identity = await resolveAgent(directory, agent);
  const file = identity?.registrationFile ?? null;
  if (file === null || file.trim() === '') {
    return text(id, {
      caip19: toCaip19(agent),
      registration_file: null,
      note: 'This agent registered without a document, so it published no way in.',
    });
  }

  let document: unknown;
  try {
    if (file.startsWith('data:')) {
      // Inline in the tokenURI — the shape an agent picks when it wants no hosting dependency.
      const comma = file.indexOf(',');
      const payload = file.slice(comma + 1);
      document = JSON.parse(
        file.slice(0, comma).includes(';base64')
          ? Buffer.from(payload, 'base64').toString('utf8')
          : decodeURIComponent(payload),
      );
    } else {
      // Both halves of the guard, in the package where `privateProbeTarget` assigns the scheme
      // check to its caller — `fetchableDocumentUrl` is that check, and it has the tests. It
      // refuses with `text` here where `probe()` refuses with `fail`, deliberately: there the URL
      // *is* the parameter so a bad one is an invalid param, and here the caller's params were
      // well-formed and the refusal is an answer *about the agent*, like the two outcomes below.
      const fetchable = fetchableDocumentUrl(file, {
        allowPrivate: process.env['ARP_ALLOW_PRIVATE_PROBE'] === '1',
      });
      if (fetchable.status === 'refuse') {
        return text(id, {
          caip19: toCaip19(agent),
          registration_file: file,
          error: `refused: ${fetchable.reason}`,
          note:
            'Published something this server will not fetch. A `tokenURI` is a string somebody ' +
            'else controls, and a scheme or an address like that reads the machine the server ' +
            'runs on rather than a document anybody published.',
        });
      }
      // **Redirects are followed by hand**, because `fetch` follows them itself and a guard on hop
      // one is not a guard: measured 2026-10-29, a caller-controlled PUBLIC host answering
      // `302 Location: http://169.254.169.254/…` returned the private body. Every hop goes through
      // the same check. `probeEndpoint` has the same exposure and is NOT fixed here — a refused
      // redirect has to mean something in its live/dead/inconclusive vocabulary, and that is a
      // decision with its own ADR (`docs/22` discloses it).
      let url = fetchable.url;
      let response = await fetch(url, {
        headers: { accept: 'application/json' },
        redirect: 'manual',
      });
      for (
        let hop = 0;
        hop < MAX_DOCUMENT_HOPS && response.status >= 300 && response.status < 400;
        hop += 1
      ) {
        const location = response.headers.get('location');
        if (location === null) {
          // A 3xx with no `Location` is a broken origin, not a redirect chain. Breaking here fell
          // through to the hop-budget branch below, which told a reader debugging that origin
          // "more than 3 redirects" after zero of them — the outcome was right and the sentence
          // was not.
          return text(id, {
            caip19: toCaip19(agent),
            registration_file: file,
            error: `the host answered ${response.status} with no Location header`,
            note: 'A redirect that does not say where. Nothing was followed and nothing was read.',
          });
        }
        const next = nextDocumentHop(url, location, {
          allowPrivate: process.env['ARP_ALLOW_PRIVATE_PROBE'] === '1',
        });
        if (next.status === 'refuse') {
          return text(id, {
            caip19: toCaip19(agent),
            registration_file: file,
            error: `refused: ${next.reason}`,
            note:
              'The document redirected somewhere this server will not follow. A guard on the first ' +
              'hop is not a guard, so every hop is checked the same way.',
          });
        }
        url = next.url;
        response = await fetch(url, {
          headers: { accept: 'application/json' },
          redirect: 'manual',
        });
      }
      if (response.status >= 300 && response.status < 400) {
        return text(id, {
          caip19: toCaip19(agent),
          registration_file: file,
          error: `refused: more than ${MAX_DOCUMENT_HOPS} redirects`,
          note: 'A document that needs more hops than that is not one anybody wants read.',
        });
      }
      if (!response.ok) {
        return text(id, {
          caip19: toCaip19(agent),
          registration_file: file,
          error: `the host answered ${response.status}`,
          note: 'Published something we could not read, which is a different answer from publishing nothing.',
        });
      }
      document = await response.json();
    }
  } catch (error) {
    return text(id, {
      caip19: toCaip19(agent),
      registration_file: file,
      error: error instanceof Error ? error.message : String(error),
      note: 'Published something we could not read, which is a different answer from publishing nothing.',
    });
  }

  // Split, never merged: showing them as one list implies the second group failed a check it was
  // never given.
  const { probeable, notCheckable } = partitionByCheckability(readDeclaredEndpoints(document));
  return text(id, {
    caip19: toCaip19(agent),
    registration_file: file,
    callable: probeable.map((endpoint) => ({
      name: endpoint.name,
      protocol: endpoint.protocol,
      version: endpoint.version,
      url: endpoint.classification.status === 'probeable' ? endpoint.classification.url : null,
      capabilities: endpoint.capabilities,
    })),
    not_callable: notCheckable.map((endpoint) => ({
      name: endpoint.name,
      declared:
        endpoint.classification.status === 'probeable' ? null : endpoint.classification.declared,
      why: endpoint.classification.status === 'probeable' ? null : endpoint.classification.code,
    })),
    note: "The agent's own claim about itself. `arp_probe_endpoint` asks whether one answers.",
  });
}

/**
 * Does this agent have an identity atom — the thing a `uses` edge must carry as its subject?
 *
 * The most useful read here, because of what `scripts/measure/cohort-coverage.ts` measures: the atom
 * is written by Intuition's **mirror**, the mirror holds 28,648, and the Base registry's highest
 * minted id was 309,925 on 2026-10-20. So for roughly nine agents in ten the answer is **no**, and
 * every other tool on this server fails for them until it is yes (ADR `0047`).
 *
 * A read. No credential, nothing signed. It reports the gap rather than closing it, because closing
 * it is a write — but the id is knowable either way: the atom's id is a pure function of the agent's
 * identity, computed locally by `agent-atom.ts` with no key and no network. Pinning only makes the
 * document readable, and anyone can pin the same bytes (ADR `0047`).
 */
export async function identity(id: JsonRpcId, args: Record<string, unknown>) {
  const agentChainId = args['agent_chain_id'];
  const agentTokenId = args['agent_token_id'];
  if (typeof agentChainId !== 'number' || !Number.isInteger(agentChainId) || agentChainId <= 0) {
    return fail(id, -32602, 'agent_chain_id must be a positive integer');
  }
  if (typeof agentTokenId !== 'string' || !/^\d+$/.test(agentTokenId)) {
    return fail(id, -32602, 'agent_token_id must be a decimal string');
  }
  const registryRaw = args['registry'];
  if (registryRaw !== undefined && !isAddress(registryRaw)) {
    return fail(id, -32602, 'registry, when given, must be a 20-byte hex address');
  }
  const agent = {
    chainId: agentChainId,
    tokenId: agentTokenId,
    ...(registryRaw === undefined ? {} : { registry: registryRaw }),
  };

  try {
    const subject = await resolveDeclarationSubject({ agent, graphqlUrl: GRAPHQL });
    return text(id, {
      caip19: toCaip19(agent),
      identity_atom: subject,
      declarable: true,
      note: 'This agent can declare. Its identity atom is the subject every `uses` edge carries.',
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'NoAgentIdentityError') {
      return text(id, {
        caip19: toCaip19(agent),
        identity_atom: null,
        declarable: false,
        note:
          'No identity atom on the graph, so this agent cannot declare yet. The atom is written ' +
          "by Intuition's mirror; measured 2026-10-20 the mirror holds 28,648 of a registry whose " +
          'highest minted id is 309,925, so this is the common case and not a fault of yours. ' +
          'Writing it needs two atoms and a `same as` triple — `scripts/agent/agent-identity-atom.ts`, ' +
          'ADR 0047. The atom ids are computable locally from your identity alone, with no API key.',
      });
    }
    throw error;
  }
}

/**
 * The directory: agents the graph holds, in the order the caller asks for.
 *
 * Two orders, and the names say what they measure rather than implying a ranking: how **many**
 * statements a source holds about an agent, or how much TRUST sits on its own atom. Neither is a
 * score and this server composes none (ADR `0046`) — a caller that wants one has the parts.
 *
 * `total` is the cohort's size from the source's own aggregate, never `agents.length`, so a page of
 * 25 out of 28,648 cannot read as 25 agents existing.
 */
export async function findAgents(id: JsonRpcId, args: Record<string, unknown>) {
  const orderRaw = args['order'] ?? 'evidence-quantity';
  if (orderRaw !== 'evidence-quantity' && orderRaw !== 'economic-conviction') {
    return fail(id, -32602, "order must be 'evidence-quantity' or 'economic-conviction'");
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
  const offsetRaw = args['offset'] ?? 0;
  if (typeof offsetRaw !== 'number' || !Number.isInteger(offsetRaw) || offsetRaw < 0) {
    return fail(id, -32602, 'offset must be a non-negative integer');
  }

  const page = await listAgents(directory, {
    order: orderRaw as AgentListOrder,
    limit: limitRaw,
    offset: offsetRaw,
  });

  return text(id, {
    source_id: page.sourceId,
    order: page.order,
    limit: page.limit,
    offset: page.offset,
    // The cohort's size, not this page's. A page count read as a population is the mistake.
    total: page.total,
    agents: page.agents.map((agent) => ({
      source_handle: agent.sourceHandle,
      caip19: agent.ref === null ? null : toCaip19(agent.ref),
      // Said rather than resolved: several `same as` edges means there is no single agent to
      // point at, and naming one would be a guess with a permanent reader.
      identity_ambiguous: agent.isIdentityAmbiguous,
      identity_edge_count: agent.identityEdgeCount,
      name: agent.metadata.name,
      // `Agent <chain>:<token>` is the canonical **fallback**, not a name an operator chose. Saying
      // which it is keeps a reader from crediting an agent with naming itself.
      name_is_fallback: agent.metadata.isFallback,
      statement_count: agent.statementCount,
      // `null` stays `null` and is never coerced to `0`. The first draft of this read a field that
      // does not exist (`totalAssets`) and `?? 0n`'d the `undefined`, so it reported **0 TRUST for
      // an agent carrying 13** — ADR `0042`'s family with the sign flipped, and it shipped because
      // `scripts/` is outside every typecheck (`docs/tasks/21`).
      own_atom_market:
        agent.market === null
          ? null
          : {
              // Market cap, not assets: this type carries no assets figure, and the two are not
              // the same number — 13.02 against 12.28 TRUST on the agent measured 2026-10-20.
              total_market_cap_wei:
                agent.market.totalMarketCap === null
                  ? null
                  : agent.market.totalMarketCap.toString(),
              // Positions, not distinct stakers: one account holding two is two here.
              position_count: agent.market.positionCount,
              // Summed across this many bonding curves. It matters: on the agent above, curve 1
              // held 0.00098 TRUST and curve 2 held 12.28, so a figure from one curve beside a
              // count from all of them is a contradiction.
              vault_count: agent.market.vaultCount,
            },
    })),
  });
}
