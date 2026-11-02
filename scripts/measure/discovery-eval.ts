/** Does an agent consult ARP when it needs a tool, and does it spend less doing so? Task 45c.
 *
 *      (cd apps/cli && bun run build)
 *      bun run scripts/measure/discovery-eval.ts                       run, judge, summarise
 *      bun run scripts/measure/discovery-eval.ts --summarise <file>    summarise a past run only
 *
 *  Two suites (`--suite`):
 *  - `tools` (default, task 45c): does the agent consult ARP when it needs a tool, and at what cost.
 *  - `install` (task 52): needs the catalogue covers, asked by someone who wants Claude to do the
 *    job itself. Does the answer name an agent skill or an MCP server that exists? Every GitHub
 *    repository, npm package and pip package an answer names is looked up (`gh api`, the npm
 *    registry, PyPI), so a name that does not exist counts as invented. One that exists is a skill
 *    or an MCP server when ARP's catalogue holds it, when skills.sh lists skills from that
 *    repository, or when its name says `mcp`. Pass criteria, set by the user on 2026-11-02: the
 *    95% intervals of "names a skill or MCP server that exists" do not overlap, with ARP above,
 *    and ARP invents no more. Any installable that exists (a library such as Pillow) is printed
 *    beside it, so an answer that solves the need with libraries is visible rather than lost.
 *
 *  Flags: `--reps 3`, `--model sonnet`, `--judge-model opus`, `--jobs 4`, `--out <file.jsonl>`, and
 *  `--only id,id` to run a few prompts as a smoke test.
 *  An interrupted run resumes: records already in `--out` are not run again.
 *
 *  Spends money: each run is a real `claude -p` session, billed to whoever is logged in. Signs
 *  nothing and writes nothing on chain: the server runs with `ARP_TOOLS=read` on testnet 13579.
 *
 *  ## Two arms, one difference
 *
 *  Each prompt runs `--reps` times in each arm, from an empty directory, with no settings, hooks or
 *  CLAUDE.md of the user's (`--setting-sources ""`), and `WebSearch` and `WebFetch` as the only
 *  built-in tools. The `arp` arm adds ARP's MCP server; the `none` arm adds nothing. So what `none`
 *  measures is Claude finding tools by itself, which is what ARP is compared with.
 *
 *  Runs are shuffled so neither arm always runs on a warm cache. Tokens are counted cache or not
 *  (`total` below) because the cost in dollars depends on what was cached when.
 *
 *  ## Quality, because fewer tokens for a worse answer is not a saving
 *
 *  Each pair (same prompt, same rep) goes to a judge model that sees the question and two answers in
 *  a random order. The name "ARP" is replaced by "a registry" first. That is the only blinding there
 *  is: an answer citing a registry against one citing web pages can still be told apart. The judge
 *  cannot check that a named tool exists either; it reads the answers, not the web.
 *
 *  ## Pass criteria, set by the user before the run (2026-11-02)
 *
 *  - consulted, by majority of reps, on at least 10 of the 14 prompts that need a tool;
 *  - consulted on at most 1 of the 6 that do not;
 *  - a token saving is claimed only if the 95% interval of the ratio arp/none excludes 1 and the
 *    answers are not worse: the Wilson upper bound of ARP's loss rate, judged, is below one half.
 */
