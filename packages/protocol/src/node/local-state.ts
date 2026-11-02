/**
 * What the processes an operator runs on their own machine share: where their state lives, how a
 * key file is read, how a ledger file is held, and how a loopback HTTP listener refuses a request
 * that did not come from this machine (ADR `0116`).
 *
 * The sponsoring service, the agent node and the MCP server each had their own version of every
 * one of these, and they disagreed: four key loaders with four policies, three ledgers resolved
 * against the working directory, one Host check in three listeners. One copy here, behind
 * `@arp-protocol/core/node`, because ADR `0082` puts what the apps share in this package.
 */
import {
    appendFileSync,
    chmodSync,
    closeSync,
    existsSync,
    mkdirSync,
    openSync,
    readFileSync,
    statSync,
    unlinkSync,
    writeFileSync,
    writeSync,
} from "node:fs";
import {homedir} from "node:os";
import {dirname, join, resolve} from "node:path";

import {generatePrivateKey} from "viem/accounts";
import type {Hex} from "viem";

/** Reads `ARP_HOME`. `process.env` is one. */
type Env = Readonly<Record<string, string | undefined>>;

/**
 * Where every program here keeps its state: `ARP_HOME`, else `~/.arp`.
 *
 * Never the working directory. A ledger resolved against the directory a process was started in is
 * an empty ledger in any other directory, so a restart elsewhere replays every payment it had
 * recorded; a key resolved that way is a different key, and so a different signer.
 */
export function arpHome(env: Env = process.env, home: string = homedir()): string {
    const configured = env["ARP_HOME"]?.trim();
    return configured !== undefined && configured !== "" ? configured : join(home, ".arp");
}

/** A state file found where an older version kept it, and not yet where this one looks. */
export class MovedStateError extends Error {
    constructor(
        readonly legacy: string,
        readonly current: string,
    ) {
        super(
            `${legacy} exists but ${current} does not. State now lives under ~/.arp (or ARP_HOME), ` +
                `not the working directory. Move it before starting: mv ${legacy} ${current}`,
        );
        this.name = "MovedStateError";
    }
}

/**
 * Refuse to start on an empty state when the old one is still in the working directory.
 *
 * Not moved silently: a ledger or a key is the operator's, and moving it is a decision about which
 * copy is the real one that this process cannot make. Starting with an empty ledger instead would
 * accept every payment the old one had spent.
 */
export function refuseMovedState(legacy: string, current: string): void {
    if (resolve(legacy) === resolve(current)) return;
    if (existsSync(legacy) && !existsSync(current)) throw new MovedStateError(legacy, current);
}

export class KeyFileError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "KeyFileError";
    }
}

const PRIVATE_KEY = /^0x[0-9a-fA-F]{64}$/;

type KeyFileOptions = {platform?: NodeJS.Platform};

/**
 * The private key in `path`. **One policy for every key ARP's programs hold**, the rule `ssh`
 * applies: the file is refused when anyone but its owner can read or write it, and the mode is
 * checked before it is read, so a key left world-readable is never loaded. Windows has no POSIX
 * mode, so the check is skipped there. The error never includes the file's content.
 */
export function readKeyFile(path: string, options: KeyFileOptions = {}): Hex {
    const stat = statSync(path);
    if (!stat.isFile()) throw new KeyFileError(`${path} is not a file`);
    if ((options.platform ?? process.platform) !== "win32" && (stat.mode & 0o077) !== 0) {
        throw new KeyFileError(
            `${path} has mode ${(stat.mode & 0o777).toString(8)}; it must be 600 (chmod 600 ${path})`,
        );
    }
    const raw = readFileSync(path, "utf8").trim();
    const key = raw.startsWith("0x") ? raw : `0x${raw}`;
    if (!PRIVATE_KEY.test(key)) throw new KeyFileError(`${path} does not hold a 32-byte hex private key`);
    return key as Hex; // The regex above is the 0x + 64 hex check `Hex` stands for.
}

/**
 * {@link readKeyFile}, or a new key created at `path` with mode 0600 in a 0700 directory when there
 * is none. `wx` refuses to overwrite a file that appeared since the check.
 */
export function loadOrCreateKeyFile(
    path: string,
    options: KeyFileOptions & {generate?: () => Hex} = {},
): {key: Hex; created: boolean} {
    if (existsSync(path)) return {key: readKeyFile(path, options), created: false};
    const key = (options.generate ?? generatePrivateKey)();
    mkdirSync(dirname(path), {recursive: true, mode: 0o700});
    writeFileSync(path, `${key}\n`, {mode: 0o600, flag: "wx"});
    // The umask can narrow `mode` and never widen it; this makes it exactly 0600.
    if ((options.platform ?? process.platform) !== "win32") chmodSync(path, 0o600);
    return {key, created: true};
}

