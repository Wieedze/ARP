// ../hook/src/hook.ts
import { appendFileSync, existsSync, mkdirSync as mkdirSync2, readFileSync as readFileSync2, writeFileSync as writeFileSync2 } from "node:fs";
import { homedir as homedir2 } from "node:os";
import { dirname, join as join3 } from "node:path";
// ../../packages/protocol/dist/declare/tool-thing.js
class InvalidToolUrlError extends Error {
  input;
  constructor(input, why) {
    super(`${JSON.stringify(input)} is not a usable tool URL: ${why}`);
    this.name = "InvalidToolUrlError";
    this.input = input;
  }
}
function normaliseToolUrl(input) {
  const trimmed = input.trim();
  if (trimmed.length === 0)
    throw new InvalidToolUrlError(input, "empty");
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url;
  try {
    url = new URL(withScheme);
  } catch {
    throw new InvalidToolUrlError(input, "not parseable as a URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new InvalidToolUrlError(input, `scheme ${url.protocol} is not http or https`);
  }
  if (url.hostname.length === 0)
    throw new InvalidToolUrlError(input, "no host");
  const host = url.hostname.replace(/^www\./, "");
  const path = url.pathname === "/" ? "" : url.pathname.replace(/\/+$/, "");
  const params = [...new URLSearchParams(url.search).entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  const query = params.length === 0 ? "" : `?${new URLSearchParams(params).toString()}`;
  const port = url.port === "" || url.port === "80" ? "" : `:${url.port}`;
  return `https://${host}${port}${path}${query}`;
}
// ../../packages/protocol/dist/session.js
function refForInvocation(name, source, fetched) {
  const bare = name.includes(":") ? name.split(":").pop() ?? name : name;
  let matches = fetched.filter((row) => row.skill === bare);
  if (source !== null && matches.length > 1) {
    const narrowed = matches.filter((row) => source.includes(repoOf(row.url)));
    if (narrowed.length > 0)
      matches = narrowed;
  }
  const atoms = new Set(matches.map((row) => row.atom.toLowerCase()));
  if (atoms.size !== 1)
    return null;
  return matches[0]?.atom ?? null;
}
function repoOf(url) {
  const parts = /github\.com\/([^/?#]+)\/([^/?#]+)/.exec(url);
  return parts === null ? url : `${parts[1]}/${parts[2]}`;
}
// ../hook/src/classify.ts
var CANCELLED = /\b(interrupted|cancel(l)?ed|aborted) by (the )?user\b|\buser (rejected|denied|declined)\b|\bpermission denied by user\b/i;
var AUTH = /\b(unauthori[sz]ed|forbidden|invalid (api )?(key|token)|authentication|not authenticated|expired token)\b/i;
var TIMEOUT = /\b(timed? ?out|timeout|deadline exceeded|ETIMEDOUT)\b/i;
var UNREACHABLE = /\b(ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|EHOSTUNREACH|ENETUNREACH|getaddrinfo|certificate|TLS|SSL|socket hang up|connection refused|fetch failed)\b/i;
var PAYMENT = /\b(payment required|insufficient (funds|balance)|payment (failed|refused|rejected)|x402)\b/i;
var STATUS = /\b(40[123]|429|5\d\d)\b/;
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function failureText(call) {
  const parts = [];
  const push = (value) => {
    if (typeof value === "string")
      parts.push(value);
    else if (isRecord(value)) {
      for (const key of ["error", "message", "reason"]) {
        const text = value[key];
        if (typeof text === "string")
          parts.push(text);
      }
      if (Array.isArray(value.content)) {
        for (const item of value.content) {
          if (isRecord(item) && typeof item.text === "string")
            parts.push(item.text);
        }
      }
    }
  };
  push(call.error);
  push(call.response);
  return parts.join(`
`).slice(0, 4000);
}
function statusOf(call) {
  if (!isRecord(call.response))
    return null;
  for (const key of ["status", "statusCode", "status_code"]) {
    const value = call.response[key];
    if (typeof value === "number" && Number.isInteger(value))
      return value;
  }
  return null;
}
function flaggedError(response) {
  return isRecord(response) && (response.isError === true || response.is_error === true);
}
function classifyCall(call) {
  if (call.interrupted)
    return null;
  const failed = call.event === "PostToolUseFailure" || call.error !== null || flaggedError(call.response);
  const status = statusOf(call);
  if (!failed && (status === null || status < 400))
    return { outcome: "ok", code: null };
  const text = failureText(call);
  if (CANCELLED.test(text))
    return null;
  const found = STATUS.exec(text);
  const match = status ?? (found === null ? null : Number(found[0]));
  const code = match === null ? null : String(match);
  if (match === 402 || PAYMENT.test(text))
    return { outcome: "payment", code };
  if (match === 401 || match === 403 || AUTH.test(text))
    return { outcome: "auth", code };
  if (TIMEOUT.test(text))
    return { outcome: "timeout", code };
  if (UNREACHABLE.test(text))
    return { outcome: "unreachable", code };
  return { outcome: "tool_error", code };
}

// ../hook/src/mcp-config.ts
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
function isRecord2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return;
  }
}
function entryOf(raw) {
  if (!isRecord2(raw))
    return null;
  if (typeof raw.url === "string" && raw.url.length > 0)
    return { transport: "remote", url: raw.url };
  if (typeof raw.command === "string" && raw.command.length > 0) {
    const args = Array.isArray(raw.args) ? raw.args.filter((arg) => typeof arg === "string") : [];
    return { transport: "local", command: raw.command, args };
  }
  return null;
}
function collect(into, servers) {
  if (!isRecord2(servers))
    return;
  for (const [name, raw] of Object.entries(servers)) {
    const entry = entryOf(raw);
    if (entry !== null)
      into.set(name, entry);
  }
}
function readMcpServers({
  cwd,
  home = homedir()
}) {
  const servers = new Map;
  const user = readJson(join(home, ".claude.json"));
  if (isRecord2(user)) {
    collect(servers, user.mcpServers);
    if (isRecord2(user.projects)) {
      const project = user.projects[cwd];
      if (isRecord2(project))
        collect(servers, project.mcpServers);
    }
  }
  const shared = readJson(join(cwd, ".mcp.json"));
  if (isRecord2(shared))
    collect(servers, shared.mcpServers);
  return servers;
}
function packageArg(args) {
  const first = args.find((arg) => !arg.startsWith("-"));
  if (first === undefined)
    return null;
  const at = first.lastIndexOf("@");
  return at > 0 ? first.slice(0, at) : first;
}
var NPM_LAUNCHERS = new Set(["npx", "bunx", "pnpx"]);
var PYPI_LAUNCHERS = new Set(["uvx", "pipx"]);
var LOCALHOST = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
var SECRET_SEGMENT = /^(?=[A-Za-z0-9_-]*[A-Za-z])(?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]{24,}$/;
function credentialFree(url) {
  const segments = url.pathname.split("/").filter((segment) => segment.length > 0);
  const path = segments.some((segment) => SECRET_SEGMENT.test(segment)) ? "" : url.pathname;
  const port = url.port === "" ? "" : `:${url.port}`;
  return `${url.protocol}//${url.hostname}${port}${path}`;
}
function serverUrlOf(entry) {
  if (entry === undefined)
    return null;
  if (entry.transport === "remote") {
    try {
      const url = new URL(entry.url);
      if (url.protocol !== "https:" && url.protocol !== "http:")
        return null;
      return LOCALHOST.has(url.hostname) ? null : credentialFree(url);
    } catch {
      return null;
    }
  }
  const launcher = entry.command.split(/[\\/]/).pop() ?? entry.command;
  const args = launcher === "pipx" && entry.args[0] === "run" ? entry.args.slice(1) : entry.args;
  const pkg = packageArg(args);
  if (pkg === null || pkg.startsWith(".") || pkg.startsWith("/"))
    return null;
  if (NPM_LAUNCHERS.has(launcher))
    return `https://www.npmjs.com/package/${pkg}`;
  if (PYPI_LAUNCHERS.has(launcher))
    return `https://pypi.org/project/${pkg}`;
  return null;
}

// ../hook/src/capture.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { join as join2 } from "node:path";
var TOP_LEVEL_NAMES = new Set([
  "hook_event_name",
  "hookEventName",
  "tool_name",
  "toolName",
  "tool_use_id",
  "toolUseId",
  "session_id",
  "sessionId",
  "conversation_id",
  "generation_id",
  "turn_id",
  "model",
  "model_id",
  "permission_mode",
  "permissionMode",
  "timestamp",
  "mcp_server_name",
  "original_request_name"
]);
var URL_KEYS = new Set(["mcp_server_url", "server_url", "serverUrl", "url"]);
var IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]{0,39}$/;
var SECRET_SHAPED = /^(?=.*\d)(?=.*[A-Za-z]).{20,}$/;
function keyOf(key) {
  return IDENTIFIER.test(key) && !SECRET_SHAPED.test(key) ? key : `<key:${key.length}>`;
}
function hostOnly(value) {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.hostname}<rest:${value.length}>`;
  } catch {
    return `<string:${value.length}>`;
  }
}
function deep(value) {
  if (typeof value === "string")
    return `<string:${value.length}>`;
  if (typeof value === "number")
    return "<number>";
  if (Array.isArray(value))
    return value.map(deep);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [keyOf(key), deep(item)]));
  }
  return value;
}
function redact(payload) {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return deep(payload);
  }
  return Object.fromEntries(Object.entries(payload).map(([key, value]) => {
    if (typeof value === "string") {
      if (URL_KEYS.has(key))
        return [keyOf(key), hostOnly(value)];
      return [keyOf(key), TOP_LEVEL_NAMES.has(key) ? value : `<string:${value.length}>`];
    }
    if (typeof value === "number" || typeof value === "boolean" || value === null) {
      return [keyOf(key), value];
    }
    return [keyOf(key), deep(value)];
  }));
}
function capture(payload, dir, now = new Date) {
  try {
    const record = redact(payload);
    const event = typeof record === "object" && record !== null && !Array.isArray(record) ? Object.entries(record).find(([key]) => key === "hook_event_name" || key === "hookEventName")?.[1] : undefined;
    const name = `${now.toISOString().replace(/[:.]/g, "-")}-${String(event ?? "event").replace(/[^A-Za-z]/g, "")}.json`;
    mkdirSync(dir, { recursive: true });
    writeFileSync(join2(dir, name), `${JSON.stringify(record, null, 2)}
`);
  } catch {}
}

// ../hook/src/payload.ts
function isRecord3(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function str(value) {
  return typeof value === "string" && value.length > 0 ? value : null;
}
function ms(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
}
function first(raw, keys) {
  for (const key of keys)
    if (key in raw)
      return raw[key];
  return;
}
function toolCallOf(raw) {
  if (!isRecord3(raw))
    return null;
  const format = typeof raw.toolName === "string" && typeof raw.tool_name !== "string" ? "grok" : "claude";
  const camel = format === "grok";
  const tool = str(camel ? raw.toolName : raw.tool_name);
  if (tool === null)
    return null;
  const input = camel ? raw.toolInput : raw.tool_input;
  const responseKeys = camel ? ["toolResult", "tool_response"] : ["tool_response"];
  const hasResponse = responseKeys.some((key) => (key in raw) && raw[key] !== undefined);
  return {
    format,
    event: str(camel ? first(raw, ["hookEventName", "hook_event_name"]) : raw.hook_event_name),
    session: str(camel ? raw.sessionId : raw.session_id),
    id: str(camel ? raw.toolUseId : raw.tool_use_id),
    tool,
    input: isRecord3(input) ? input : undefined,
    hasResponse,
    response: hasResponse ? first(raw, responseKeys) : undefined,
    error: str(raw.error),
    interrupted: (camel ? first(raw, ["isInterrupt", "is_interrupt"]) : raw.is_interrupt) === true,
    ms: ms(camel ? first(raw, ["durationMs", "duration_ms"]) : raw.duration_ms),
    cwd: str(raw.cwd)
  };
}

// ../hook/src/hook.ts
function fetchedRefs(cwd) {
  const path = process.env["ARP_RECEIPTS"] ?? join3(cwd, ".arp", "receipts.jsonl");
  if (!existsSync(path))
    return [];
  let text;
  try {
    text = readFileSync2(path, "utf8");
  } catch {
    return [];
  }
  const rows = [];
  for (const line of text.split(`
`)) {
    if (line.trim().length === 0)
      continue;
    try {
      const row = JSON.parse(line);
      if (typeof row.skill !== "string" || typeof row.atom !== "string")
        continue;
      rows.push({
        skill: row.skill,
        atom: row.atom,
        url: typeof row.url === "string" ? row.url : "",
        at: typeof row.at === "string" ? row.at : ""
      });
    } catch {
      continue;
    }
  }
  return rows;
}
function responseOf(call, outcome) {
  if (!call.hasResponse)
    return null;
  const raw = call.response;
  let bytes = 0;
  try {
    bytes = typeof raw === "string" ? raw.length : JSON.stringify(raw)?.length ?? 0;
  } catch {
    bytes = 0;
  }
  return { answered: raw !== null, bytes, failed: outcome !== "ok" };
}
function readString(from, key) {
  const value = from?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}
function serverRef(server, cwd) {
  const url = serverUrlOf(readMcpServers({ cwd }).get(server));
  if (url === null)
    return null;
  try {
    return normaliseToolUrl(url);
  } catch {
    return null;
  }
}
function whatOf(call, cwd, fetched) {
  if (call.tool === "Skill") {
    const name = readString(call.input, "skill");
    if (name === null)
      return null;
    const source = readString(call.input, "source");
    return {
      kind: "skill",
      name,
      source,
      ref: readString(call.input, "atom_id") ?? readString(call.input, "tool_atom_id") ?? readString(call.input, "url") ?? refForInvocation(name, source, fetched())
    };
  }
  const mcp = /^mcp__([^_]+(?:_[^_]+)*?)__/.exec(call.tool);
  if (mcp?.[1] !== undefined) {
    return { kind: "mcp", name: mcp[1], source: null, ref: serverRef(mcp[1], cwd) };
  }
  return null;
}
var raw = "";
for await (const chunk of process.stdin)
  raw += chunk;
var parsed;
try {
  parsed = JSON.parse(raw);
} catch {
  process.exit(0);
}
if (process.argv.includes("--capture"))
  capture(parsed, join3(homedir2(), ".arp", "captures"));
var call = toolCallOf(parsed);
if (call === null)
  process.exit(0);
var cwd = call.cwd ?? process.cwd();
var what = whatOf(call, cwd, () => fetchedRefs(cwd));
if (what === null)
  process.exit(0);
var classified = classifyCall(call);
if (classified === null)
  process.exit(0);
var own = join3(cwd, ".arp");
var path = process.env["ARP_SESSION_LOG"] ?? join3(own, "session.jsonl");
var line = {
  at: new Date().toISOString(),
  session: call.session,
  call: call.id,
  format: call.format,
  ...what,
  outcome: classified.outcome,
  code: classified.code,
  ms: call.ms,
  response: responseOf(call, classified.outcome)
};
try {
  mkdirSync2(dirname(path), { recursive: true });
  const ignore = join3(own, ".gitignore");
  if (dirname(path) === own && !existsSync(ignore))
    writeFileSync2(ignore, `*
`);
  appendFileSync(path, `${JSON.stringify(line)}
`);
} catch {}
