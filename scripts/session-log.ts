/** Read a runtime's session log and name what it invoked.
 *
 *      bun run scripts/session-log.ts [--log .arp/session.jsonl]
 *
 *  A thin reader. The resolution lives in `@arp-protocol/core` (`src/session.ts`), where it is
 *  pure and tested — a function that decided what ARP asserts had no business importing a file
 *  path, and `scripts/` has no test harness to catch it if it did.
 */
import {readFileSync} from "node:fs";

import catalogue from "../catalogue/skills-13579.json";
import {parseSessionLog, resolveInvocations} from "../packages/protocol/src/session.js";

function arg(name: string): string | undefined {
    const index = process.argv.indexOf(`--${name}`);
    return index === -1 ? undefined : process.argv[index + 1];
}

const path = arg("log") ?? process.env["ARP_SESSION_LOG"] ?? ".arp/session.jsonl";
const log = parseSessionLog(readFileSync(path, "utf8"));
const rows = (catalogue as {skills: {repo: string; skill: string; url: string; atom: string | null}[]}).skills;
const resolved = resolveInvocations(log, rows);

console.log(`${log.length} invocation(s) in ${path}\n`);
for (const row of resolved) {
    if (row.status === "resolved") {
        console.log(`  RESOLVED   ${row.name.padEnd(30)} x${row.calls}  ${row.repo}`);
    } else if (row.status === "ambiguous") {
        console.log(
            `  AMBIGUOUS  ${row.name.padEnd(30)} x${row.calls}  ${row.candidates.length} repositories carry it`,
        );
        for (const candidate of row.candidates) console.log(`               ${candidate.repo}`);
    } else {
        console.log(`  UNKNOWN    ${row.name.padEnd(30)} x${row.calls}  (${row.kind})`);
    }
}

const ready = resolved.filter((row) => row.status === "resolved").length;
console.log(
    `\n${ready} ready to declare · ${resolved.length - ready} need a reference before they can be`,
);

// A module, not a global script — see the note in scripts/measure/predicate-objects.ts.
export {};