import { spawn, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

type Prompt = { id: string; needsTool: boolean; text: string };
type Arm = 'arp' | 'none';

type RunRecord = {
  kind: 'run';
  prompt: string;
  needsTool: boolean;
  arm: Arm;
  rep: number;
  consulted: boolean;
  toolCalls: string[];
  /** What each call asked, cut at 200 characters: the query is what decides what comes back. */
  toolInputs: string[];
  webSearches: number;
  tokens: { input: number; cacheCreation: number; cacheRead: number; output: number; total: number };
  costUsd: number;
  turns: number;
  isError: boolean;
  answer: string;
  /** Install suite only: every repository or package the answer names, and whether it exists. */
  refs?: Ref[];
};

/** `exists` is `null` when the lookup itself failed, which counts neither way. */
type Ref = { kind: 'github' | 'npm' | 'pip'; name: string; exists: boolean | null; agent?: boolean | null };

type Suite = 'tools' | 'install';

type JudgeRecord = {
  kind: 'judge';
  prompt: string;
  needsTool: boolean;
  rep: number;
  arpWas: 'A' | 'B';
  verdict: 'arp' | 'none' | 'tie' | 'invalid';
};

type MetaRecord = {
  kind: 'meta';
  date: string;
  commit: string;
  claude: string;
  model: string;
  judgeModel: string;
  reps: number;
  /** Absent in files written before task 52, which are all `tools`. */
  suite?: Suite;
};

type EvalRecord = RunRecord | JudgeRecord | MetaRecord;

/** Written as a person would ask, not as a developer: the tester this is for edits videos. */
const PROMPTS: readonly Prompt[] = [
  { id: 'youtube-edit', needsTool: true, text: 'I make YouTube videos and editing takes me hours. What tools could automate part of the editing?' },
  { id: 'gmail-replies', needsTool: true, text: 'I get a lot of repetitive emails in Gmail. How can I have replies drafted automatically?' },
  { id: 'thumbnails', needsTool: true, text: 'I want to generate thumbnails for my YouTube videos automatically. What can I use?' },
  { id: 'price-scraping', needsTool: true, text: 'I want to track the prices of a few products on an online shop every day. What tool could do that for me?' },
  { id: 'stripe', needsTool: true, text: 'I sell a course on my website and want to take card payments. What should I use to set that up?' },
  { id: 'podcast-transcribe', needsTool: true, text: 'I have an hour of podcast audio. How can I get a transcript of it?' },
  { id: 'slides', needsTool: true, text: 'I have rough notes for a talk. What can turn them into a slide deck?' },
  { id: 'social-schedule', needsTool: true, text: 'I want to schedule posts on Instagram and LinkedIn a week in advance. What tools can help?' },
  { id: 'postgres', needsTool: true, text: 'I want to ask questions about my Postgres database in plain English. What can connect an AI assistant to it?' },
  { id: 'product-photos', needsTool: true, text: 'I sell handmade jewelry and my product photos look amateur. What can make them look professional?' },
  { id: 'seo-posts', needsTool: true, text: 'I need to write blog posts that rank on Google. What tools can help me with SEO writing?' },
  { id: 'uptime', needsTool: true, text: 'I want to be alerted when my website goes down. What can monitor it?' },
  { id: 'subtitles', needsTool: true, text: 'I want to add translated subtitles to my videos in Spanish and French. What can do that?' },
  { id: 'notion-tasks', needsTool: true, text: 'I manage my tasks in Notion. Can an AI assistant read and update them, and with what?' },
  { id: 'closure', needsTool: false, text: 'Explain what a closure is in JavaScript, with a short example.' },
  { id: 'haiku', needsTool: false, text: 'Write a haiku about autumn rain.' },
  { id: 'off-by-one', needsTool: false, text: 'Why does this skip the last item? for (let i = 0; i < items.length - 1; i++) { print(items[i]) }' },
  { id: 'fahrenheit', needsTool: false, text: 'What is 72 degrees Fahrenheit in Celsius?' },
  { id: 'ww1', needsTool: false, text: 'Summarise the causes of the First World War in three sentences.' },
  { id: 'tcp-udp', needsTool: false, text: 'What is the difference between TCP and UDP, briefly?' },
];

const INSTALL_ASK = ' I use Claude. What can I install so that you can do it yourself?';

/**
 * Needs the catalogue has a skill for, checked with `arp_find_tools` on testnet 13579 on 2026-11-02
 * before the run. That is the scope of the claim: where ARP has something, does it find what
 * memory does not. It says nothing about needs ARP does not cover.
 */
const INSTALL_PROMPTS: readonly Prompt[] = [
  ['thumbnails', 'I need eye-catching thumbnails for my YouTube videos.'],
  ['product-photos', 'My product photos for my online shop look amateur and I want them to look professional.'],
  ['slides', 'I have notes for a talk and need them turned into a slide deck.'],
  ['video-editing', 'I want my raw video footage edited into a short, polished clip.'],
  ['captions', 'I want animated captions burned into my short videos.'],
  ['seo', 'I want my blog posts to rank better on Google.'],
  ['social-posts', 'I need a week of social media posts written for my small business.'],
  ['image-generation', 'I need original illustrations for my newsletter.'],
  ['pdf', 'I have to fill in and merge a bunch of PDF forms.'],
  ['logo', 'I need a logo for my new bakery.'],
  ['music', 'I need background music for my videos that I am allowed to use.'],
  ['voiceover', 'I want a voiceover for my explainer video without recording my own voice.'],
  ['landing-page', 'I need a landing page for my online course.'],
  ['website-video', 'I want a short promo video that shows off my website.'],
].map(([id, text]) => ({ id: id as string, needsTool: true, text: `${text as string}${INSTALL_ASK}` })); // pairs written above

function promptsOf(suite: Suite): readonly Prompt[] {
  return suite === 'install' ? INSTALL_PROMPTS : PROMPTS;
}

const ROOT = resolve(import.meta.dir, '..', '..');
const CLI = join(ROOT, 'apps', 'cli', 'dist', 'cli.js');
const RUN_TIMEOUT_MS = 300_000;

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

/** Deterministic, so a resumed run shuffles and orders A/B the same way. */
function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], random: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j] as T, items[i] as T]; // i and j are both below items.length
  }
  return items;
}

