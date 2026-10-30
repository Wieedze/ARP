/** ARP's MCP server — the surface an agent reads tool reputation through, and declares through.
 *
 *  Phase 1 of `docs/15_ROADMAP.md`, the first half of `tasks/16`. **Run it yourself** (ADR `0045`):
 *  the invariant is that ARP is never in the path of a request, and code on the operator's machine
 *  is not in the path while a host they must reach is.
 *
 *      bun run apps/mcp/src/server.ts --stdio              # for an MCP client to launch
 *      bun run apps/mcp/src/server.ts                      # mainnet 1155, listens on :3002
 *      ARP_TARGET=testnet bun run apps/mcp/src/server.ts   # testnet 13579
 *      PORT=4000 bun run apps/mcp/src/server.ts
 *
 *  Two transports over **one** dispatch: `handler.fetch` is the only place a method is handled, and
 *  the stdio loop wraps it rather than re-implementing it. In stdio mode **stdout is the protocol
 *  channel**, so every diagnostic goes to stderr — a stray `console.log` there corrupts the stream.
 *
 *  MCP over HTTP is JSON-RPC with three methods — `initialize`, `tools/list`, `tools/call` — so it
 *  is hand-rolled rather than pulling a dependency. `@arp-protocol/core` holds the protocol logic;
 *  this app is a transport over it, which is why it lives in `apps/mcp/` and not in the package
 *  (`rules/portability.md`). Load-time config is `config.ts`, one file per tool group is
 *  `handlers/`, and this file keeps the two transports and the dispatch.
 *
 *  **It signs nothing and sends nothing.** One tool reads. The two planners return prepared calls
 *  for the agent to sign with its own key — ARP holds no key, so it cannot spend an operator's
 *  TRUST even by mistake (ADR `0038`), which is what makes "ARP is not a party" (ADR `0035`) a
 *  property rather than a promise.
 *
 *  Two things it is deliberately not:
 *    - not meant to be a host an agent depends on — and today it is one. Planning lives here: atom
 *      resolution, the refuse-on-ambiguous rule, the cost reads. If this process is down an agent
 *      cannot build its plan. "The agent chooses to call it", which this comment used to argue, is
 *      true of signing and false of planning. ADR `0045` moves this to a server the operator runs; the
 *      dependency is real until then and is stated here rather than defended.
 *    - not a scorer. It returns what was staked and by whom, with provenance. Composing that into a
 *      single number is a decision nobody has made (`docs/01` rejects being one more score).
 */

import { TOOLS } from './tools.js';
import { serveContentRequest } from './content.js';
import {
  PORT,
  RECEIPT_SIGNER,
  targetName,
  chainId,
  record,
  sessionCatalogue,
  acceptedSigners,
  GRAPHQL,
  RPC,
  MULTI_VAULT,
} from './config.js';
import { type JsonRpcId, type Rpc, result, fail } from './rpc.js';
import { toolReputation } from './handlers/reputation.js';
import { declareUsed, declareSession } from './handlers/declare.js';
import { stakeOnUsed, takePosition, exitPosition } from './handlers/positions.js';
import { agentEndpoints, identity, findAgents } from './handlers/agents.js';
import { probe, recordReachable } from './handlers/reachability.js';
import { findTools } from './handlers/find-tools.js';

const PROTOCOL_VERSION = '2025-06-18';

/**
 * What a client is told at `initialize`, and the only context an agent gets if it never reads
 * `skills/arp/SKILL.md`.
 *
 * It used to be four sentences of **precautions** — unsigned calls, position counts, no score. All
 * true, and useless as context: it told a caller what to be careful about and nothing about what the
 * work is or why it would be worth doing. A tool list plus a list of warnings leaves an agent knowing
 * which calls exist and not one reason to make any of them.
 *
 * So it carries the same frame the skill does: what the expense buys, the four jobs, and which of
 * them needs nothing. The precautions are still here — they are the last line, where a precaution
 * belongs.
 */
