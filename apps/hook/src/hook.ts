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
 *         {"type": "command", "command": "bun /path/to/ARP/apps/hook/dist/arp-hook.js"}
 *       ]}
 *     ]
 *   }
 * }
 * ```
 *
 * The path is absolute because the hook runs in *your* project, not this one. Build the file once
 * with `cd apps/hook && bun run build`.
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
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { type FetchedRef, refForInvocation } from '@arp-protocol/core';

type HookPayload = {
  session_id?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  /**
   * What the tool gave back. A `PostToolUse` hook fires after the call, so the runtime passes
   * this — and it was ignored until 2026-10-30.
   *
   * **Its presence is the evidence the call went through**, which is what separates "the runtime
   * recorded an invocation" from "the tool actually did something". For a skill that is the whole
   * signal: a skill with a response was pulled into the context, not merely named. And it cannot
   * be composed after the fact — the hook writes it at the moment of the call.
   *
   * The shape varies by runtime, so it is read defensively and never required.
   */
  tool_response?: unknown;
  cwd?: string;
};

type Invocation = {
  at: string;
  session: string | null;
  kind: 'skill' | 'mcp';
  /** The skill's name, or the MCP server's. */
  name: string;
  /** Where the runtime says it came from, when it says. Never inferred. */
  source: string | null;
  /**
   * What came back, reduced to what is informative and safe to keep.
   *
   * ```
   * answered  the response existed at all — the call went through
   * bytes     its size, which separates "answered" from "answered something"
   * failed    whether the runtime marked it an error
   * ```
   *
   * **Never the content.** A tool's response can hold an API key, customer data or a file's
   * contents, and this log later feeds a declaration — writing it down is a leak waiting to
   * happen. A hash of it would buy nothing either: it depends on the arguments, so nobody else
   * can reproduce it, and it would prove only "something came back", which `bytes` already says.
   *
   * `null` when the runtime passed no response field, which is not the same as an empty one.
   */
  response: { answered: boolean; bytes: number; failed: boolean } | null;
  /**
   * The tool's URL or its atom id, when either is in the payload.
   *
   * **This is what makes the record exact**, and a name never can: `product-photography` is
   * carried by six repositories with identical files, so a name resolves to six atoms or none.
   * An atom id is a pure function of a normalised URL (ADR `0054`), so the two are the same
   * information and either ends the ambiguity.
   *
   * **Filled from `.arp/receipts.jsonl` since 2026-10-29**, which is where
   * `apps/mcp/src/fetch-skill.ts` records what was fetched through an MCP server. The fetch is the one
   * moment a skill's name and its atom are in the same place, so it writes both down and this
   * reads them back. `docs/tasks/31` deliverable 3.
   *
   * Still empty for a skill nobody fetched through an MCP server, and **still empty when two different
   * atoms were fetched under one name** — `refForInvocation` refuses a tie rather than taking
   * the most recent, because which one the agent then invoked is unknowable and a heuristic
   * there would write an edge about a repository it may never have touched.
   */
  ref: string | null;
};

/**
 * What was fetched through an MCP server, from the local record.
 *
 * Read fresh on every call rather than cached: a hook process is short-lived, and a fetch that
 * happened one tool call ago has to be visible to the next one. A missing or corrupt file is an
 * empty list — the hook's job is to keep a record, never to stop a session.
 */
function fetchedRefs(cwd: string): FetchedRef[] {
  const path = process.env['ARP_RECEIPTS'] ?? join(cwd, '.arp', 'receipts.jsonl');
  if (!existsSync(path)) return [];
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return [];
  }
  const rows: FetchedRef[] = [];
  for (const line of text.split('\n')) {
    if (line.trim().length === 0) continue;
    try {
      const row = JSON.parse(line) as Partial<FetchedRef>;
      if (typeof row.skill !== 'string' || typeof row.atom !== 'string') continue;
      rows.push({
        skill: row.skill,
        atom: row.atom,
        url: typeof row.url === 'string' ? row.url : '',
        at: typeof row.at === 'string' ? row.at : '',
      });
    } catch {
      // A half-written last line is the normal way this file ends while a session runs.
      continue;
    }
  }
  return rows;
}

/**
 * What came back, reduced to a boolean, a size and an error flag.
 *
 * Defensive about the shape because it varies by runtime: a string, an object with `content`, an
 * array of blocks. Rather than knowing each one, this measures the serialised form — which is
 * enough for "it answered" and "roughly how much", and keeps none of it.
 */
function responseOf(payload: HookPayload): Invocation['response'] {
  if (!('tool_response' in payload) || payload.tool_response === undefined) return null;
  const raw = payload.tool_response;
  let bytes = 0;
  try {
    bytes = typeof raw === 'string' ? raw.length : (JSON.stringify(raw)?.length ?? 0);
  } catch {
    // A circular response is still a response. The size is unknown, the fact is not.
    bytes = 0;
  }
  // The runtimes that mark an error do it with a boolean on the response object. Absent means
  // "not marked", never "succeeded" — this records what was said, not what is inferred.
  const failed =
    typeof raw === 'object' && raw !== null && 'is_error' in raw
      ? (raw as { is_error?: unknown }).is_error === true
      : false;
  return { answered: raw !== null, bytes, failed };
}

function readString(from: Record<string, unknown> | undefined, key: string): string | null {
  const value = from?.[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

/** What this call invoked, or `null` for the calls nobody registers. */
function invocationOf(
  payload: HookPayload,
  fetched: readonly FetchedRef[],
): Omit<Invocation, 'at' | 'session'> | null {
  const tool = payload.tool_name;
  if (typeof tool !== 'string' || tool.length === 0) return null;

  if (tool === 'Skill') {
    const name = readString(payload.tool_input, 'skill');
    if (name === null) return null;
    // A plugin skill is `plugin:skill`; a directory-scoped one is `path:skill`. Both halves are
    // kept, because the half before the colon is the only thing that tells two skills with the
    // same name apart — and 104 names in the catalogue are carried by more than one repository.
    const source = readString(payload.tool_input, 'source');
    return {
      kind: 'skill',
      name,
      source,
      response: responseOf(payload),
      // Whatever the payload offers, in the order of exactness, and then what the agent
      // actually fetched. A 0x id or a URL both resolve to one atom; a name does not.
      ref:
        readString(payload.tool_input, 'atom_id') ??
        readString(payload.tool_input, 'tool_atom_id') ??
        readString(payload.tool_input, 'url') ??
        refForInvocation(name, source, fetched),
    };
  }

  // `mcp__<server>__<tool>`. The server is what ARP catalogues; the tool within it is not.
  const mcp = /^mcp__([^_]+(?:_[^_]+)*?)__/.exec(tool);
  if (mcp?.[1] !== undefined) {
    return {
      kind: 'mcp',
      name: mcp[1],
      source: null,
      response: responseOf(payload),
      ref: readString(payload.tool_input, 'url'),
    };
  }

  return null;
}

let raw = '';
for await (const chunk of process.stdin) raw += chunk;

let payload: HookPayload;
try {
  payload = JSON.parse(raw) as HookPayload;
} catch {
  // A hook that throws on a payload it did not expect blocks the tool call it was watching.
  // Silence is the right failure here: the log loses a line, the session does not stop.
  process.exit(0);
}

const cwd = payload.cwd ?? process.cwd();
const invocation = invocationOf(payload, fetchedRefs(cwd));
if (invocation === null) process.exit(0);

const path = process.env['ARP_SESSION_LOG'] ?? join(cwd, '.arp', 'session.jsonl');

const line: Invocation = {
  at: new Date().toISOString(),
  session: readString(payload as Record<string, unknown>, 'session_id'),
  ...invocation,
};

try {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(line)}\n`);
} catch {
  // Same reason as above. A session must not fail because a record could not be kept.
}

// A module, not a global script — see the note in scripts/measure/predicate-objects.ts.
export {};