function claude(args: string[], cwd: string): Promise<string> {
  return new Promise((done) => {
    const child = spawn('claude', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (chunk: Buffer) => (out += chunk.toString()));
    const timer = setTimeout(() => child.kill('SIGTERM'), RUN_TIMEOUT_MS);
    child.on('close', () => {
      clearTimeout(timer);
      done(out);
    });
  });
}

/** The shapes this reads out of `--output-format stream-json`; everything else is ignored. */
type StreamLine = {
  type?: string;
  message?: { content?: { type?: string; name?: string; input?: unknown }[] };
  result?: string;
  is_error?: boolean;
  num_turns?: number;
  total_cost_usd?: number;
  usage?: { server_tool_use?: { web_search_requests?: number } };
  modelUsage?: Record<
    string,
    { inputTokens: number; outputTokens: number; cacheReadInputTokens: number; cacheCreationInputTokens: number }
  >;
};

async function runOne(prompt: Prompt, arm: Arm, rep: number, model: string, mcpConfig: string): Promise<RunRecord> {
  const cwd = mkdtempSync(join(tmpdir(), 'arp-eval-'));
  const args = [
    '-p', prompt.text,
    '--model', model,
    '--output-format', 'stream-json', '--verbose',
    '--setting-sources', '',
    '--strict-mcp-config',
    ...(arm === 'arp' ? ['--mcp-config', mcpConfig] : []),
    '--tools', 'WebSearch,WebFetch',
    '--allowedTools', arm === 'arp' ? 'WebSearch,WebFetch,mcp__arp' : 'WebSearch,WebFetch',
    '--no-session-persistence',
  ];
  const out = await claude(args, cwd);
  rmSync(cwd, { recursive: true, force: true });

  const toolCalls: string[] = [];
  const toolInputs: string[] = [];
  let result: StreamLine | undefined;
  for (const line of out.split('\n')) {
    if (line.trim() === '') continue;
    let parsed: StreamLine;
    try {
      parsed = JSON.parse(line) as StreamLine; // one stream-json event per line; shape checked field by field
    } catch {
      continue;
    }
    if (parsed.type === 'assistant')
      for (const block of parsed.message?.content ?? [])
        if (block.type === 'tool_use' && block.name !== undefined) {
          toolCalls.push(block.name);
          toolInputs.push(JSON.stringify(block.input ?? null).slice(0, 200));
        }
    if (parsed.type === 'result') result = parsed;
  }

  const tokens = { input: 0, cacheCreation: 0, cacheRead: 0, output: 0, total: 0 };
  for (const usage of Object.values(result?.modelUsage ?? {})) {
    tokens.input += usage.inputTokens;
    tokens.cacheCreation += usage.cacheCreationInputTokens;
    tokens.cacheRead += usage.cacheReadInputTokens;
    tokens.output += usage.outputTokens;
  }
  tokens.total = tokens.input + tokens.cacheCreation + tokens.cacheRead + tokens.output;
  return {
    kind: 'run',
    prompt: prompt.id,
    needsTool: prompt.needsTool,
    arm,
    rep,
    consulted: toolCalls.includes('mcp__arp__arp_find_tools'),
    toolCalls,
    toolInputs,
    webSearches: result?.usage?.server_tool_use?.web_search_requests ?? 0,
    tokens,
    costUsd: result?.total_cost_usd ?? 0,
    turns: result?.num_turns ?? 0,
    isError: result === undefined || result.is_error === true,
    answer: result?.result ?? '',
  };
}

