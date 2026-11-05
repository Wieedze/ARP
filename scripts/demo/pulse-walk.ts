/** One real use, written the way an agent writes it: `uses`, a domain, an outcome. Testnet 13579 only.
 *
 *      bun run scripts/demo/pulse-walk.ts --agent 6 --key AGENT_PRIVATE_KEY --expect 0x906f… \
 *        --tool "https://github.com/owner/repo?skill=name" --domain video --outcome worked --note "…" --execute
 *
 *  Without `--execute` it reports the plan and spends nothing. The plan comes from a real MCP server,
 *  so this is what an agent is handed. `sendPlan` holds the guards and reads the key from the
 *  environment; it is never printed (ADR `0037`). The signer is checked against `--expect` first.
 *
 *  A declaration here says that this wallet paid to say so. Run it only for a use that happened, and
 *  say what happened in `--note`: a graph deletes nothing. Every run appends to
 *  `data/measurements/pulse-walk-<date>.jsonl`.
 */
import {spawn} from "node:child_process";
import {appendFileSync} from "node:fs";
import {privateKeyToAccount} from "viem/accounts";
import {getAddress, type Hex} from "viem";

import deployment from "../../data/deployments/13579.json";
import {RAW_KEY_CHAIN_ID, sendPlan, type SerialisedCall} from "../helpers/send-plan.ts";

function arg(name: string): string {
    const index = process.argv.indexOf(`--${name}`);
    const value = index === -1 ? undefined : process.argv[index + 1];
    if (value === undefined) throw new Error(`--${name} is required`);
    return value;
}

const agent = arg("agent");
const keyName = arg("key");
const expect = getAddress(arg("expect"));
const tool = arg("tool");
const domain = arg("domain");
const outcome = arg("outcome");
const note = arg("note");
const execute = process.argv.includes("--execute");

const key = process.env[keyName];
if (key === undefined || key === "") throw new Error(`${keyName} is not set`);
const signer = privateKeyToAccount((key.startsWith("0x") ? key : `0x${key}`) as Hex).address; // a key is hex
if (getAddress(signer) !== expect) throw new Error(`${keyName} signs as ${signer}, not ${expect}`);

const PORT = 3056;
const server = spawn("bun", ["run", "apps/mcp/src/server.ts"], {
    env: {PATH: process.env["PATH"], HOME: process.env["HOME"], ARP_TARGET: "testnet", ARP_NO_RECEIPTS: "1", PORT: String(PORT)},
    stdio: "ignore",
});

async function call(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    for (let attempt = 0; attempt < 40; attempt += 1) {
        try {
            const response = await fetch(`http://127.0.0.1:${PORT}/`, {
                method: "POST",
                headers: {"content-type": "application/json"},
                body: JSON.stringify({jsonrpc: "2.0", id: 1, method: "tools/call", params: {name, arguments: args}}),
            });
            const body = (await response.json()) as {
                result?: {content?: {text?: string}[]};
                error?: unknown;
            }; // checked on the next line
            const text = body.result?.content?.[0]?.text;
            if (text === undefined) throw new Error(`no answer: ${JSON.stringify(body).slice(0, 300)}`);
            return JSON.parse(text) as Record<string, unknown>; // the server's own JSON
        } catch (error) {
            if (error instanceof Error && error.message.startsWith("no answer")) throw error;
            await new Promise((done) => setTimeout(done, 500));
        }
    }
    throw new Error("the MCP server did not come up");
}

try {
    const plan = await call("arp_declare_used", {
        agent_chain_id: RAW_KEY_CHAIN_ID,
        agent_token_id: agent,
        registry: deployment.arp.identityRegistry,
        tools: [tool],
        domain,
        outcome,
    });
    const raw = plan["calls"] as {kind: string; chain_id: number; to: Hex; value_wei: string; data: Hex; why: string}[]; // the server's shape
    const calls: SerialisedCall[] = raw.map((entry) => ({
        kind: entry.kind,
        chainId: entry.chain_id,
        to: entry.to,
        value: entry.value_wei,
        data: entry.data,
        why: entry.why,
    }));
    console.log(`agent 13579/${agent}, signer ${signer}, ${calls.length} calls`);
    for (const entry of calls) console.log(`  ${entry.kind} ${entry.value} ${entry.why.slice(0, 90)}`);
    const result = await sendPlan({
        calls,
        chainId: RAW_KEY_CHAIN_ID,
        rpcUrl: deployment.chain.rpcUrl,
        keyName,
        execute,
    });
    console.log(JSON.stringify(result, (_key, value) => (typeof value === "bigint" ? value.toString() : value)));
    if (execute) {
        const date = new Date().toISOString().slice(0, 10);
        appendFileSync(
            `data/measurements/pulse-walk-${date}.jsonl`,
            `${JSON.stringify({at: new Date().toISOString(), agent: `13579/${agent}`, signer, tool, domain, outcome, note, tripleId: (plan["tools"] as {triple_id: string}[])[0]?.triple_id, result}, (_key, value) => (typeof value === "bigint" ? value.toString() : value))}\n`,
        );
    }
} finally {
    server.kill();
}
