/** Record what a session actually invoked, as the runtime sees it.
 *
 * Wire it as a `PostToolUse` hook, so it fires on **every** tool call whether or not the agent
 * meant it to:
 *
 * ```jsonc
 * // .claude/settings.json
 * {
 *   "hooks": {
 *     "PostToolUse": [
 *       {"matcher": "*", "hooks": [
 *         {"type": "command", "command": "bun run scripts/arp-session-hook.ts"}
 *       ]}
 *     ]
 *   }
 * }
 * ```
 *
 * ## Why this is not a nicer way of asking the agent
 *
 * Until now a declaration was composed: the agent decided what to say it had used, after the fact,
 * from memory. That is the agent's word about the agent, and ARP's whole argument is that such a
 * claim sits on the bottom rung.
 *
 * A hook is **configuration, not code the model runs**. It fires on the call, writes a line, and
 * the model never touches the line. The declaration that follows is not something the agent
 * composed; it is something it is stuck with.
 *
 * That is a structural difference, not a cryptographic one, and the distinction matters: this is
 * not proof that the tool did anything useful. It is the runtime's own record rather than the
 * model's recollection, which is one rung up and the one rung available without a TEE.
 *
 * ## What it records, and what it refuses to guess
 *
 * Only what the payload actually names:
 *
 * ```
 * Skill            the skill's own name, and its source when the runtime gives one
 * mcp__<server>__  the MCP server, which is the thing ARP catalogues
 * everything else  ignored. `Read`, `Bash` and `Edit` are not tools anybody registered
 * ```
 *
 * A skill name alone does **not** identify a tool: measured 2026-10-29, 104 of the catalogue's
 * distinct skill names are carried by more than one repository with byte-identical files, and 9
 * more by repositories whose files differ. So the source is written when it is there and left
 * empty when it is not, and `arp_declare_session` refuses to resolve the ambiguous ones rather
 * than picking.
 *
 * ## Where it writes
 *
 * `$ARP_SESSION_LOG`, or `.arp/session.jsonl` beside the working directory. One JSON object per
 * line, appended, never rewritten — a log a later step reads is a log nothing may edit.
 */
import {appendFileSync, mkdirSync} from "node:fs";
import {dirname, join} from "node:path";

type HookPayload = {
    session_id?: string;
    tool_name?: string;
    tool_input?: Record<string, unknown>;
    cwd?: string;
};

type Invocation = {
    at: string;
    session: string | null;
    kind: "skill" | "mcp";
    /** The skill's name, or the MCP server's. */
    name: string;
    /** Where the runtime says it came from, when it says. Never inferred. */
    source: string | null;
    /**
     * The tool's URL or its atom id, when either is in the payload.
     *
     * **This is what makes the record exact**, and a name never can: `product-photography` is
     * carried by six repositories with identical files, so a name resolves to six atoms or none.
     * An atom id is a pure function of a normalised URL (ADR `0054`), so the two are the same
     * information and either ends the ambiguity.
     *
     * Empty today, because a runtime hands a skill's name and not its origin. It fills the moment
     * ARP serves the content: the response carries the atom it is, the agent logs that, and
     * nothing has to be guessed. That is the part of "ARP as the access path" that is about
     * identification rather than about a business model.
     */
    ref: string | null;
};

function readString(from: Record<string, unknown> | undefined, key: string): string | null {
    const value = from?.[key];
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/** What this call invoked, or `null` for the calls nobody registers. */
function invocationOf(payload: HookPayload): Omit<Invocation, "at" | "session"> | null {
    const tool = payload.tool_name;
    if (typeof tool !== "string" || tool.length === 0) return null;

    if (tool === "Skill") {
        const name = readString(payload.tool_input, "skill");
        if (name === null) return null;
        // A plugin skill is `plugin:skill`; a directory-scoped one is `path:skill`. Both halves are
        // kept, because the half before the colon is the only thing that tells two skills with the
        // same name apart — and 104 names in the catalogue are carried by more than one repository.
        return {
            kind: "skill",
            name,
            source: readString(payload.tool_input, "source"),
            // Whatever the payload offers, in the order of exactness. A 0x id or a URL both
            // resolve to one atom; a name does not.
            ref:
                readString(payload.tool_input, "atom_id") ??
                readString(payload.tool_input, "tool_atom_id") ??
                readString(payload.tool_input, "url"),
        };
    }

    // `mcp__<server>__<tool>`. The server is what ARP catalogues; the tool within it is not.
    const mcp = /^mcp__([^_]+(?:_[^_]+)*?)__/.exec(tool);
    if (mcp?.[1] !== undefined) {
        return {
            kind: "mcp",
            name: mcp[1],
            source: null,
            ref: readString(payload.tool_input, "url"),
        };
    }

    return null;
}

let raw = "";
for await (const chunk of process.stdin) raw += chunk;

let payload: HookPayload;
try {
    payload = JSON.parse(raw) as HookPayload;
} catch {
    // A hook that throws on a payload it did not expect blocks the tool call it was watching.
    // Silence is the right failure here: the log loses a line, the session does not stop.
    process.exit(0);
}

const invocation = invocationOf(payload);
if (invocation === null) process.exit(0);

const path =
    process.env["ARP_SESSION_LOG"] ?? join(payload.cwd ?? process.cwd(), ".arp", "session.jsonl");

const line: Invocation = {
    at: new Date().toISOString(),
    session: readString(payload as Record<string, unknown>, "session_id"),
    ...invocation,
};

try {
    mkdirSync(dirname(path), {recursive: true});
    appendFileSync(path, `${JSON.stringify(line)}\n`);
} catch {
    // Same reason as above. A session must not fail because a record could not be kept.
}

// A module, not a global script — see the note in scripts/measure/predicate-objects.ts.
export {};