async function judgeOne(
  prompt: Prompt,
  arp: RunRecord,
  none: RunRecord,
  model: string,
  random: () => number,
  suite: Suite,
): Promise<JudgeRecord> {
  const arpWas = random() < 0.5 ? 'A' : 'B';
  const blind = (text: string) => text.replace(/\bARP\b(\s+registry)?/gi, 'a registry');
  const [a, b] = arpWas === 'A' ? [arp.answer, none.answer] : [none.answer, arp.answer];
  const question = [
    ...(suite === 'install'
      ? [
          'Two assistants answered the same question. Judge which answer better tells the person what to install',
          'so the assistant can do the job itself: things that exist, fit the need and can be installed now, no',
          'padding. Do not favour either for where it looked things up.',
        ]
      : [
          'Two assistants answered the same question. Judge which answer helps the person more: tools that fit',
          'what they asked, enough to get started, no padding. Do not favour either for where it looked things up.',
        ]),
    '',
    `QUESTION:\n${prompt.text}`,
    '',
    `ANSWER A:\n${blind(a)}`,
    '',
    `ANSWER B:\n${blind(b)}`,
    '',
    'Reply with exactly one word: A, B, or TIE.',
  ].join('\n');
  const cwd = mkdtempSync(join(tmpdir(), 'arp-judge-'));
  const out = await claude(
    ['-p', question, '--model', model, '--output-format', 'json', '--setting-sources', '', '--strict-mcp-config', '--tools', '', '--no-session-persistence'],
    cwd,
  );
  rmSync(cwd, { recursive: true, force: true });
  let word = '';
  try {
    word = String((JSON.parse(out) as { result?: unknown }).result ?? '').trim().toUpperCase(); // `--output-format json` returns one object
  } catch {
    word = '';
  }
  const verdict: JudgeRecord['verdict'] = /^TIE\b/.test(word)
    ? 'tie'
    : /^A\b/.test(word)
      ? arpWas === 'A' ? 'arp' : 'none'
      : /^B\b/.test(word)
        ? arpWas === 'B' ? 'arp' : 'none'
        : 'invalid';
  return { kind: 'judge', prompt: prompt.id, needsTool: prompt.needsTool, rep: arp.rep, arpWas, verdict };
}

/** First segments that name a folder inside a repository, not an owner. */
const FOLDERS = new Set(['skills', 'src', 'docs', 'scripts', 'lib', 'bin', 'test', 'tests', 'examples', 'packages', 'apps', 'plugins', 'agents', 'commands']);

/**
 * Every GitHub repository, npm package and pip package an answer names, as written. It reads the
 * forms either arm uses: an answer built on ARP cites full GitHub URLs because ARP returns them,
 * and an answer from memory writes a bare `owner/repo`, `/plugin marketplace add` or `uvx`. Reading
 * only the first form undercounted the arm without ARP (task 52 §3).
 */