const SERVER_INSTRUCTIONS = [
  'ARP points at AI things — agents, tools, MCP servers — and opens a priced market of opinion on',
  'them. It stores none of them: what is listed exists somewhere else, and what ARP adds is the',
  'market.',
  '',
  'WHY SPEND ON THIS. Declaring costs 0.1 TRUST on mainnet and the fee does not come back. What it',
  'buys is a record that you used a tool which is public, attributed to you, and permanent — a review',
  'is free, so it is worth what it cost. Other agents read that when choosing whom to hire. If you',
  'never declare anything, you are not in that set.',
  '',
  'A deposit is a different act from a declaration, and it goes both ways: you buy a position on an',
  'agent or a tool, and you can redeem it. So a figure you read is what people hold NOW, not what was',
  'ever put in. Anyone can deposit against a claim at the same price, but almost nobody does — 1 of',
  '185 `uses` edges on mainnet 1155 as of 2026-10-21 — so read an empty counter vault as "nobody',
  'bothered", never as agreement.',
  '',
  'FOUR JOBS, and they need different things:',
  '  check a tool or an agent   needs NOTHING — public reads, no wallet, no identity. Start here.',
  '  declare what you used      needs a funded wallet and an ERC-8004 identity',
  '  list a tool nobody has     needs a funded wallet. An atom has no subject, so no identity',
  '  be hired                   needs an endpoint YOU run. Nothing here provides it',
  '',
  'THIS SERVER PREPARES CALLS AND NOTHING ELSE. It holds no key and has no send path: every planner',
  'returns UNSIGNED calls that you sign and send yourself. Reading is free and needs none of that.',
  '',
  'TWO THINGS TO KNOW BEFORE ACTING ON A NUMBER. Assets above zero mean the term exists, not that',
  'somebody staked — creating a term seeds its vaults; position_count is the discriminator. And ARP',
  'composes no score: every figure is a deposit somebody else made.',
].join('\n');

async function callTool(id: JsonRpcId, params: Record<string, unknown> | undefined) {
  const name = typeof params?.['name'] === 'string' ? params['name'] : null;
  const args = (params?.['arguments'] ?? {}) as Record<string, unknown>;
  try {
    switch (name) {
      case 'arp_tool_reputation':
        return await toolReputation(id, args);
      case 'arp_declare_used':
        return await declareUsed(id, args);
      case 'arp_stake_on_used':
        return await stakeOnUsed(id, args);
      case 'arp_take_position':
        return await takePosition(id, args);
      case 'arp_exit_position':
        return await exitPosition(id, args);
      case 'arp_identity':
        return await identity(id, args);
      case 'arp_agent_endpoints':
        return await agentEndpoints(id, args);
      case 'arp_probe_endpoint':
        return await probe(id, args);
      case 'arp_find_agents':
        return await findAgents(id, args);
      case 'arp_record_reachable':
        return await recordReachable(id, args);
      case 'arp_find_tools':
        return await findTools(id, args);
      case 'arp_declare_session':
        return await declareSession(id, args);
      default:
        return fail(id, -32602, `unknown tool: ${String(name)}`);
    }
  } catch (error) {
    // The message, not a stack: a caller gets enough to retry or report, nothing about our host.
    return fail(id, -32603, `${String(name)} failed: ${String(error).slice(0, 300)}`);
  }
}

export const handler = {
  port: PORT,
  /**
   * Loopback by default, and that is a security decision rather than a convenience.
   *
   * `Bun.serve` binds every interface when no hostname is given, so this listened on the LAN —
   * and `arp_probe_endpoint` fetches a URL the CALLER supplies. Together that made an installed
   * server an open proxy into the operator's own network: anything that could reach the port could
   * ask it to fetch `http://127.0.0.1:…` or a cloud metadata address and read the answer.
   *
   * Found 2026-10-29 while writing `docs/22` for people who would install this. `ARP_HOST=0.0.0.0`
   * opens it deliberately, for somebody who meant to.
   */
  hostname: process.env['ARP_HOST'] ?? '127.0.0.1',
  async fetch(request: Request) {
    if (request.method === 'GET') {
      // `GET /content/:atomId` — the one route that is not MCP and not an info document. It is the
      // content path (ADR `0080`): the server fetches a skill from its origin, passes the bytes
      // through and signs for having served them. It holds the only key on ARP's side, that key
      // signs receipts and nothing else, and it cannot move value.
      const path = new URL(request.url).pathname;
      const content = /^\/content\/([^/]+)\/?$/.exec(path);
      if (content !== null) {
        return await serveContentRequest(
          content[1] ?? '',
          new URL(request.url).searchParams,
          chainId,
          RECEIPT_SIGNER,
        );
      }

      // Not part of MCP. A plain GET is what the verifier's non-protocol probe sends, and
      // answering it makes this endpoint `live` rather than `dead` for that path too.
      return Response.json({
        name: 'ARP',
        description: 'Agent and tool reputation over the Intuition knowledge graph.',
        mcp: { protocolVersion: PROTOCOL_VERSION, tools: TOOLS.map((t) => t.name) },
        chain: { id: chainId, name: record.chain?.name ?? null },
        // A receipt names its signer and a reader decides which signers it accepts (ADR `0080`
        // constraint 4), so the address is published here rather than only inside a receipt. The
        // key itself is never printed, never returned and never sent anywhere.
        content: {
          route: '/content/:atomId',
          signer: RECEIPT_SIGNER?.address ?? null,
          attests: 'access, never use',
          // What THIS server's reader accepts as a second party. Empty means it names none, and a
          // receipt from any signer reads as `unknown-signer` — the honest default, because an
          // operator-run server's key is unlinkable to that operator's agent key (ADR `0080`).
          accepted_signers: acceptedSigners(),
          catalogued_skills: sessionCatalogue.length,
        },
      });
    }
    if (request.method !== 'POST') return new Response('method not allowed', { status: 405 });

    let body: Rpc;
    try {
      body = (await request.json()) as Rpc;
    } catch {
      return fail(null, -32700, 'parse error');
    }
    const id = body.id ?? null;

    switch (body.method) {
      case 'initialize':
        return result(id, {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: 'ARP', version: '0.2.0' },
          instructions: SERVER_INSTRUCTIONS,
        });
      case 'notifications/initialized':
        // A notification has no id and takes no response body.
        return new Response(null, { status: 202 });
      case 'tools/list':
        return result(id, { tools: TOOLS });
      case 'tools/call':
        return callTool(id, body.params);
      case 'ping':
        return result(id, {});
      default:
        return fail(id, -32601, `method not found: ${String(body.method)}`);
    }
  },
};

