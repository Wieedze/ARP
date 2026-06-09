/**
 * demo.ts — one-command ARP hire demo (no manual steps, no address drift).
 *
 * Runs the requester flow against the agent-server, BOTH from the same
 * process env (the loaded .env). The runtime EOA the server holds and the
 * address the requester pays therefore can't diverge:
 * `test-agent-server.ts` asserts `/healthz` == its AGENT_PRIVATE_KEY before
 * it sends a single tTRUST, so a mismatched key fails loudly up front
 * instead of as a confusing "payment recipient does not match runtime"
 * rejection mid-run.
 *
 *     bun run demo                              # audits sample-contracts/Reentrant.sol
 *     bun run demo sample-contracts/Clean.sol   # any contract path
 *
 * Server lifecycle: if one is already listening on the port we REUSE it
 * (and leave it running); otherwise we spawn one and tear it down on exit
 * (always — even on Ctrl-C or failure). This makes the command safe to run
 * whether or not you already have `bun scripts/agent-server.ts` open.
 *
 * Note: `/run` runs a `claude` subprocess audit — expect it to take ~1 min.
 *
 * Prereqs (one-time, from the browser `/agent` flow) must already be in .env:
 *   PRIVATE_KEY, AGENT_PRIVATE_KEY, DELEGATION_COMPOSE_JSON
 * (+ optional AGENT_SERVER_PORT, AGENT_MIN_BUDGET_TTRUST, A2A vars).
 */
const PORT = Number(process.env.AGENT_SERVER_PORT ?? "3001");
const HEALTH_URL = `http://localhost:${PORT}/healthz`;
const BOOT_TIMEOUT_MS = 30_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isHealthy = () =>
    fetch(HEALTH_URL)
        .then((r) => r.ok)
        .catch(() => false);

// 0. Reuse a server that's already listening; only spawn our own when the
//    port is free (and then we own its teardown).
const alreadyUp = await isHealthy();

let server: ReturnType<typeof Bun.spawn> | null = null;
let serverExit: number | null = null;

if (alreadyUp) {
    console.log(`[demo] reusing agent-server already running on :${PORT}\n`);
} else {
    console.log(`[demo] starting agent-server on :${PORT}…\n`);
    server = Bun.spawn({
        cmd: ["bun", `${import.meta.dir}/agent-server.ts`],
        stdout: "inherit",
        stderr: "inherit",
        env: process.env,
    });
    server.exited.then((code) => {
        serverExit = code;
    });
}

let cleaned = false;
const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    // Only kill a server WE spawned — never one we reused.
    if (server && serverExit === null) server.kill();
};
process.on("SIGINT", () => {
    cleanup();
    process.exit(130);
});
process.on("SIGTERM", () => {
    cleanup();
    process.exit(143);
});
process.on("exit", cleanup);

async function waitForHealth(deadline: number): Promise<void> {
    while (Date.now() < deadline) {
        if (server && serverExit !== null) {
            throw new Error(
                `agent-server exited early (code ${serverExit}) — see its logs above (missing .env? compose delegation / runtime key mismatch? port already in use?)`,
            );
        }
        if (await isHealthy()) return;
        await sleep(500);
    }
    throw new Error(
        `agent-server did not become healthy on ${HEALTH_URL} within ${BOOT_TIMEOUT_MS / 1000}s`,
    );
}

try {
    // 1. Wait until the server answers /healthz (immediate when reused).
    if (!alreadyUp) {
        console.log(`\n[demo] waiting for ${HEALTH_URL}…`);
        await waitForHealth(Date.now() + BOOT_TIMEOUT_MS);
        console.log("[demo] server healthy");
    }
    console.log("[demo] running the requester flow (audit takes ~1 min)…\n");

    // 2. Run the requester: pay the runtime → POST /run → print the report,
    //    stakes and signed receipt. Forwards any contract-path arg.
    const client = Bun.spawn({
        cmd: [
            "bun",
            `${import.meta.dir}/test-agent-server.ts`,
            ...process.argv.slice(2),
        ],
        stdout: "inherit",
        stderr: "inherit",
        env: process.env,
    });
    const code = await client.exited;

    // 3. Tear down any server we spawned.
    cleanup();
    process.exit(code);
} catch (err) {
    console.error("\n[demo] failed:", err instanceof Error ? err.message : err);
    cleanup();
    process.exit(1);
}
