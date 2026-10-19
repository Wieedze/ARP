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
 *  transactions that would create them.
 *
 *  Who ran them, for the record: the three mints of 2026-10-19 were signed by an **agent session**
 *  with the operator's key, on the user's explicit ask — ADR 0037. That is a fact about that task,
 *  not about this file, and the two were conflated once already.
 *
 *  The operator runs them with their own key — the same
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
 *    - capabilities on one agent only — 0 of ~110 parsed documents across repeated n=200 samples (scripts/measure-cohort-skills.ts; the zero is stable, the denominator varies with the sample), so it is the rare case
 *      and the one the code is least exercised against
 *    - one endpoint deliberately unprobeable — 82% of real ones are, and that is the group that must
 *      never be reported as a defect
 */

export const REGISTRY = '0xC165A2AD2E540A4069E02834009161E2b4490d5A';
const RPC = 'https://testnet.rpc.intuition.systems/http';
const TYPE = 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1';

/**
 * `rig-confirmed` points at **ARP's own MCP server** (`scripts/arp-mcp-server.ts`).
 *
 * It borrowed a third party's endpoint until 2026-10-19, which made the gate's `confirmed` case
 * depend on somebody else's uptime. ARP now runs one, so the dependency is gone.
 *
 * The default is `localhost`, which is **honest about what it is**: a local fixture, meaningful to
 * whoever runs the verifier on the same machine and to nobody else. Set `ARP_MCP_ENDPOINT` to
 * regenerate the file against a public URL once one exists — the agents are ARP's own, so
 * `setAgentURI` can update them.
 *
 * **That escape hatch is a rehearsal prop**, and `portability.md` rule 4 — introduced by this same
 * task — says so: "any step that works because ARP can write to the registry is not a step." On
 * mainnet ARP owns no registry and cannot `setAgentURI`. The real fix is a public endpoint, not a
 * plan to amend the record later.
 */
export const OWN_ENDPOINT = process.env.ARP_MCP_ENDPOINT ?? 'http://localhost:3002/mcp';

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
        "Testnet rig agent. Declares ARP's own MCP server so the verifier's confirmed " +
        'path and its tools/list recovery both exercise with no dependency on a third ' +
        'party. The endpoint is local by default and says so: a fixture for whoever runs ' +
        'the verifier on the same machine, not a service anyone else can reach. Regenerate ' +
        'with ARP_MCP_ENDPOINT set once a public URL exists.',
      services: [
        {
          name: 'mcp',
          endpoint: OWN_ENDPOINT,
          version: '2024-11-05',
          capabilities: ['arp_tool_reputation'],
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
        'Testnet rig agent. Declares an MCP endpoint on 192.0.2.1, which RFC 5737 reserves ' +
        'for documentation and guarantees is never routable, so the connection always times ' +
        "out and the verifier's `confirmed/dead` path exercises. A timeout is an answer about " +
        'the agent: an endpoint that cannot respond in eight seconds is not serving callers. ' +
        'An earlier draft used a .invalid hostname, which fails DNS resolution instead — and ' +
        'Bun reports that identically to a broken local network, so the prober correctly ' +
        'returned inconclusive rather than dead. The fixture was wrong, not the prober.',
      services: [
        {
          name: 'mcp',
          endpoint: 'http://192.0.2.1/mcp',
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