/**
 * The stdio transport — newline-delimited JSON-RPC over stdin/stdout, which is how an MCP client
 * launches a local server.
 *
 * It wraps `handler.fetch` instead of re-implementing the dispatch, so there is exactly one place a
 * method is handled and the two transports cannot drift. A 202 (a notification) has no body and
 * writes nothing, which is what the protocol requires.
 *
 * **Everything printed here goes to stderr.** stdout is the protocol channel: one stray line on it
 * desynchronises the client, and the failure looks like a malformed server rather than a log.
 */
async function serveStdio(): Promise<void> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let buffered = '';

  const send = (line: string) => Bun.write(Bun.stdout, encoder.encode(`${line}\n`));

  for await (const chunk of Bun.stdin.stream()) {
    buffered += decoder.decode(chunk as Uint8Array, { stream: true });
    let newline = buffered.indexOf('\n');
    while (newline !== -1) {
      const line = buffered.slice(0, newline).trim();
      buffered = buffered.slice(newline + 1);
      newline = buffered.indexOf('\n');
      if (line.length === 0) continue;

      const response = await handler.fetch(
        new Request(`http://stdio/`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: line,
        }),
      );
      if (response.status === 202) continue;
      await send(await response.text());
    }
  }
}

if (import.meta.main) {
  const stdio = process.argv.includes('--stdio') || process.env.ARP_TRANSPORT === 'stdio';
  // stderr in both modes: the banner is a diagnostic, and on stdio stdout belongs to the protocol.
  const log = (line: string) => process.stderr.write(`${line}\n`);

  log(`ARP MCP server — ${stdio ? 'stdio' : `http://localhost:${PORT}`}`);
  log(`  chain:      ${chainId} (${record.chain?.name ?? 'unknown'}) via ARP_TARGET=${targetName}`);
  log(`  graph:      ${GRAPHQL}`);
  log(`  rpc:        ${RPC}`);
  log(`  multivault: ${MULTI_VAULT}`);

  if (stdio) {
    await serveStdio();
    process.exit(0);
  }

  Bun.serve(handler);
  log(
    `  listening:  ${handler.hostname}:${PORT}${handler.hostname === '127.0.0.1' ? ' (loopback only — ARP_HOST=0.0.0.0 to open it)' : ' — OPEN TO THE NETWORK'}`,
  );
  log(`  tools:      ${TOOLS.map((t) => t.name).join(', ')}`);
  log(`  content:    GET /content/:atomId`);
  log(
    `  receipts:   ${
      RECEIPT_SIGNER === null ? 'none — ARP_NO_RECEIPTS=1' : `signed by ${RECEIPT_SIGNER.address}`
    }`,
  );
  // This read "signs nothing, sends nothing" until 2026-10-29, and the first half stopped being
  // true the moment the content route landed. The half that matters is unchanged and is the one
  // worth printing: no plan is ever signed here, so this process cannot spend an operator's TRUST.
  log(`\nsends nothing — the planners return calls for your own key, signed by you.`);
  log(`The receipt key signs receipts and cannot move value (ADR 0080).`);
}