export function references(answer: string): { kind: Ref['kind']; name: string }[] {
  const found = new Map<string, { kind: Ref['kind']; name: string }>();
  const add = (kind: Ref['kind'], name: string) => {
    const clean = name.replace(/\.git$/, '').replace(/[.,;:)\]'"`]+$/, '');
    if (clean.split('/').every((part) => part !== '')) found.set(`${kind}:${clean.toLowerCase()}`, { kind, name: clean });
  };
  for (const m of answer.matchAll(/github\.com\/([\w.-]+)\/([\w.-]+)/g)) add('github', `${m[1]}/${m[2]}`);
  for (const m of answer.matchAll(/skills\.sh\/([\w.-]+)\/([\w.-]+)/g)) add('github', `${m[1]}/${m[2]}`);
  for (const m of answer.matchAll(/npx\s+(?:-y\s+)?skills(?:@[\w.-]+)?\s+add\s+([\w.-]+)\/([\w.-]+)/g)) add('github', `${m[1]}/${m[2]}`);
  for (const m of answer.matchAll(/\/plugin\s+marketplace\s+add\s+([\w.-]+)\/([\w.-]+)/g)) add('github', `${m[1]}/${m[2]}`);
  // A bare `owner/repo` in backticks, but not a file path: no extension, no leading `.`, `~` or `@`,
  // and not a folder inside a repository ("copy `skills/pptx` from anthropics/skills", task 52 §3).
  for (const m of answer.matchAll(/`([A-Za-z0-9][\w-]*)\/([A-Za-z0-9][\w-]*(?:\.js)?)`/g))
    if (!FOLDERS.has((m[1] ?? '').toLowerCase())) add('github', `${m[1]}/${m[2]}`);
  for (const m of answer.matchAll(/(?:uvx|uv\s+tool\s+install|pipx\s+run)\s+(?:--from\s+)?([A-Za-z][\w.-]*)/g)) add('pip', m[1] ?? '');
  for (const m of answer.matchAll(/(?:npx\s+(?:-y\s+)?|npm\s+(?:install|i)\s+(?:-g\s+)?)(@[\w.-]+\/[\w.-]+|[a-z][\w.-]*)/g))
    if (m[1] !== 'skills' && !m[1]?.startsWith('skills@')) add('npm', m[1] ?? '');
  // `pip install pillow rembg[gpu]`: every package on the line, extras and versions dropped.
  for (const m of answer.matchAll(/(?:pip3?|pipx|uv\s+pip)\s+install((?:\s+(?:-U|--upgrade|--user|-q)|\s+[A-Za-z][\w.-]*(?:\[[\w,.-]+\])?(?:[=<>!~]=?[\w.*]+)?)+)/g))
    for (const word of (m[1] ?? '').trim().split(/\s+/))
      if (!word.startsWith('-')) add('pip', word.replace(/\[.*$/, '').replace(/[=<>!~].*$/, ''));
  return [...found.values()];
}

const lookups = new Map<string, Promise<boolean | null>>();

/** Whether a repository or package exists. One lookup per name per run, shared by every answer. */
function exists(kind: Ref['kind'], name: string): Promise<boolean | null> {
  const key = `${kind}:${name.toLowerCase()}`;
  const known = lookups.get(key);
  if (known !== undefined) return known;
  const lookup =
    kind === 'github'
      ? new Promise<boolean | null>((done) => {
          const child = spawn('gh', ['api', `repos/${name}`, '--silent'], { stdio: ['ignore', 'ignore', 'pipe'] });
          let err = '';
          child.stderr.on('data', (chunk: Buffer) => (err += chunk.toString()));
          child.on('close', (code) => done(code === 0 ? true : /Not Found|404/.test(err) ? false : null));
        })
      : fetch(kind === 'npm' ? `https://registry.npmjs.org/${name.replace('/', '%2f')}` : `https://pypi.org/pypi/${name}/json`).then(
          (res) => (res.status === 200 ? true : res.status === 404 ? false : null),
          () => null,
        );
  lookups.set(key, lookup);
  return lookup;
}

/** Every repository and package ARP's catalogue names, lowercased: it is what ARP could answer with. */
let catalogue: string | undefined;
function catalogueText(): string {
  catalogue ??= ['tools.json', 'skill-facts.json', 'skills-13579.json']
    .map((file) => readFileSync(join(ROOT, 'data', 'catalogue', file), 'utf8'))
    .join('\n')
    .toLowerCase();
  return catalogue;
}

/**
 * A skill or an MCP server by what is known without a network call: ARP's catalogue holds it, or
 * its name says `mcp`. The catalogue test is ARP's own list by construction, so a library it lists
 * counts too (`remotion`, task 52 §3). `null` means ask skills.sh.
 */
export function agentByName(name: string, catalogueLower: string): boolean | null {
  const needle = name.toLowerCase();
  if (/mcp/.test(needle)) return true;
  const listed =
    catalogueLower.includes(`github.com/${needle}`) ||
    catalogueLower.includes(`"${needle}"`) ||
    catalogueLower.includes(`npmjs.com/package/${needle}`);
  return listed ? true : null;
}

const listed = new Map<string, Promise<boolean | null>>();

/** Whether skills.sh lists any skill whose source is this repository. */
function skillsShLists(repo: string): Promise<boolean | null> {
  const key = repo.toLowerCase();
  const known = listed.get(key);
  if (known !== undefined) return known;
  const lookup = fetch(`https://skills.sh/api/search?q=${encodeURIComponent(repo.split('/')[1] ?? repo)}&limit=50`)
    .then((res) => (res.ok ? (res.json() as Promise<{ skills?: { source?: string }[] }>) : null)) // the shape skills.sh's search answers
    .then((body) => (body === null ? null : (body.skills ?? []).some((skill) => skill.source?.toLowerCase() === key)))
    .catch(() => null);
  listed.set(key, lookup);
  return lookup;
}

export async function checkReferences(answer: string): Promise<Ref[]> {
  return Promise.all(
    references(answer).map(async (ref) => {
      const found = await exists(ref.kind, ref.name);
      if (found !== true) return { ...ref, exists: found };
      const agent =
        agentByName(ref.name, catalogueText()) ?? (ref.kind === 'github' ? await skillsShLists(ref.name) : false);
      return { ...ref, exists: found, agent };
    }),
  );
}

/** Runs `tasks` with at most `jobs` at once, writing each result as it lands. */
async function pool<T>(tasks: (() => Promise<T>)[], jobs: number, onDone: (value: T, index: number) => void): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(jobs, tasks.length) }, async () => {
      while (next < tasks.length) {
        const index = next++;
        const task = tasks[index];
        if (task !== undefined) onDone(await task(), index);
      }
    }),
  );
}

function wilson(successes: number, n: number): [number, number] {
  if (n === 0) return [0, 1];
  const z = 1.96;
  const p = successes / n;
  const centre = p + (z * z) / (2 * n);
  const spread = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  const denominator = 1 + (z * z) / n;
  return [(centre - spread) / denominator, (centre + spread) / denominator];
}

