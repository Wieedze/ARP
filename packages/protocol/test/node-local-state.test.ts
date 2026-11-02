import {spawnSync} from "node:child_process";
import {chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";

import {afterEach, beforeEach, describe, expect, it} from "vitest";

import {
    appendJsonLine,
    arpHome,
    KeyFileError,
    loadOrCreateKeyFile,
    lockFile,
    loopbackHosts,
    MovedStateError,
    readJsonLines,
    readKeyFile,
    refuseForeignRequest,
    refuseMovedState,
    stateFile,
} from "../src/node/local-state.js";

// A fixed test value, not a key anyone holds.
const KEY = `0x${"11".repeat(32)}` as const;
const posix = process.platform !== "win32";

let dir: string;
beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "arp-local-state-"));
});
afterEach(() => {
    rmSync(dir, {recursive: true, force: true});
});

describe("arpHome", () => {
    it("is ARP_HOME when set, else ~/.arp, never the working directory", () => {
        expect(arpHome({ARP_HOME: "/srv/arp"}, "/home/x")).toBe("/srv/arp");
        expect(arpHome({ARP_HOME: "  "}, "/home/x")).toBe(join("/home/x", ".arp"));
        expect(arpHome({}, "/home/x")).toBe(join("/home/x", ".arp"));
    });
});

describe("refuseMovedState", () => {
    it("refuses an old file in the working directory when the new one is missing", () => {
        const legacy = join(dir, "old.jsonl");
        const current = join(dir, "home", "new.jsonl");
        expect(() => refuseMovedState(legacy, current)).not.toThrow();
        writeFileSync(legacy, "{}\n");
        expect(() => refuseMovedState(legacy, current)).toThrow(MovedStateError);
        expect(() => refuseMovedState(legacy, current)).toThrow(/mv /);
        mkdirSync(join(dir, "home"));
        writeFileSync(current, "{}\n");
        expect(() => refuseMovedState(legacy, current)).not.toThrow();
        expect(() => refuseMovedState(legacy, legacy)).not.toThrow();
    });
});

describe("stateFile", () => {
    it("is the override when set, else under the home, and refuses a copy left in the working directory", () => {
        const home = join(dir, "home");
        const cwd = join(dir, "work");
        const options = {env: {}, home, cwd};
        expect(stateFile("/x/ledger.jsonl", "ledger.jsonl", options)).toBe("/x/ledger.jsonl");
        expect(stateFile(undefined, "ledger.jsonl", options)).toBe(join(home, ".arp", "ledger.jsonl"));
        expect(stateFile(undefined, "ledger.jsonl", {...options, env: {ARP_HOME: join(dir, "h")}})).toBe(
            join(dir, "h", "ledger.jsonl"),
        );
        mkdirSync(join(cwd, ".arp"), {recursive: true});
        writeFileSync(join(cwd, ".arp", "ledger.jsonl"), "{}\n");
        expect(() => stateFile(undefined, "ledger.jsonl", options)).toThrow(MovedStateError);
        // An explicit override is the operator's choice, and is not second-guessed.
        expect(stateFile(join(cwd, ".arp", "ledger.jsonl"), "ledger.jsonl", options)).toBe(
            join(cwd, ".arp", "ledger.jsonl"),
        );
    });
});

