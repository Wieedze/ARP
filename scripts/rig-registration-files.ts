/** The three registration files for the testnet rig, and the calls that mint them.
 *
 *  Task 24 / Phase 0 of `docs/15_ROADMAP.md`. The rig on Intuition testnet 13579 is already
 *  deployed — ARP's own ERC-8004 registry, ModuleRegistry, both enforcers, the MultiVault and the
 *  DelegationManager. What it lacks is agents anything can read: the two that exist were minted with
 *  the no-argument `register()` and carry an empty `tokenURI`, so the whole discovery path runs
 *  against nothing.
 *
 *      bun run scripts/rig-registration-files.ts            # print the files and the calls
 *      bun run scripts/rig-registration-files.ts --cast     # print ready-to-run cast commands
 *
 *  **This script signs nothing and sends nothing.** It prints the registration files and the
 *  transactions that would create them. The operator runs them with their own key — the same
 *  division as everywhere else in this project (ADR 0035).
 *
 *  The files are `data:` URIs on purpose: 18 of the sampled mainnet agents do it that way, and it
 *  carries no uptime obligation. A pinned file would need a CID that is actually valid — 18
 *  permanent testnet atoms already exist for strings like `ipfs://bafkreislither…` that are not CIDs
 *  (`tasks/20` appendix), and that mistake is not worth repeating for a test rig.
 *
 *  Shapes follow the 2026-10-16 cohort measurement rather than what is convenient:
 *    - `services[]`, not `endpoints[]` — 106 occurrences against 2 across 150 random Base ids
 *    - a declared protocol name, so the handshake path exercises
 *    - capabilities on one agent only — 0 of 112 real documents declared any, so it is the rare case
 *      and the one the code is least exercised against
 *    - one endpoint deliberately unprobeable — 82% of real ones are, and that is the group that must
 *      never be reported as a defect
 */

export const REGISTRY = '0xC165A2AD2E540A4069E02834009161E2b4490d5A';
const RPC = 'https://testnet.rpc.intuition.systems/http';
const TYPE = 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1';

/**
 * `rig-confirmed` points at a live third-party MCP server.
 *
 * Endpoints are HTTP and chain-independent, so a testnet agent with a real endpoint is not a
 * contradiction — it is what a real agent looks like. **But the gate's `confirmed` case then depends
 * on somebody else's uptime**, which is a known fragility of this rig and the reason the file names
 * which server it borrowed. Swap it the moment ARP runs one of its own.
 */
const BORROWED_ENDPOINT = 'https://nebula-scan-ten.vercel.app/mcp';

export type RigFile = { slug: string; exercises: string; doc: Record<string, unknown> };

/**
 * Exported so the rig is **tested, not eyeballed**. `erc8004/test/rig-files.test.ts` runs them
 * through the real classifier and asserts each produces the group it claims to exercise — a rig
 * whose fixtures were never checked is the same failure as a fixture set covering one member of a
 * nine-member union (task 15).
 */
export const FILES: RigFile[] = [
  {
    slug: 'rig-confirmed',
    exercises: 'confirmed/serves-declared-protocol, plus capability recovery via tools/list',
    doc: {
      type: TYPE,
      name: 'ARP Rig — Confirmed',
      description:
        "Testnet rig agent. Declares a live MCP endpoint so the verifier's confirmed path " +
        'and its tools/list recovery both exercise. The endpoint is borrowed from ' +
        '8453:26183 (nebula-scan) because ARP runs no MCP server of its own yet; this ' +
        "agent's confirmed verdict therefore depends on a third party's uptime.",
      services: [
        {
          name: 'mcp',
          endpoint: BORROWED_ENDPOINT,
          version: '2024-11-05',
          capabilities: ['bridge_monitor', 'peg_checker', 'exploit_scanner'],
        },
      ],
      x402Support: false,
      active: true,
    },
  },
  {
    slug: 'rig-dead',
    exercises: 'confirmed/dead — a fact about the agent, not a limit of ours',
    doc: {
      type: TYPE,
      name: 'ARP Rig — Dead Endpoint',
      description:
        'Testnet rig agent. Declares an MCP endpoint on a host that does not resolve, so ' +
        "the verifier's dead path exercises. A timeout is an answer about the agent: an " +
        'endpoint that cannot respond is not serving callers.',
      services: [
        {
          name: 'mcp',
          endpoint: 'https://arp-rig-does-not-exist.invalid/mcp',
          version: '2025-06-18',
        },
      ],
      active: true,
    },
  },
  {
    slug: 'rig-unprobeable',
    exercises: 'not-checkable ×2 — templated and non-http-identifier. NEVER a defect.',
    doc: {
      type: TYPE,
      name: 'ARP Rig — Unprobeable',
      description:
        'Testnet rig agent. Declares only endpoints that cannot be probed: a templated URL ' +
        'whose substitution the file does not describe, and a CAIP-10 identifier. This is ' +
        '82% of real declared endpoints. The agent did nothing wrong, and a verifier that ' +
        'reports either as a failure mass-slanders the cohort on its first run.',
      services: [
        {
          name: 'a2a',
          endpoint: 'https://arp-rig.invalid/api/v1/a2a/agents/{agentId}/card',
          version: '0.3.0',
        },
        { name: 'wallet', endpoint: 'eip155:13579:0xE596096F4176b682E300d73963e7B04B383C1AA1' },
      ],
      active: true,
    },
  },
];

export function dataUri(doc: Record<string, unknown>): string {
  return `data:application/json;base64,${Buffer.from(JSON.stringify(doc)).toString('base64')}`;
}

const wantsCast = process.argv.includes('--cast');
const isMain = import.meta.main;

if (isMain) {
  console.log(`registry ${REGISTRY} on Intuition testnet 13579`);
  console.log(`rpc      ${RPC}\n`);

  for (const { slug, exercises, doc } of FILES) {
    const uri = dataUri(doc);
    console.log('─'.repeat(78));
    console.log(`${slug}`);
    console.log(`  exercises: ${exercises}`);
    console.log(`  uri bytes: ${uri.length}`);
    if (wantsCast) {
      console.log(
        `\ncast send ${REGISTRY} \\\n  "register(string)" '${uri}' \\\n  --rpc-url ${RPC} --private-key $AGENT_OPERATOR_KEY\n`,
      );
    } else {
      console.log(`\n${JSON.stringify(doc, null, 2)}\n`);
    }
  }

  console.log('─'.repeat(78));
  console.log(`
${FILES.length} agents. Run with --cast for the commands.

Nothing here is signed or sent. The operator runs the three transactions with their own key, then
the gate is: the verifier reads all three off this registry and reports at least one confirmed, one
not-checkable, and one recovered capability list.

Note the ids are assigned by the registry in order, so the first mint is id 3 (totalAgents() = 2 as
of 2026-10-19 — re-read it rather than trusting this line).`);
}