/** Ratio of sums arp/none, and its 95% interval resampling prompts (each prompt keeps its reps). */
function ratio(runs: RunRecord[], value: (run: RunRecord) => number): { point: number; low: number; high: number } {
  const byPrompt = new Map<string, { arp: number; none: number }>();
  for (const run of runs) {
    const sums = byPrompt.get(run.prompt) ?? { arp: 0, none: 0 };
    sums[run.arm] += value(run);
    byPrompt.set(run.prompt, sums);
  }
  const groups = [...byPrompt.values()];
  const of = (sample: { arp: number; none: number }[]) => {
    const none = sample.reduce((s, g) => s + g.none, 0);
    return none === 0 ? NaN : sample.reduce((s, g) => s + g.arp, 0) / none;
  };
  const random = rng(45);
  const draws = Array.from({ length: 2000 }, () =>
    // the index is below groups.length, so the element exists
    of(Array.from({ length: groups.length }, () => groups[Math.floor(random() * groups.length)] as { arp: number; none: number })),
  ).sort((x, y) => x - y);
  return { point: of(groups), low: draws[50] ?? NaN, high: draws[1949] ?? NaN };
}

function summarise(records: EvalRecord[]): string {
  const runs = records.filter((r): r is RunRecord => r.kind === 'run' && !r.isError);
  const failed = records.filter((r) => r.kind === 'run' && r.isError).length;
  const judges = records.filter((r): r is JudgeRecord => r.kind === 'judge');
  const meta = records.find((r): r is MetaRecord => r.kind === 'meta');
  const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
  const lines: string[] = [];
  if (meta !== undefined)
    lines.push(`${meta.date}  commit ${meta.commit}  claude ${meta.claude}  model ${meta.model}  judge ${meta.judgeModel}  reps ${meta.reps}`);
  lines.push(`runs ${runs.length} answered, ${failed} failed (excluded)`, '');
  if (meta?.suite === 'install') return [...lines, ...summariseInstall(runs, judges)].join('\n');

  const verdicts: boolean[] = [];
  for (const needsTool of [true, false]) {
    const ids = PROMPTS.filter((p) => p.needsTool === needsTool).map((p) => p.id);
    const arpRuns = runs.filter((r) => r.arm === 'arp' && r.needsTool === needsTool);
    const byMajority = ids.filter((id) => {
      const mine = arpRuns.filter((r) => r.prompt === id);
      return mine.length > 0 && mine.filter((r) => r.consulted).length * 2 > mine.length;
    }).length;
    const consultedRuns = arpRuns.filter((r) => r.consulted).length;
    const [low, high] = wilson(consultedRuns, arpRuns.length);
    const pass = needsTool ? byMajority >= 10 : byMajority <= 1;
    verdicts.push(pass);
    lines.push(
      `${needsTool ? 'needs a tool' : 'needs none  '}  consulted on ${byMajority} of ${ids.length} prompts (majority of reps)` +
        `  ${pass ? 'PASS' : 'FAIL'} (needs ${needsTool ? '>= 10' : '<= 1'})`,
      `              runs: ${consultedRuns} of ${arpRuns.length}, 95% ${pct(low)} to ${pct(high)}`,
    );
  }
  lines.push('');

  for (const needsTool of [true, false]) {
    const mine = runs.filter((r) => r.needsTool === needsTool);
    const tokens = ratio(mine, (r) => r.tokens.total);
    const cost = ratio(mine, (r) => r.costUsd);
    const mean = (arm: Arm, value: (r: RunRecord) => number) => {
      const xs = mine.filter((r) => r.arm === arm).map(value);
      return xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length);
    };
    const judged = judges.filter((j) => j.needsTool === needsTool && j.verdict !== 'invalid');
    const count = (v: JudgeRecord['verdict']) => judged.filter((j) => j.verdict === v).length;
    const [, lossHigh] = wilson(count('none'), judged.length);
    const cheaper = tokens.high < 1;
    const notWorse = judged.length > 0 && lossHigh < 0.5;
    lines.push(
      needsTool ? 'prompts that need a tool' : 'prompts that need none',
      `  tokens per run   arp ${Math.round(mean('arp', (r) => r.tokens.total))}   none ${Math.round(mean('none', (r) => r.tokens.total))}` +
        `   ratio ${tokens.point.toFixed(2)}, 95% ${tokens.low.toFixed(2)} to ${tokens.high.toFixed(2)}`,
      `  cost per run     arp $${mean('arp', (r) => r.costUsd).toFixed(4)}   none $${mean('none', (r) => r.costUsd).toFixed(4)}` +
        `   ratio ${cost.point.toFixed(2)}, 95% ${cost.low.toFixed(2)} to ${cost.high.toFixed(2)}`,
      `  turns per run    arp ${mean('arp', (r) => r.turns).toFixed(1)}   none ${mean('none', (r) => r.turns).toFixed(1)}` +
        `   web searches per run  arp ${mean('arp', (r) => r.webSearches).toFixed(1)}   none ${mean('none', (r) => r.webSearches).toFixed(1)}`,
      `  judged ${judged.length} pairs: arp better ${count('arp')}, none better ${count('none')}, tie ${count('tie')}` +
        `   arp loss rate upper 95% ${pct(lossHigh)}`,
    );
    if (needsTool)
      lines.push(`  saving claimable: ${cheaper && notWorse ? 'YES' : 'NO'} (interval below 1: ${cheaper ? 'yes' : 'no'}, not worse: ${notWorse ? 'yes' : 'no'})`);
    lines.push('');
  }
  lines.push(`consultation criteria: ${verdicts.every(Boolean) ? 'PASS' : 'FAIL'}`);
  return lines.join('\n');
}