describe("one key-file policy", () => {
    it.skipIf(!posix)("reads a 0600 file and refuses one anybody else can read", () => {
        const path = join(dir, "key");
        writeFileSync(path, `${"11".repeat(32)}\n`);
        chmodSync(path, 0o644);
        expect(() => readKeyFile(path)).toThrow(KeyFileError);
        chmodSync(path, 0o640);
        expect(() => readKeyFile(path)).toThrow(/chmod 600/);
        chmodSync(path, 0o600);
        expect(readKeyFile(path)).toBe(KEY);
        writeFileSync(path, "not a key");
        expect(() => readKeyFile(path)).toThrow(/32-byte/);
    });

    it.skipIf(!posix)("refuses a readable existing key rather than chmodding it", () => {
        const path = join(dir, "key");
        writeFileSync(path, `${KEY}\n`, {mode: 0o644});
        chmodSync(path, 0o644);
        expect(() => loadOrCreateKeyFile(path)).toThrow(KeyFileError);
        expect(statSync(path).mode & 0o777).toBe(0o644);
    });

    it("creates a key with mode 0600 in a 0700 directory, then reads the same one back", () => {
        const path = join(dir, "nested", "key");
        const made = loadOrCreateKeyFile(path, {generate: () => KEY});
        expect(made).toEqual({key: KEY, created: true});
        if (posix) {
            expect(statSync(path).mode & 0o777).toBe(0o600);
            expect(statSync(join(dir, "nested")).mode & 0o777).toBe(0o700);
        }
        expect(loadOrCreateKeyFile(path)).toEqual({key: KEY, created: false});
    });

    it("skips the mode check on Windows, which has none", () => {
        const path = join(dir, "key");
        writeFileSync(path, `${KEY}\n`);
        chmodSync(path, 0o644);
        expect(readKeyFile(path, {platform: "win32"})).toBe(KEY);
    });
});

describe("JSON lines", () => {
    it("appends, reads back and skips a torn last line", () => {
        const path = join(dir, "sub", "log.jsonl");
        expect(readJsonLines(path)).toEqual([]);
        appendJsonLine(path, {a: 1});
        appendJsonLine(path, {b: 2});
        writeFileSync(path, '{"c":', {flag: "a"});
        expect(readJsonLines(path)).toEqual([{a: 1}, {b: 2}]);
    });
});

describe("lockFile", () => {
    it("refuses a second holder while the first lives, and frees the file on release", () => {
        const path = join(dir, "ledger.jsonl");
        const first = lockFile(path);
        expect(() => lockFile(path)).toThrow(/held by process/);
        first.release();
        expect(existsSync(`${path}.lock`)).toBe(false);
        lockFile(path).release();
    });

    it("takes over a lock whose process is gone", () => {
        const path = join(dir, "ledger.jsonl");
        // A pid that existed and exited: the child below.
        const gone = spawnSync(process.execPath, ["-e", "process.exit(0)"]).pid;
        writeFileSync(`${path}.lock`, `${gone}\n`);
        lockFile(path).release();
    });
});

describe("refuseForeignRequest", () => {
    const policy = {hosts: loopbackHosts(3200), origins: ["http://localhost:5173"]};
    const post = (headers: Record<string, string>) =>
        new Request("http://127.0.0.1:3200/gas", {method: "POST", headers, body: "{}"});

    it("lets a JSON POST from this machine through", () => {
        expect(
            refuseForeignRequest(post({host: "127.0.0.1:3200", "content-type": "application/json"}), policy),
        ).toBeNull();
        expect(
            refuseForeignRequest(
                post({host: "localhost:3200", "content-type": "application/json; charset=utf-8"}),
                policy,
            ),
        ).toBeNull();
    });

    it("refuses a rebinding Host, a foreign Origin and a simple text/plain POST", () => {
        expect(
            refuseForeignRequest(post({host: "evil.example:3200", "content-type": "application/json"}), policy)
                ?.status,
        ).toBe(403);
        expect(refuseForeignRequest(post({"content-type": "application/json"}), policy)?.status).toBe(403);
        expect(
            refuseForeignRequest(
                post({host: "127.0.0.1:3200", origin: "https://evil.example", "content-type": "application/json"}),
                policy,
            )?.status,
        ).toBe(403);
        expect(
            refuseForeignRequest(post({host: "127.0.0.1:3200", "content-type": "text/plain"}), policy)?.status,
        ).toBe(415);
        expect(refuseForeignRequest(post({host: "127.0.0.1:3200"}), policy)?.status).toBe(415);
    });
});
