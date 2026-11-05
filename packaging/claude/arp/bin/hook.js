// ../hook/src/hook.ts
import { appendFileSync as appendFileSync2, existsSync as existsSync2, mkdirSync as mkdirSync3, readFileSync as readFileSync3, writeFileSync as writeFileSync2 } from "node:fs";
import { homedir as homedir3 } from "node:os";
import { dirname as dirname2, join as join4 } from "node:path";
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
  const host = url.hostname.replace(/\.+$/, "").replace(/^(?:www\.)+/, "");
  const path = url.pathname.replace(/(?:\.git|\/)+$/, "");
  const params = [...new URLSearchParams(url.search).entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  const query = params.length === 0 ? "" : `?${new URLSearchParams(params).toString()}`;
  const port = url.port === "" || url.port === "80" || url.port === "443" ? "" : `:${url.port}`;
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
// ../../packages/protocol/dist/skill-requires.js
var LOGIN = /\b(auth login|log ?in|sign ?up|api[ _-]?key|access token)\b/i;
function frontmatter(markdown) {
  const lines = markdown.split(`
`);
  if (lines[0]?.trim() !== "---")
    return { lines: [], bodyStart: 0 };
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  return end === -1 ? { lines: [], bodyStart: 0 } : { lines: lines.slice(1, end), bodyStart: end + 1 };
}
function unquote(value) {
  return value.trim().replace(/^["']|["']$/g, "");
}
function declaredBins(lines) {
  const at = lines.findIndex((line) => /^\s*bins\s*:/.test(line));
  if (at === -1)
    return [];
  const inline = lines[at]?.split(":").slice(1).join(":").trim() ?? "";
  if (inline.startsWith("[")) {
    return inline.replace(/^\[|\]$/g, "").split(",").map(unquote).filter((name) => name.length > 0);
  }
  const out = [];
  for (const line of lines.slice(at + 1)) {
    const item = /^\s*-\s*(.+)$/.exec(line);
    if (item === null)
      break;
    out.push(unquote(item[1] ?? ""));
  }
  return out.filter((name) => name.length > 0);
}
function bashTools(lines) {
  const line = lines.find((candidate) => /^\s*allowed-tools\s*:/.test(candidate));
  if (line === undefined)
    return [];
  return [...line.matchAll(/Bash\(\s*([A-Za-z0-9._-]+)/g)].map((match) => match[1] ?? "").filter((name) => name.length > 0);
}
function declaredDescription(lines) {
  const at = lines.findIndex((line) => /^description\s*:/.test(line));
  if (at === -1)
    return null;
  const inline = lines[at]?.split(":").slice(1).join(":").trim() ?? "";
  if (inline !== "" && !/^[>|][-+]?$/.test(inline))
    return unquote(inline) || null;
  const block = [];
  for (const line of lines.slice(at + 1)) {
    if (!/^\s+\S/.test(line))
      break;
    block.push(line.trim());
  }
  return block.length === 0 ? null : block.join(" ");
}
var COMMON = new Set(("awk bash break bun case cat cd chmod command continue cp curl cut date diff do done echo else end env " + "esac exit export false fi find for function git grep head if kill ln local ls mkdir mv node npm npx open pip pip3 pnpm printf pwd " + "python python3 read return rm sed set sh shift sleep sort source sudo tail tar tee test then time " + "touch tr true uniq unset unzip wait wc wget which while xargs yarn zip").split(" "));
var INSTALL = /\b(?:npm\s+(?:i|install)\s+(?:-g|--global)|pnpm\s+add\s+-g|yarn\s+global\s+add|brew\s+install|pipx\s+install|pip3?\s+install|cargo\s+install)\s+([@a-z0-9][@\w./-]*)/i;
var PROBE = /\b(?:command\s+-v|which)\s+([a-z][\w-]*)/i;
var COMMAND = /^[a-z][a-z0-9_-]*$/;
function commandsIn(shell, explicitOnly) {
  const found = [];
  for (const segment of shell.split(/&&|\|\||[|;]/)) {
    const line = segment.trim().replace(/^\$\s+/, "");
    if (line === "" || line.startsWith("#"))
      continue;
    const named = INSTALL.exec(line)?.[1] ?? PROBE.exec(line)?.[1];
    if (named !== undefined) {
      found.push(named);
      continue;
    }
    if (explicitOnly)
      continue;
    const words = line.split(/\s+/).filter((word) => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(word));
    const first = words[0] === "sudo" ? words[1] : words[0];
    if (first === undefined || !COMMAND.test(first))
      continue;
    found.push(first);
  }
  return found;
}
var SHELL_FENCE = /^(sh|bash|shell|zsh|console|terminal)$/i;
function shellLinesRun(lines) {
  const run = [];
  let heredocEnd = null;
  let quote = null;
  let continued = false;
  for (const line of lines) {
    if (heredocEnd !== null) {
      if (line.trim() === heredocEnd)
        heredocEnd = null;
      continue;
    }
    if (quote === null && !continued)
      run.push(line);
    continued = line.trimEnd().endsWith("\\");
    heredocEnd = /<<-?\s*['"]?([A-Za-z_]+)/.exec(line)?.[1] ?? null;
    for (const char of line) {
      if (quote === null && (char === '"' || char === "'"))
        quote = char;
      else if (char === quote)
        quote = null;
    }
  }
  return run;
}
function commandsRun(body, declared) {
  const found = [];
  let fence = null;
  let fenced = [];
  for (const line of body) {
    const marker = /^\s*(?:```|~~~)\s*([\w-]*)/.exec(line);
    if (marker !== null) {
      if (fence === "shell") {
        for (const run of shellLinesRun(fenced))
          found.push(...commandsIn(run, false));
      }
      fenced = [];
      fence = fence !== null ? null : SHELL_FENCE.test(marker[1] ?? "") ? "shell" : "other";
      continue;
    }
    if (fence !== null) {
      fenced.push(line);
      continue;
    }
    for (const inline of line.matchAll(/`([^`]+)`/g))
      found.push(...commandsIn(inline[1] ?? "", true));
  }
  return [...new Set(found)].filter((name) => !COMMON.has(name) && !declared.includes(name));
}
function requiresLine(lines) {
  const name = lines.map((line) => /^\s*requires\s*:\s*(\S+)\s*$/.exec(line)?.[1]).find(Boolean);
  return name === undefined ? [] : [unquote(name)];
}
function readRequires(markdown) {
  const { lines, bodyStart } = frontmatter(markdown);
  const cli = [...new Set([...declaredBins(lines), ...bashTools(lines), ...requiresLine(lines)])];
  const description = declaredDescription(lines);
  const body = markdown.split(`
`);
  const runs = commandsRun(body.slice(bodyStart), cli);
  for (let index = bodyStart;index < body.length; index += 1) {
    const text = body[index] ?? "";
    if (LOGIN.test(text)) {
      return { cli, runs, login: { line: index + 1, text: text.trim().slice(0, 160) }, description };
    }
  }
  return { cli, runs, login: null, description };
}
// ../../packages/protocol/dist/skill-domains.js
var SKILL_DOMAINS = [
  {
    domain: "payment",
    parent: "tool",
    words: ["payment", "stripe", "paypal", "invoice", "checkout", "billing", "paywall"]
  },
  {
    domain: "video",
    parent: "tool",
    words: ["video", "remotion", "hyperframes", "keyframe", "footage", "youtube"],
    nameWords: ["render", "caption", "motion", "title", "carousel", "cursor", "frame", "overlay", "shard", "animation", "avatar", "clip"]
  },
  {
    domain: "image",
    parent: "tool",
    words: ["image generation", "inpainting", "outpainting", "flux", "midjourney", "stable diffusion", "nano banana"],
    nameWords: ["image", "photo", "relight", "upscale", "thumbnail", "imagegen"]
  },
  {
    domain: "audio",
    parent: "tool",
    words: ["elevenlabs", "music generation", "text to speech", "voiceover", "sound effect", "instrumental"],
    nameWords: ["audio", "music", "voice", "speech", "sound"]
  },
  {
    domain: "document",
    parent: "tool",
    words: ["pptx", "docx", "xlsx", "powerpoint", "spreadsheet", ".potx", "pdf file"],
    nameWords: ["pdf", "docx", "pptx", "xlsx", "document", "slide", "markdown"]
  },
  {
    domain: "scraping",
    parent: "tool",
    words: ["scrap", "crawl", "firecrawl", "apify"],
    nameWords: ["extract", "scrape"]
  },
  {
    domain: "browser",
    parent: "tool",
    words: ["playwright", "puppeteer", "headless browser", "selenium"],
    nameWords: ["browser", "chrome"]
  },
  {
    domain: "database",
    parent: "tool",
    words: ["database", "postgres", "prisma", "supabase", "mongo", " sql"],
    nameWords: ["schema", "query", "migration", "sql"]
  },
  {
    domain: "design",
    parent: "tool",
    words: ["figma", "typograph", "design system", "design token"],
    nameWords: ["design", "ux", "colour", "color", "layout", "logo", "icon", "theme"]
  },
  {
    domain: "collaboration",
    parent: "tool",
    words: ["slack", "notion", "jira", "linear", "atlassian", "monday", "飞书", "obsidian"],
    nameWords: ["lark", "calendar", "whiteboard", "meeting"]
  },
  {
    domain: "marketing",
    parent: "tool",
    words: ["marketing", "seo", "campaign", "copywriting", "newsletter", "onboarding", "referral", "product hunt"],
    nameWords: ["cro", "launch", "photography", "signup", "popup", "ads", "audience", "growth", "brand"]
  },
  {
    domain: "blockchain",
    parent: "tool",
    words: ["blockchain", "onchain", "on-chain", "ethereum", "solidity", "web3", "smart contract", "erc-20", "erc-721"],
    nameWords: ["wallet", "crypto", "nft", "defi"]
  },
  {
    domain: "infrastructure",
    parent: "tool",
    words: ["deploy", "docker", "kubernetes", "terraform", "cloudflare", "aws", "azure", "serverless", "ci/cd", "firebase", "hosting", "vercel"],
    nameWords: ["infra", "cli"]
  },
  {
    domain: "observability",
    parent: "tool",
    words: ["observab", "logging", "grafana", "sentry", "telemetry"],
    nameWords: ["monitor", "metric", "trace", "alert", "log"]
  },
  {
    domain: "quality",
    parent: "tool",
    words: ["linting", "unit test", "code coverage", "static analysis"],
    nameWords: ["test", "lint", "review", "debug", "audit", "coverage", "quality", "refactor", "eval"]
  },
  {
    domain: "writing",
    parent: "tool",
    words: ["cold email", "pr body", "commit message", "conventional commits"],
    nameWords: ["writing", "write", "article", "prose", "caveman", "cave", "edit"]
  },
  {
    domain: "method",
    parent: "tool",
    words: ["handoff", "hand the current", "implementation plan", "subagent", "superpowers", "overbuilding", "chief of staff", "retrospective", "acceptance condition", "router over", "re-pitch"],
    nameWords: ["handoff", "triage", "retro", "brainstorm", "spec", "prd", "questionnaire", "plan", "implement", "dispatch", "execute", "executing", "investigate", "wayfinder", "decision", "teach", "verify", "verification", "authoring", "template", "zoom", "wait", "grill", "ask", "manage", "optimize", "worktree", "lean", "sensei", "help", "ticket", "issue"]
  },
  {
    domain: "website",
    parent: "tool",
    words: ["landing page", "static site", "next.js", "nextjs", "tailwind"],
    nameWords: ["website", "html", "css", "landing", "frontend", "react"]
  },
  {
    domain: "api",
    parent: "tool",
    words: ["rest api", "graphql", "webhook", "openapi", "postman"],
    nameWords: ["api", "endpoint", "rest"]
  },
  {
    domain: "automation",
    parent: "tool",
    words: ["zapier", "cron", "orchestrat"],
    nameWords: ["automation", "workflow", "schedule", "pipeline"]
  },
  {
    domain: "development",
    parent: "tool",
    words: ["typescript", "python", "rust ", "sdk"],
    nameWords: ["code", "compile", "library", "framework", "git"]
  }
];
function classifySkill(skill, description) {
  const name = ` ${skill.replace(/-/g, " ").toLowerCase()} `;
  const both = `${name}${description.toLowerCase()}`;
  const hit = SKILL_DOMAINS.find((rule) => rule.words.some((word) => both.includes(word)) || (rule.nameWords ?? []).some((word) => name.includes(` ${word}`)));
  return hit?.domain ?? null;
}
// ../../packages/protocol/dist/content-path.js
function skillRefFromUrl(url) {
  let parsed;
  try {
    parsed = new URL(url.includes("://") ? url : `https://${url}`);
  } catch {
    return null;
  }
  if (parsed.hostname.replace(/^www\./, "") !== "github.com")
    return null;
  const skill = parsed.searchParams.get("skill");
  if (skill === null || skill.length === 0)
    return null;
  const [owner, repo] = parsed.pathname.replace(/^\/+/, "").replace(/\/+$/, "").replace(/\.git$/, "").split("/");
  if (owner === undefined || repo === undefined)
    return null;
  if (owner.length === 0 || repo.length === 0)
    return null;
  return { repo: `${owner}/${repo}`, skill };
}

// ../../packages/protocol/dist/share-failures.js
function installedFromSkillLock(lock) {
  if (lock === null)
    return [];
  try {
    const parsed = JSON.parse(lock);
    return Object.entries(parsed.skills ?? {}).flatMap(([skill, entry]) => entry?.sourceType === "github" && typeof entry.source === "string" ? [{ skill, source: entry.source }] : []);
  } catch {
    return [];
  }
}
function installedFromReceipts(text) {
  const found = [];
  for (const line of (text ?? "").split(`
`)) {
    if (line.trim() === "")
      continue;
    try {
      const row = JSON.parse(line);
      const url = typeof row.url === "string" ? row.url : row.receipt?.url;
      const ref = typeof url === "string" ? skillRefFromUrl(url) : null;
      if (ref !== null)
        found.push({ skill: ref.skill, source: ref.repo });
    } catch {
      continue;
    }
  }
  return found;
}
// ../../packages/protocol/dist/pulse-score.js
function inferDomain(query, labels) {
  const words = ` ${query.toLowerCase().replace(/[^a-z0-9-]+/g, " ").trim()} `;
  const matches = labels.filter((label) => words.includes(` ${label.toLowerCase()} `));
  return [...matches].sort((a, b) => b.length - a.length)[0] ?? null;
}
// ../hook/src/classify.ts
var CANCELLED = /\b(interrupted|cancel(l)?ed|aborted) by (the )?user\b|\buser (rejected|denied|declined)\b|\bpermission denied by user\b|\buser doesn't want to (proceed|take this action)\b/i;
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
    cwd: str(raw.cwd),
    transcript: str(raw.transcript_path)
  };
}

// ../hook/src/skill-failure.ts
import { appendFileSync, existsSync, mkdirSync as mkdirSync2, readFileSync as readFileSync2 } from "node:fs";
import { homedir as homedir2 } from "node:os";
import { dirname, join as join3 } from "node:path";
var MISSING_KEY = /\b(api[ _-]?key|access[ _-]?token|credentials?)\b.{0,40}\b(missing|not set|not found|required|invalid|expired)\b|(?<!\bnot )\b(missing|no|invalid|expired)\b.{0,20}\b(api[ _-]?key|access[ _-]?token|credentials?)\b|\b(HTTP|status)(\/[\d.]+| code)?[ :=]*(401|403)\b|\b(401|403) (unauthori[sz]ed|forbidden)\b|\bunauthori[sz]ed\b|not authenticated|not logged in/i;
var MISSING_KEY_VARIABLE = /\b[A-Z0-9_]*(API_KEY|TOKEN|SECRET)\b.{0,30}\b(not set|missing|required|unset)\b/;
var MISSING_PROGRAM = /command not found|executable file not found|\bnot installed\b|No module named|spawn \S+ ENOENT|Cannot find module/i;
var MISSING_FILE = /No such file or directory|\bENOENT\b|file not found|\b(file|path|directory|folder)\b(?!\.).{0,80}\bdoes not exist\b/i;
function failureReason(text) {
  if (MISSING_PROGRAM.test(text))
    return "missing-program";
  if (MISSING_KEY.test(text) || MISSING_KEY_VARIABLE.test(text))
    return "missing-key";
  if (MISSING_FILE.test(text))
    return "missing-file";
  return null;
}
var RUNNERS = new Set(["bash", "bun", "bunx", "node", "npx", "python", "python3", "sh", "uv", "uvx", "zsh"]);
function programsOf(command) {
  const found = [];
  for (const part of command.split(/&&|\|\||[;|\n]/)) {
    const words = part.trim().split(/\s+/).filter((word) => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(word));
    const first2 = words[0];
    if (first2 === undefined || first2 === "")
      continue;
    const program = first2.split("/").pop() ?? first2;
    if (!RUNNERS.has(program)) {
      found.push(program);
      continue;
    }
    const target = words.slice(1).find((word) => !word.startsWith("-") && word !== "run");
    if (target !== undefined)
      found.push(target.split("/").pop() ?? target);
  }
  return found;
}
var escaped = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function askedBySkill(command, markdown, directory) {
  if (new RegExp(`${escaped(directory)}(?=[/\\s'"]|$)`).test(command))
    return true;
  const { cli, runs } = readRequires(markdown);
  const named = new Set([...cli, ...runs]);
  return programsOf(command).some((program) => named.has(program) || program.includes(".") && new RegExp(`(?:^|[\\s\`'"/(])${escaped(program)}(?=[\\s\`'")]|$)`, "m").test(markdown));
}
var DOMAIN = /^[a-z0-9][a-z0-9-]*$/;
var DOMAINS = [...new Set(SKILL_DOMAINS.map((rule) => rule.domain))];
function lastUserWords(transcript) {
  let words = "";
  for (const line of transcript.split(`
`)) {
    if (!line.includes('"user"'))
      continue;
    try {
      const entry = JSON.parse(line);
      if (entry.type !== "user" || entry.isMeta === true)
        continue;
      const content = entry.message?.content;
      const text = typeof content === "string" ? content : Array.isArray(content) ? content.map((block) => block?.type === "text" && typeof block.text === "string" ? block.text : "").join(" ") : "";
      if (text.trim() !== "" && !text.trimStart().startsWith("<"))
        words = text;
    } catch {
      continue;
    }
  }
  return words;
}
function contextOf(words, skill, description) {
  return inferDomain(words, DOMAINS) ?? classifySkill(skill.split(":").pop() ?? skill, description ?? "");
}
function answerOf(response) {
  const blocks = Array.isArray(response) ? response : typeof response === "object" && response !== null && Array.isArray(response.content) ? response.content : [response];
  for (const block of blocks) {
    const text = typeof block === "string" ? block : block?.text;
    if (typeof text !== "string")
      continue;
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed === "object" && parsed !== null)
        return parsed;
    } catch {
      continue;
    }
  }
  return null;
}
var searchesPath = (cwd) => join3(dirname(process.env["ARP_SESSION_LOG"] ?? join3(cwd, ".arp", "session.jsonl")), "searches.jsonl");
function recordSearch(call, cwd) {
  if (call.session === null)
    return;
  const answer = answerOf(call.response);
  if (answer === null || !Array.isArray(answer["skills"]))
    return;
  const domain = typeof answer["domain"] === "string" && DOMAIN.test(answer["domain"]) ? answer["domain"] : null;
  const skills = answer["skills"].flatMap((row) => typeof row?.name === "string" && typeof row.source === "string" ? [{ name: row.name, source: row.source }] : []);
  if (skills.length === 0)
    return;
  try {
    const path = searchesPath(cwd);
    mkdirSync2(dirname(path), { recursive: true });
    appendFileSync(path, `${JSON.stringify({ session: call.session, domain, skills })}
`);
  } catch {}
}
function foundBySearch(cwd, session, skill) {
  const path = searchesPath(cwd);
  if (!existsSync(path))
    return null;
  const name = skill.split(":").pop() ?? skill;
  let found = null;
  for (const line of readFileSync2(path, "utf8").split(`
`)) {
    try {
      const row = JSON.parse(line);
      if (row.session !== session)
        continue;
      const hit = row.skills?.find((entry) => entry.name === name);
      if (hit !== undefined)
        found = { domain: typeof row.domain === "string" ? row.domain : null, source: hit.source };
    } catch {
      continue;
    }
  }
  return found;
}
var readIfThere = (path) => existsSync(path) ? readFileSync2(path, "utf8") : null;
function installedSource(name, cwd) {
  const known = [
    ...installedFromSkillLock(readIfThere(join3(homedir2(), ".agents", ".skill-lock.json"))),
    ...installedFromReceipts(readIfThere(join3(arpHome(), "receipts.jsonl"))),
    ...installedFromReceipts(readIfThere(join3(cwd, ".arp", "receipts.jsonl")))
  ];
  const sources = new Set(known.filter((entry) => entry.skill === name).map((entry) => entry.source));
  return sources.size === 1 ? [...sources][0] ?? null : null;
}
function skillsOfSession(log, session) {
  if (!existsSync(log))
    return [];
  const skills = [];
  for (const line of readFileSync2(log, "utf8").split(`
`)) {
    try {
      const row = JSON.parse(line);
      if (row["kind"] === "skill" && row["session"] === session && typeof row["name"] === "string") {
        skills.unshift({
          name: row["name"],
          source: typeof row["source"] === "string" ? row["source"] : null
        });
      }
    } catch {}
  }
  return skills;
}
function skillDirectory(name, cwd) {
  const roots = [join3(cwd, ".claude", "skills"), join3(homedir2(), ".claude", "skills")];
  const given = process.env["ARP_SKILLS_DIR"];
  if (given !== undefined && given !== "")
    roots.unshift(given);
  return roots.map((root) => join3(root, name)).find((dir) => existsSync(join3(dir, "SKILL.md"))) ?? null;
}
function arpHome() {
  const given = process.env["ARP_HOME"]?.trim();
  return given !== undefined && given !== "" ? given : join3(homedir2(), ".arp");
}
function appendFailure(line) {
  const path = join3(arpHome(), "failures.jsonl");
  const seen = existsSync(path) ? readFileSync2(path, "utf8") : "";
  const key = `"session":${JSON.stringify(line.session)},"skill":${JSON.stringify(line.skill)},`;
  if (seen.split(`
`).some((row) => row.includes(key) && row.includes(`"reason":"${line.reason}"`)))
    return false;
  mkdirSync2(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(line)}
`);
  return true;
}
function recordSkillFailure(call, cwd) {
  const classified = classifyCall(call);
  if (classified === null || classified.outcome === "ok" || call.session === null)
    return;
  const command = call.input?.["command"];
  if (typeof command !== "string")
    return;
  const reason = failureReason(failureText(call));
  if (reason === null)
    return;
  try {
    const log = process.env["ARP_SESSION_LOG"] ?? join3(cwd, ".arp", "session.jsonl");
    for (const skill of skillsOfSession(log, call.session)) {
      const directory = skillDirectory(skill.name, cwd);
      if (directory === null)
        continue;
      const markdown = readFileSync2(join3(directory, "SKILL.md"), "utf8");
      if (!askedBySkill(command, markdown, directory))
        continue;
      const search = foundBySearch(cwd, call.session, skill.name);
      const words = call.transcript !== null && existsSync(call.transcript) ? lastUserWords(readFileSync2(call.transcript, "utf8")) : "";
      const domain = search?.domain ?? contextOf(words, skill.name, readRequires(markdown).description);
      appendFailure({
        at: new Date().toISOString(),
        session: call.session,
        skill: skill.name,
        source: skill.source ?? search?.source ?? installedSource(skill.name.split(":").pop() ?? skill.name, cwd),
        ...domain === null ? {} : { domain },
        reason
      });
      return;
    }
  } catch {}
}

// ../hook/src/hook.ts
function fetchedRefs(cwd) {
  const path = process.env["ARP_RECEIPTS"] ?? join4(cwd, ".arp", "receipts.jsonl");
  if (!existsSync2(path))
    return [];
  let text;
  try {
    text = readFileSync3(path, "utf8");
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
  capture(parsed, join4(homedir3(), ".arp", "captures"));
var call = toolCallOf(parsed);
if (call === null)
  process.exit(0);
var cwd = call.cwd ?? process.cwd();
if (call.tool === "Bash") {
  recordSkillFailure(call, cwd);
  process.exit(0);
}
if (call.tool.endsWith("__arp_pulse"))
  recordSearch(call, cwd);
var what = whatOf(call, cwd, () => fetchedRefs(cwd));
if (what === null)
  process.exit(0);
var classified = classifyCall(call);
if (classified === null)
  process.exit(0);
var own = join4(cwd, ".arp");
var path = process.env["ARP_SESSION_LOG"] ?? join4(own, "session.jsonl");
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
  mkdirSync3(dirname2(path), { recursive: true });
  const ignore = join4(own, ".gitignore");
  if (dirname2(path) === own && !existsSync2(ignore))
    writeFileSync2(ignore, `*
`);
  appendFileSync2(path, `${JSON.stringify(line)}
`);
} catch {}