function summariseInstall(runs: RunRecord[], judges: JudgeRecord[]): string[] {
  const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
  const lines: string[] = [];
  const share = (arm: Arm, test: (run: RunRecord) => boolean) => {
    const mine = runs.filter((r) => r.arm === arm);
    const hits = mine.filter(test).length;
    return { hits, n: mine.length, interval: wilson(hits, mine.length) };
  };
  const real = (r: RunRecord) => (r.refs ?? []).some((ref) => ref.agent === true);
  const anyReal = (r: RunRecord) => (r.refs ?? []).some((ref) => ref.exists === true);
  const invented = (r: RunRecord) => (r.refs ?? []).some((ref) => ref.exists === false);
  const stats = { arp: { real: share('arp', real), invented: share('arp', invented) }, none: { real: share('none', real), invented: share('none', invented) } };
  for (const arm of ['arp', 'none'] as const) {
    const { real: r, invented: i } = stats[arm];
    lines.push(
      `${arm.padEnd(4)}  names a skill or MCP server that exists: ${r.hits} of ${r.n}, 95% ${pct(r.interval[0])} to ${pct(r.interval[1])}`,
      `      names anything installable that exists: ${share(arm, anyReal).hits} of ${r.n}` +
        `   names one that does not exist: ${i.hits} of ${i.n}, 95% ${pct(i.interval[0])} to ${pct(i.interval[1])}`,
    );
  }
  const unknown = runs.flatMap((r) => r.refs ?? []).filter((ref) => ref.exists === null).length;
  lines.push(`lookups that failed (counted neither way): ${unknown}`);
  const mean = (arm: Arm, value: (r: RunRecord) => number) => {
    const xs = runs.filter((r) => r.arm === arm).map(value);
    return xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length);
  };
  const tokens = ratio(runs, (r) => r.tokens.total);
  lines.push(
    `tokens per run   arp ${Math.round(mean('arp', (r) => r.tokens.total))}   none ${Math.round(mean('none', (r) => r.tokens.total))}` +
      `   ratio ${tokens.point.toFixed(2)}, 95% ${tokens.low.toFixed(2)} to ${tokens.high.toFixed(2)}`,
    `consulted        ${runs.filter((r) => r.arm === 'arp' && r.consulted).length} of ${stats.arp.real.n} arp runs`,
  );
  const judged = judges.filter((j) => j.verdict !== 'invalid');
  const count = (v: JudgeRecord['verdict']) => judged.filter((j) => j.verdict === v).length;
  const [betterLow, betterHigh] = wilson(count('arp'), judged.length);
  lines.push(
    `judged ${judged.length} pairs: arp better ${count('arp')}, none better ${count('none')}, tie ${count('tie')}` +
      `   arp better 95% ${pct(betterLow)} to ${pct(betterHigh)}`,
    '',
  );
  const apart = stats.arp.real.interval[0] > stats.none.real.interval[1];
  const noMoreInvented = stats.arp.invented.hits / Math.max(1, stats.arp.invented.n) <= stats.none.invented.hits / Math.max(1, stats.none.invented.n);
  lines.push(
    `install criteria: ${apart && noMoreInvented ? 'PASS' : 'FAIL'} (intervals apart, arp above: ${apart ? 'yes' : 'no'}; arp invents no more: ${noMoreInvented ? 'yes' : 'no'})`,
  );
  return lines;
}

function load(file: string): EvalRecord[] {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as EvalRecord); // lines this script wrote
}

