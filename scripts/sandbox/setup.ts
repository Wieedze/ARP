/** Build a Claude Code sandbox where an agent walks the whole ARP loop on testnet 13579.
 *
 *      bun run scripts/sandbox/setup.ts --funder 0xE596… --home /home/max            # dry
 *      bun run scripts/sandbox/setup.ts --funder 0xE596… --home /home/max --execute
 *
 *  What it leaves behind, and what the agent then does by itself in `~/arp-sandbox`:
 *
 *  ```
 *  1. a fresh wallet          key in ~/.arp-sandbox/agent.env, OUTSIDE the sandbox, mode 600
 *  2. funded                  0.1 tTRUST from --funder-key (default PRIVATE_KEY), checked
 *                             against --funder first
 *  3. an ERC-8004 identity    register() then setAgentURI() on ARP's testnet registry
 *  4. its identity atom       the subject every `uses` edge needs (ADR 0047)
 *  5. three skills            fetched through the content server, so each has a receipt and the
 *                             hook can name its atom (docs/tasks/31)
 *  6. the runtime             .claude/settings.json (the hook), .mcp.json (the MCP server),
 *                             CLAUDE.md (the loop), bin/arp-sign (the only thing that signs)
 *  ```
 *
 *  Each step is idempotent: state is kept in ~/.arp-sandbox/state.json, so a re-run picks up where
 *  the last one stopped. Testnet only, and every signature is one the user asked for (ADR `0037`):
 *  no key is printed, the funder's address is checked before it signs, and what landed is
 *  recorded in the state file.
 */
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import {
  createPublicClient,
  createWalletClient,
  formatEther,
  http,
  parseEther,
  parseEventLogs,
} from 'viem';
import type { Address, Hex } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

import { sendPlan, type SerialisedCall } from '../helpers/send-plan.js';

const REPO = resolve(import.meta.dir, '../..');
const CHAIN_ID = 13579;
const deployment = JSON.parse(readFileSync(join(REPO, 'data/deployments/13579.json'), 'utf8')) as {
  chain: { rpcUrl: string };
  arp: { identityRegistry: Address };
};
const RPC = process.env.INTUITION_TESTNET_RPC_URL ?? deployment.chain.rpcUrl;
const REGISTRY = deployment.arp.identityRegistry;

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}
// `--home` because this may run as root on the user's behalf, and the sandbox is theirs.
const BASE = arg('home') ?? homedir();
const HOME = join(BASE, 'arp-sandbox');
const SECRETS = join(BASE, '.arp-sandbox');
const KEY_FILE = join(SECRETS, 'agent.env');
const STATE_FILE = join(SECRETS, 'state.json');

const TRANSFER = [
  {
    type: 'event',
    name: 'Transfer',
    inputs: [
      { name: 'from', type: 'address', indexed: true },
      { name: 'to', type: 'address', indexed: true },
      { name: 'tokenId', type: 'uint256', indexed: true },
    ],
  },
] as const;

const FUND = parseEther('0.1');
const FUND_BELOW = parseEther('0.05');
const SKILLS = [
  'https://github.com/obra/superpowers?skill=brainstorming',
  'https://github.com/obra/superpowers?skill=writing-plans',
  'https://github.com/obra/superpowers?skill=systematic-debugging',
];

const execute = process.argv.includes('--execute');
const funder = arg('funder');
if (funder === undefined || !/^0x[0-9a-fA-F]{40}$/.test(funder)) {
  console.error('usage: --funder <the address PRIVATE_KEY must resolve to> [--execute]');
  process.exit(1);
}

type State = {
  agent?: Address;
  funded?: Hex;
  agentId?: string;
  uriSet?: boolean;
  identityAtom?: boolean;
};
const state: State = existsSync(STATE_FILE)
  ? (JSON.parse(readFileSync(STATE_FILE, 'utf8')) as State)
  : {};