/** One JSON value per line, appended. The directory is created on the first write. */
export function appendJsonLine(path: string, value: unknown): void {
    mkdirSync(dirname(path), {recursive: true});
    appendFileSync(path, `${JSON.stringify(value)}\n`);
}

/**
 * Every whole line of a JSONL file, parsed, or nothing when it does not exist. A line that does not
 * parse is skipped: the half-written last line of a process that died mid-write.
 */
export function readJsonLines(path: string): unknown[] {
    if (!existsSync(path)) return [];
    const out: unknown[] = [];
    for (const line of readFileSync(path, "utf8").split("\n")) {
        if (line.trim().length === 0) continue;
        try {
            out.push(JSON.parse(line));
        } catch {
            continue;
        }
    }
    return out;
}

function alive(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    } catch (error) {
        // EPERM: the process exists and belongs to someone else.
        return (error as NodeJS.ErrnoException).code === "EPERM";
    }
}

/**
 * An exclusive hold on `path`, as `<path>.lock` holding this process's pid. A second process on the
 * same file is refused: two writers on one ledger each count only their own spends, so each would
 * let through what the other already spent. A lock whose process is gone is taken over.
 */
export function lockFile(path: string): {release(): void} {
    const lock = `${path}.lock`;
    mkdirSync(dirname(lock), {recursive: true});
    for (let attempt = 0; attempt < 2; attempt += 1) {
        let fd: number;
        try {
            fd = openSync(lock, "wx", 0o600);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
            const holder = Number(readFileSync(lock, "utf8").trim());
            if (Number.isInteger(holder) && holder > 0 && alive(holder)) {
                throw new Error(`${path} is held by process ${holder} (${lock}); one process per ledger`);
            }
            unlinkSync(lock);
            continue;
        }
        writeSync(fd, `${process.pid}\n`);
        closeSync(fd);
        let held = true;
        const release = () => {
            if (!held) return;
            held = false;
            try {
                if (readFileSync(lock, "utf8").trim() === String(process.pid)) unlinkSync(lock);
            } catch {
                // Already removed by hand: nothing left to release.
            }
        };
        process.once("exit", release);
        return {release};
    }
    throw new Error(`${lock} could not be taken`);
}

/** `JSON.stringify`'s replacer for a body that carries bigints: each one as its decimal string. */
export function bigintSafe(_key: string, inner: unknown): unknown {
    return typeof inner === "bigint" ? inner.toString() : inner;
}

/** A JSON response, bigints as decimal strings. */
export function jsonResponse(value: unknown, status = 200): Response {
    return new Response(JSON.stringify(value, bigintSafe, 2), {
        status,
        headers: {"content-type": "application/json"},
    });
}

/** An ERC-8004 registry as an agent's registration file names it: `eip155:<chainId>:<address>`. */
export const ERC8004_REGISTRY_REF = /^eip155:([1-9][0-9]*):(0x[0-9a-fA-F]{40})$/;

/** The `Host` values a listener on loopback `port` answers to. */
export function loopbackHosts(port: number): string[] {
    return [`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`];
}

export type LocalRequestPolicy = {
    /** Accepted `Host` headers, `host:port`, compared case-insensitively. */
    hosts: readonly string[];
    /** Browser origins allowed to call. A request with any other `Origin` is refused. */
    origins?: readonly string[];
};

/**
 * Whether a request reached a local listener from this machine, as a refusal or `null`.
 *
 * Three checks, because a loopback bind alone is not one:
 *
 * - **`Host`** must name this listener. A page whose own name is re-pointed at 127.0.0.1 (DNS
 *   rebinding) is same-origin with the listener and sends its own name here.
 * - **`Origin`**, when a browser sends one, must be allowed. A page on any site can POST to
 *   `http://127.0.0.1:<port>` and the browser sends it; CORS only hides the answer.
 * - **A `POST` body is `application/json`.** A form or a `text/plain` fetch is a "simple" request a
 *   browser sends cross-origin without asking; a JSON content type forces a preflight, which this
 *   listener never answers.
 */
export function refuseForeignRequest(request: Request, policy: LocalRequestPolicy): Response | null {
    const host = (request.headers.get("host") ?? "").toLowerCase();
    if (!policy.hosts.some((allowed) => allowed.toLowerCase() === host)) {
        return jsonResponse({error: "this service answers to its own host only"}, 403);
    }
    const origin = request.headers.get("origin");
    if (origin !== null && !(policy.origins ?? []).includes(origin)) {
        return jsonResponse({error: `origin ${origin} is not allowed`}, 403);
    }
    if (request.method === "POST") {
        const type = (request.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase();
        if (type !== "application/json") {
            return jsonResponse({error: "content-type must be application/json"}, 415);
        }
    }
    return null;
}