async function main(): Promise<void> {
  // Re-reads the references of a past run's answers into a new file, with no agent run: the raw
  // file is never rewritten (ADR `0064`).
  const recheck = arg('recheck');
  if (recheck !== undefined) {
    const target = arg('out');
    if (target === undefined || resolve(target) === resolve(recheck)) throw new Error('--recheck needs an --out that is a new file');
    const rechecked: EvalRecord[] = [];
    for (const record of load(recheck))
      rechecked.push(record.kind === 'run' && !record.isError ? { ...record, refs: await checkReferences(record.answer) } : record);
    writeFileSync(target, rechecked.map((r) => JSON.stringify(r)).join('\n') + '\n');
    console.log(summarise(rechecked));
    return;
  }
  const past = arg('summarise');
  if (past !== undefined) {
    console.log(summarise(load(past)));
    return;
  }
  if (!existsSync(CLI)) throw new Error(`${CLI} is missing: run (cd apps/cli && bun run build) first`);

  const reps = Number(arg('reps') ?? 3);
  const model = arg('model') ?? 'sonnet';
  const judgeModel = arg('judge-model') ?? 'opus';
  const jobs = Number(arg('jobs') ?? 4);
  const suite: Suite = arg('suite') === 'install' ? 'install' : 'tools';
  const date = new Date().toISOString().slice(0, 10);
  const out = resolve(
    arg('out') ?? join(ROOT, 'data', 'measurements', `discovery-eval-${suite === 'install' ? 'install-' : ''}${date}.jsonl`),
  );

  const records = load(out);
  if (!records.some((r) => r.kind === 'meta')) {
    const meta: MetaRecord = {
      kind: 'meta',
      date,
      commit: spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT }).stdout.toString().trim(),
      claude: spawnSync('claude', ['--version']).stdout.toString().trim(),
      model,
      judgeModel,
      reps,
      suite,
    };
    appendFileSync(out, `${JSON.stringify(meta)}\n`);
    records.push(meta);
  }
  const write = (record: EvalRecord) => {
    appendFileSync(out, `${JSON.stringify(record)}\n`);
    records.push(record);
  };

  const mcpDir = mkdtempSync(join(tmpdir(), 'arp-eval-mcp-'));
  const mcpConfig = join(mcpDir, 'mcp.json');
  writeFileSync(
    mcpConfig,
    JSON.stringify({ mcpServers: { arp: { command: 'node', args: [CLI, 'mcp'], env: { ARP_TARGET: 'testnet', ARP_TOOLS: 'read' } } } }),
  );

  const done = new Set(records.filter((r): r is RunRecord => r.kind === 'run' && !r.isError).map((r) => `${r.prompt}/${r.arm}/${r.rep}`));
  const only = arg('only')?.split(',');
  const prompts = promptsOf(suite).filter((p) => only === undefined || only.includes(p.id));
  const plan = shuffle(
    prompts.flatMap((p) => (['arp', 'none'] as const).flatMap((arm) => Array.from({ length: reps }, (_, rep) => ({ p, arm, rep })))),
    rng(2026_11_02),
  ).filter(({ p, arm, rep }) => !done.has(`${p.id}/${arm}/${rep}`));
  console.error(`${plan.length} runs to go, ${jobs} at a time → ${out}`);
  await pool(
    plan.map(({ p, arm, rep }) => async () => {
      const record = await runOne(p, arm, rep, model, mcpConfig);
      return suite === 'install' ? { ...record, refs: await checkReferences(record.answer) } : record;
    }),
    jobs,
    (record) => {
      write(record);
      console.error(`${record.isError ? 'ERR ' : 'ok  '} ${record.prompt} ${record.arm} #${record.rep} ${record.tokens.total} tok${record.consulted ? ' consulted' : ''}`);
    },
  );
  rmSync(mcpDir, { recursive: true, force: true });

  const judged = new Set(records.filter((r): r is JudgeRecord => r.kind === 'judge').map((r) => `${r.prompt}/${r.rep}`));
  const answered = (id: string, arm: Arm, rep: number) =>
    records.find((r): r is RunRecord => r.kind === 'run' && !r.isError && r.prompt === id && r.arm === arm && r.rep === rep);
  const random = rng(45_3);
  const pairs = prompts.flatMap((p) =>
    Array.from({ length: reps }, (_, rep) => ({ p, rep, arp: answered(p.id, 'arp', rep), none: answered(p.id, 'none', rep) })),
  ).filter((pair) => !judged.has(`${pair.p.id}/${pair.rep}`));
  await pool(
    pairs.map((pair) => async () =>
      pair.arp !== undefined && pair.none !== undefined ? judgeOne(pair.p, pair.arp, pair.none, judgeModel, random, suite) : undefined,
    ),
    jobs,
    (record) => {
      if (record !== undefined) write(record);
    },
  );

  console.log(summarise(records));
}

if (import.meta.main) await main();