function save(): void {
  mkdirSync(SECRETS, { recursive: true });
  writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`);
}

const step = (n: number, title: string) => console.log(`\n── ${n}. ${title}`);
const client = createPublicClient({ transport: http(RPC) });

// ── 1 ── the wallet ─────────────────────────────────────────────────────────────────────────────
step(1, 'a fresh wallet, its key outside the sandbox');
if (!existsSync(KEY_FILE)) {
  if (!execute) {
    console.log(`  would write a new key to ${KEY_FILE}`);
  } else {
    mkdirSync(SECRETS, { recursive: true, mode: 0o700 });
    writeFileSync(
      KEY_FILE,
      `SANDBOX_AGENT_KEY=${generatePrivateKey()}\nINTUITION_TESTNET_RPC_URL=${RPC}\n`,
      {
        mode: 0o600,
      },
    );
  }
}
let agentKey: Hex | undefined;
if (existsSync(KEY_FILE)) {
  chmodSync(KEY_FILE, 0o600);
  const line = readFileSync(KEY_FILE, 'utf8')
    .split('\n')
    .find((row) => row.startsWith('SANDBOX_AGENT_KEY='));
  // The file is written by this script with exactly this line; a hand-edited one is refused below.
  agentKey = line?.slice('SANDBOX_AGENT_KEY='.length).trim() as Hex | undefined;
  if (agentKey === undefined || !/^0x[0-9a-f]{64}$/i.test(agentKey)) {
    console.error(`  ${KEY_FILE} has no SANDBOX_AGENT_KEY line`);
    process.exit(1);
  }
  process.env.SANDBOX_AGENT_KEY = agentKey;
  state.agent = privateKeyToAccount(agentKey).address;
  save();
}
console.log(`  agent      ${state.agent ?? '(not yet generated)'}`);

// ── 2 ── funding ────────────────────────────────────────────────────────────────────────────────
step(2, `fund it with ${formatEther(FUND)} tTRUST`);
// Which env var holds the funding key. The repo .env holds several ARP testnet keys.
const funderKeyName = arg('funder-key') ?? 'PRIVATE_KEY';
const rawFunder = process.env[funderKeyName];
if (!rawFunder) {
  console.error(`  ${funderKeyName} is not set`);
  process.exit(1);
}
const funderAccount = privateKeyToAccount(
  (rawFunder.startsWith('0x') ? rawFunder : `0x${rawFunder}`) as Hex,
);
if (funderAccount.address.toLowerCase() !== funder.toLowerCase()) {
  console.error(
    `  REFUSED — ${funderKeyName} resolves to ${funderAccount.address}, not --funder ${funder}`,
  );
  process.exit(1);
}
if ((await client.getChainId()) !== CHAIN_ID) {
  console.error(`  REFUSED — the RPC is not chain ${CHAIN_ID}`);
  process.exit(1);
}
if (state.agent !== undefined) {
  const balance = await client.getBalance({ address: state.agent });
  console.log(`  balance    ${formatEther(balance)} tTRUST`);
  if (balance >= FUND_BELOW) {
    console.log('  enough — no transfer');
  } else if (!execute) {
    console.log(`  would send ${formatEther(FUND)} from ${funderAccount.address}`);
  } else {
    const wallet = createWalletClient({ account: funderAccount, transport: http(RPC) });
    const hash = await wallet.sendTransaction({ to: state.agent, value: FUND, chain: null });
    const receipt = await client.waitForTransactionReceipt({ hash });
    console.log(`  ${receipt.status}    ${hash}`);
    state.funded = hash;
    save();
  }
}

/** Plans with one of the repo's CLIs, which write a JSON plan and sign nothing. */
function plan(script: string, args: string[]): SerialisedCall[] {
  const out = join(SECRETS, `${script.replace(/\W+/g, '-')}.json`);
  const run = spawnSync('bun', ['run', join(REPO, 'scripts', script), ...args, '--json', out], {
    cwd: REPO,
    env: { ...process.env, ARP_TARGET: 'testnet' },
    encoding: 'utf8',
  });
  if (run.status !== 0) {
    console.error(run.stdout, run.stderr);
    process.exit(1);
  }
  return JSON.parse(readFileSync(out, 'utf8')) as SerialisedCall[];
}

async function send(calls: SerialisedCall[]): Promise<Hex[]> {
  const outcome = await sendPlan({
    calls,
    chainId: CHAIN_ID,
    rpcUrl: RPC,
    keyName: 'SANDBOX_AGENT_KEY',
    execute,
  });
  if (outcome.status === 'refused') {
    console.error(`  REFUSED — ${outcome.reason}`);
    process.exit(1);
  }
  if (outcome.status === 'dry-run') {
    console.log(`  dry run: ${calls.length} call(s), ${formatEther(outcome.total)} tTRUST`);
    return [];
  }
  if (outcome.status === 'reverted') {
    console.error(`  REVERTED at call ${outcome.revertedAt}`);
    process.exit(1);
  }
  for (const hash of outcome.hashes) console.log(`  sent       ${hash}`);
  return outcome.hashes;
}

// ── 3 ── the ERC-8004 identity ──────────────────────────────────────────────────────────────────
step(3, `mint its ERC-8004 identity on ${REGISTRY}`);
if (state.agent !== undefined && state.agentId === undefined) {
  const [hash] = await send(
    plan('agent/register-agent.ts', ['--address', state.agent, '--name', 'ARP Sandbox Agent']),
  );
  if (hash !== undefined) {
    const receipt = await client.getTransactionReceipt({ hash });
    const transfers = parseEventLogs({ abi: TRANSFER, logs: receipt.logs });
    const minted = transfers.find(
      (log) => log.args.to.toLowerCase() === state.agent?.toLowerCase(),
    );
    if (minted === undefined) {
      console.error('  the mint landed but no Transfer to the agent was in it');
      process.exit(1);
    }
    state.agentId = minted.args.tokenId.toString();
    save();
  }
}
if (state.agentId !== undefined && state.uriSet !== true && state.agent !== undefined) {
  const hashes = await send(
    plan('agent/register-agent.ts', [
      '--address',
      state.agent,
      '--name',
      'ARP Sandbox Agent',
      '--agent-id',
      state.agentId,
    ]),
  );
  if (hashes.length > 0) {
    state.uriSet = true;
    save();
  }
}
console.log(`  agent id   ${state.agentId ?? '(not yet minted)'}`);

// ── 4 ── the identity atom ──────────────────────────────────────────────────────────────────────
step(4, 'its identity atom — the subject of every `uses` edge');
if (state.agentId !== undefined && state.identityAtom !== true) {
  const calls = plan('agent/agent-identity-atom.ts', [
    '--agent',
    `${CHAIN_ID}/${state.agentId}`,
    '--registry',
    REGISTRY,
  ]);
  if (calls.length === 0) {
    state.identityAtom = true;
    save();
    console.log('  already on chain');
  } else if ((await send(calls)).length > 0) {
    state.identityAtom = true;
    save();
  }
}

// ── 5 ── the sandbox itself ─────────────────────────────────────────────────────────────────────
step(5, `the sandbox at ${HOME}`);
for (const app of ['mcp', 'hook']) {
  const build = spawnSync('bun', ['run', 'build'], {
    cwd: join(REPO, 'apps', app),
    encoding: 'utf8',
  });
  if (build.status !== 0) {
    console.error(build.stderr);
    process.exit(1);
  }
}
// Absolute, so the sandbox works whatever PATH the runtime spawns its hooks and servers with.
const BUN = process.execPath;
const MCP = join(REPO, 'apps/mcp/dist/arp-server.js');
const FETCH = join(REPO, 'apps/mcp/dist/arp-fetch-skill.js');
const HOOK = join(REPO, 'apps/hook/dist/arp-hook.js');
const SESSION_LOG = join(REPO, 'apps/mcp/dist/arp-session-log.js');

const files: Record<string, string> = {
  '.mcp.json': JSON.stringify(
    {
      mcpServers: {
        arp: {
          command: BUN,
          args: [MCP],
          env: { ARP_TRANSPORT: 'stdio', ARP_TARGET: 'testnet', ARP_CHAIN_ID: String(CHAIN_ID) },
        },
      },
    },
    null,
    2,
  ),
  '.claude/settings.json': JSON.stringify(
    {
      enableAllProjectMcpServers: true,
      hooks: {
        // Both events, async, as task 33a wires it: a failed call reaches only the second.
        PostToolUse: [
          { matcher: '*', hooks: [{ type: 'command', command: `${BUN} ${HOOK}`, async: true }] },
        ],
        PostToolUseFailure: [
          { matcher: '*', hooks: [{ type: 'command', command: `${BUN} ${HOOK}`, async: true }] },
        ],
      },
      permissions: {
        // The agent signs through bin/arp-sign and never sees the key. These keep it that way.
        deny: [`Read(${SECRETS}/**)`, `Bash(cat ${SECRETS}:*)`, `Edit(${SECRETS}/**)`],
        allow: ['Bash(./bin/arp-sign:*)', 'Bash(./bin/arp-fetch-skill:*)', 'mcp__arp'],
      },
    },
    null,
    2,
  ),
  'bin/arp-sign': `#!/usr/bin/env bash
# Signs a plan the ARP MCP server prepared, with this agent's key, on testnet 13579 only.
#   ./bin/arp-sign <plan.json>            dry run: what would be sent, and the cost
#   ./bin/arp-sign <plan.json> --execute  send it
# The key is read from ${KEY_FILE} by the signer process and never printed.
set -euo pipefail
set -a; . "${KEY_FILE}"; set +a
exec "${BUN}" "${join(REPO, 'scripts/agent/agent-send-plan.ts')}" --chain ${CHAIN_ID} --plan "$1" --key SANDBOX_AGENT_KEY --log .arp/sent.jsonl "\${@:2}"
`,
  'bin/arp-activity': `#!/usr/bin/env bash
# The local activity feed: streams .arp/ to the web app's activity bar and /activity page.
# Read-only, 127.0.0.1 only. Leave it running in a terminal during a demo.
set -euo pipefail
exec "${BUN}" "${SESSION_LOG}" --serve --dir .arp "$@"
`,
  'bin/arp-fetch-skill': `#!/usr/bin/env bash
# Fetch a catalogued skill through ARP's content server and install it as a Claude Code skill.
# Needs the server: ./bin/arp-content-server in another terminal.
#   ./bin/arp-fetch-skill https://github.com/<owner>/<repo>?skill=<name>
# The request is signed with the agent's key (off-chain EIP-712, no spend), so the receipt names it.
set -euo pipefail
set -a; . "${KEY_FILE}"; set +a
name="\${1##*skill=}"
ARP_NODE=http://localhost:3002 ARP_AGENT_PRIVATE_KEY="$SANDBOX_AGENT_KEY" "${BUN}" "${FETCH}" "$1" --out ".claude/skills/$name/SKILL.md"
`,
  'bin/arp-content-server': `#!/usr/bin/env bash
# ARP's MCP server over HTTP, which also serves skill content with a signed receipt.
set -euo pipefail
PORT=3002 ARP_TARGET=testnet exec "${BUN}" "${MCP}"
`,
};

const claudeMd = `# ARP sandbox — an agent that declares what it actually used

You are agent **${state.agentId ?? '<not minted yet>'}** of ARP's ERC-8004 registry on Intuition
**testnet 13579** (\`${REGISTRY}\`). Your wallet is \`${state.agent ?? '<none>'}\`.
You hold no key: \`./bin/arp-sign\` signs for you. Never try to read \`${SECRETS}\`.

A runtime hook records every skill and MCP call you make in \`.arp/session.jsonl\`. You do not
write that file and you must not edit it — it is the evidence.

## The loop, after you finish the task you were given

1. \`mcp__arp__arp_identity\` with agent_chain_id ${CHAIN_ID}, agent_token_id "${state.agentId ?? ''}",
   registry "${REGISTRY}" — check you can declare.
2. \`mcp__arp__arp_declare_session\` with agent_chain_id ${CHAIN_ID}, agent_token_id
   "${state.agentId ?? ''}", registry "${REGISTRY}", declarer "${state.agent ?? ''}". It reads the hook's log and plans the
   \`(you, uses, tool)\` edges for what you invoked and it can name exactly.
3. Write the returned \`calls\` array to \`.arp/plan-declare.json\`, run \`./bin/arp-sign
   .arp/plan-declare.json\` (dry), show the cost, then run it again with \`--execute\`.
4. \`mcp__arp__arp_stake_on_used\` with receiver "${state.agent ?? ''}" and the triple ids from step 2,
   amount_wei "1000000000000000" (0.001 tTRUST) each. Same: write, dry run, \`--execute\`.
5. \`mcp__arp__arp_tool_reputation\` on each tool to read your position back as a stranger would.

Report what landed: the transaction hashes, the triple ids and your positions. If a step refuses,
report the refusal as it was written — do not work around it.
`;
files['CLAUDE.md'] = claudeMd;

if (!execute) {
  for (const path of Object.keys(files)) console.log(`  would write ${join(HOME, path)}`);
} else {
  for (const [path, content] of Object.entries(files)) {
    const full = join(HOME, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content.endsWith('\n') ? content : `${content}\n`);
    if (path.startsWith('bin/')) chmodSync(full, 0o755);
  }
  console.log(`  wrote ${Object.keys(files).length} files`);
}

// ── 6 ── the skills ─────────────────────────────────────────────────────────────────────────────
step(6, 'three catalogued skills, fetched with a receipt');
if (execute) {
  const server = Bun.spawn(['bun', MCP], {
    cwd: HOME,
    env: { ...process.env, PORT: '3002', ARP_TARGET: 'testnet' },
    stdout: 'ignore',
    stderr: 'ignore',
  });
  try {
    for (let i = 0; i < 40; i++) {
      const up = await fetch('http://localhost:3002/healthz')
        .then((r) => r.ok)
        .catch(() => false);
      if (up) break;
      await Bun.sleep(250);
    }
    for (const url of SKILLS) {
      const name = url.split('skill=')[1] ?? url;
      if (existsSync(join(HOME, '.claude/skills', name, 'SKILL.md'))) {
        console.log(`  ${name.padEnd(22)} already installed`);
        continue;
      }
      const run = spawnSync(join(HOME, 'bin/arp-fetch-skill'), [url], {
        cwd: HOME,
        encoding: 'utf8',
      });
      console.log(
        `  ${name.padEnd(22)} ${run.status === 0 ? 'installed, receipt kept' : `FAILED ${run.stderr.slice(0, 200)}`}`,
      );
    }
  } finally {
    server.kill();
  }
} else {
  for (const url of SKILLS) console.log(`  would fetch ${url}`);
}

// The sandbox belongs to the user who opens it, not to whoever ran this.
const owner = arg('owner');
if (execute && owner !== undefined) spawnSync('chown', ['-R', owner, HOME, SECRETS]);

console.log(`\nstate in ${STATE_FILE}`);
console.log(`next   cd ${HOME} && claude`);
