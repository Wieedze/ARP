/** The whole loop from a need to a receipt, in one command.
 *
 *      # the MCP server has to be running: ARP_TARGET=testnet bun run apps/mcp/src/server.ts
 *      ARP_TARGET=testnet bun run scripts/demo-loop.ts --need image --agent 13579/6
 *      ARP_TARGET=testnet bun run scripts/demo-loop.ts --need image --agent 13579/6 --execute
 *
 *  Dry by default. `--execute` signs with `AGENT_PRIVATE_KEY`, read from the environment and never
 *  printed (ADR `0037`); the signer's address is printed first so it can be checked.
 *
 *  ## Why this exists beside `demo-adopt.ts`
 *
 *  `demo-adopt` walks identity → declare → stake, and it is the real path. But it is handed
 *  `--tool`, so the one thing it does not demonstrate is the thing the product is for: **an agent
 *  with a need, finding a tool it did not already know about.**
 *
 *  That step is the whole argument. Anyone can stake on a tool they were told to stake on.
 *
 *  So this asks the MCP server a real question over HTTP, prints the answer a third party would get for
 *  the same question, picks from it, and hands the result to `demo-adopt` — the real script, as a
 *  subprocess, rather than a second copy of the walk. A demo that reimplements the thing it
 *  demonstrates proves only that the demo works.
 *
 *  ## What a stranger can check afterwards, and how
 *
 *  Every step prints something reproducible without asking us:
 *
 *  ```
 *  the question      a domain in ARP's tree, which anyone can list
 *  the answer        arp_find_tools over HTTP — same call, same rows
 *  the choice        printed with its rank and why it ranked there
 *  the receipt       a triple id, derivable from the three atoms with no credential
 *  ```
 *
 *  The last one is the point: the proof is not that this script ran, it is that the edge is on
 *  chain and somebody else can read it.
 */
import {spawnSync} from "node:child_process";

import {toolAtomUri, normaliseToolUrl} from "../packages/protocol/src/declare/tool-thing.js";

function arg(name: string): string | undefined {
    const index = process.argv.indexOf(`--${name}`);
    return index === -1 ? undefined : process.argv[index + 1];
}

const need = arg("need");
const agent = arg("agent");
const execute = process.argv.includes("--execute");
const node = arg("node") ?? "http://localhost:3002/";
const stake = arg("stake") ?? "0.002";
const pick = Number(arg("pick") ?? 1);

if (need === undefined || agent === undefined) {
    console.error(
        "usage: --need <domain> --agent <chainId>/<tokenId> [--pick <n>] [--stake <TRUST>] [--node <url>] [--execute]\n" +
            "the MCP server must be running: ARP_TARGET=testnet bun run apps/mcp/src/server.ts",
    );
    process.exit(1);
}

const line = "─".repeat(72);
console.log(`need       ${need}`);
console.log(`agent      ${agent}`);
console.log(`node       ${node}`);
console.log(`mode       ${execute ? "EXECUTE — this signs" : "dry run"}\n`);

console.log(line);
console.log("1. The question, asked of the MCP server over HTTP\n");
console.log(`   arp_find_tools { domain: "${need}" }\n`);

type Found = {tool_atom_id: string; label: string | null; positions?: number};
const response = await fetch(node, {
    method: "POST",
    headers: {"content-type": "application/json"},
    body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {name: "arp_find_tools", arguments: {domain: need, limit: 8}},
    }),
    signal: AbortSignal.timeout(60_000),
});
if (!response.ok) {
    console.error(`   the MCP server answered ${response.status}. Is it running on ${node}?`);
    process.exit(1);
}
const body = (await response.json()) as {
    result?: {content?: {text?: string}[]};
    error?: {message?: string};
};
if (body.error !== undefined) {
    console.error(`   the MCP server refused: ${body.error.message}`);
    process.exit(1);
}
const text = body.result?.content?.[0]?.text;
if (text === undefined) {
    console.error("   the MCP server answered without content.");
    process.exit(1);
}
const answer = JSON.parse(text) as {
    domain?: string;
    domains_walked?: string[];
    domain_attestor?: string;
    tools?: Found[];
};
const found = answer.tools ?? [];

console.log(line);
console.log("2. The answer, which anybody asking the same question would get\n");
console.log(`   domains walked   ${(answer.domains_walked ?? []).join(" → ") || "—"}`);
console.log(`   read through     ${answer.domain_attestor ?? "—"}`);
console.log(`   ${found.length} tool(s)\n`);
found.forEach((tool, at) => {
    const mark = at + 1 === pick ? "→" : " ";
    console.log(`   ${mark} ${String(at + 1).padStart(2)}. ${tool.label ?? tool.tool_atom_id}`);
});

const chosen = found[pick - 1];
if (chosen === undefined || chosen.label === null || chosen.label === undefined) {
    console.error(`\n   nothing at position ${pick}, or it carries no label to derive a URI from.`);
    process.exit(1);
}

// The atom's URI is a pure function of its normalised URL (ADR `0054`), so this is recomputed
// rather than taken on trust — and the walk below checks the id it derives against the chain.
const uri = toolAtomUri(normaliseToolUrl(chosen.label));

console.log(`\n${line}`);
console.log("3. The choice, and the URI recomputed from it\n");
console.log(`   ${chosen.label}`);
console.log(`   ${uri}`);
console.log(`   atom ${chosen.tool_atom_id}`);
console.log(
    `\n   Nothing here was given to the agent. It asked for "${need}" and this is what came back.`,
);

console.log(`\n${line}`);
console.log("4. The walk: identity, declaration, stake — `demo-adopt.ts`, not a copy of it\n");

const walk = spawnSync(
    "bun",
    [
        "run",
        "scripts/demo-adopt.ts",
        "--agent",
        agent,
        "--tool",
        uri,
        "--stake",
        stake,
        ...(execute ? ["--execute"] : []),
    ],
    {stdio: "inherit", env: process.env},
);

process.exit(walk.status ?? 1);

// A module, not a global script — see the note in scripts/measure/predicate-objects.ts.
export {};
