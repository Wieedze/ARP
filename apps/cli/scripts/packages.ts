/**
 * Generate the native packages from this package's version and build (task 33d, ADR `0089`).
 *
 *     bun run packages            write packaging/ and the repo's marketplace manifest
 *     bun run packages --check    exit 1 if what is committed differs from what would be written
 *     bun run packages --local D  write a copy into D whose Gemini MCP entry runs this checkout's dist/,
 *                                 to install and try before anything is published
 *     bun run packages --tarball URL D
 *                                 write a copy into D whose Gemini MCP entry runs the archive at URL, and
 *                                 the `npm pack` archive beside it, for testers before an npm release.
 *                                 Where the archive is hosted is the URL's business, not this file's
 *
 * One npm package holds the code, and a Gemini manifest calls it, pinned to the same version. The
 * Claude Code plugin carries the code itself, as `bin/arp.js` (ADR `0145`, amended 2026-11-06), so
 * it needs neither npm nor a download. Nothing in `packaging/` is edited by hand.
 *
 * | output | what |
 * | --- | --- |
 * | `.claude-plugin/marketplace.json` | lets `claude plugin marketplace add <owner>/ARP` and Grok's equivalent find the plugin |
 * | `packaging/claude/arp/` | the Claude Code plugin, which Grok Build reads unchanged: MCP server, hook, skill, commands |
 * | `packaging/gemini/arp/` | the Gemini CLI extension: MCP server and the skill as its context file |
 *
 * The hook is shipped as a built file, `bin/hook.js`, because a plugin's hook runs on every tool
 * call and `npx` there would resolve the package each time (ADR `0089` §2). It has no import but
 * Node's own, so it runs from the plugin directory with nothing installed. `bin/arp.js` is the whole
 * CLI in one file, for the same reason, and is built here rather than in `dist/` so that the npm
 * package does not carry it twice. `bin/package.json` says both files are modules: without it Node
 * refused them under a parent `package.json` with `"type": "commonjs"`, and under Node 22.0 with no
 * `package.json` at all, tried 2026-11-06.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

import { CLAUDE_HOOKS } from '../src/install/edits.ts';
import { npxLaunch, SERVER_ENV } from '../src/install/targets.ts';

const CLI = resolve(import.meta.dir, '..');
const ROOT = resolve(CLI, '..', '..');
const pkg = JSON.parse(readFileSync(join(CLI, 'package.json'), 'utf8')) as {
  // `as`: our own manifest, whose shape this file and `package.json` define together.
  name: string;
  version: string;
  description: string;
  license: string;
};

type Files = Map<string, string>;

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

/** Where Gemini's MCP server comes from: the npm release, an archive at a URL, or this checkout. */
type Source = { kind: 'npm' } | { kind: 'tarball'; url: string } | { kind: 'local'; dist: string };

/**
 * The plugin is for people who search, so it serves the read tools only (task 45). Testnet for the
 * same reason `arp init` pins it: the user's decision of 2026-11-02, everything on 13579 for now.
 */
const PLUGIN_ENV = { ...SERVER_ENV, ARP_TOOLS: 'read' };

function mcpServer(source: Source) {
  const run =
    source.kind === 'local'
      ? { command: 'node', args: [join(source.dist, 'cli.js'), 'mcp'] }
      : source.kind === 'npm'
        ? npxLaunch(`${pkg.name}@${pkg.version}`)
        : // `npx -y <file>.tgz` tries to execute the archive itself ("Permission denied", tried
          // 2026-11-02); naming it as the package and `arp` as the command is what runs.
          npxLaunch(`--package ${source.url} arp`);
  return { ...run, env: PLUGIN_ENV };
}

const FIND =
  'Check a skill or MCP server before your agent installs it: what it asks for, and what other agents wrote about it.';

/**
 * The CLI as one file. Built on every run, so `--check` compares the source's output, not an old
 * `dist/`. The kit stays out for the reason `apps/cli/test/cli.test.ts` gives: only delegated mode
 * imports it, lazily, and it says so when it is missing.
 */
async function bundledCli(): Promise<string> {
  // The bundle's path comments are relative to the working directory, so a run from elsewhere reads as stale.
  process.chdir(CLI);
  const built = await Bun.build({
    entrypoints: [join(CLI, 'src', 'cli.ts')],
    root: CLI,
    target: 'node',
    format: 'esm',
    external: ['./hook.js', '@metamask/smart-accounts-kit'],
    banner: '#!/usr/bin/env node',
  });
  const [only, ...others] = built.outputs;
  if (only === undefined || others.length > 0) {
    throw new Error(`bin/arp.js must be one file, and the build gave ${built.outputs.length}`);
  }
  return only.text();
}

/**
 * The plugin's commands, for someone with no `arp` on `PATH`. The `!` line runs when the person types
 * the command, before the model reads anything. `disable-model-invocation` keeps the model from
 * invoking one: `share-send` and `line` write in public, permanently, and that is the person's act.
 * `allowed-tools` names the exact command line, so a command's turn lends the model nothing else.
 */
const RUN_ARP = 'node "${CLAUDE_PLUGIN_ROOT}/bin/arp.js"';
const PLUGIN_COMMANDS: readonly {
  file: string;
  description: string;
  args: string;
  hint?: string;
  after: string;
}[] = [
  {
    file: 'share',
    description: 'Show which of this machine\'s failures would be public, and which stay here. Sends nothing',
    args: 'share',
    after: 'Say what the output above says, briefly. Run nothing else.',
  },
  {
    file: 'share-on',
    description: 'Turn on sharing of this machine\'s failures, and show the lines that would be public. Sends nothing',
    args: 'share on',
    after: 'Say what the output above says, briefly, and that `/arp:share-send` is what writes them. Run nothing else.',
  },
  {
    file: 'share-off',
    description: 'Turn off sharing of this machine\'s failures',
    args: 'share off',
    after: 'Say what the output above says, briefly. Run nothing else.',
  },
  {
    file: 'share-send',
    description: 'Write the shared failures as public, permanent lines on testnet 13579. Needs sharing on, and a sponsoring service',
    args: 'share send',
    after: 'Say what the output above says, briefly. In this plugin, `/arp:share-on` is what the output calls `arp share on`. Run nothing else.',
  },
  {
    file: 'line',
    description: 'Write one public, permanent line on testnet 13579. Needs a sponsoring service',
    args: 'line $ARGUMENTS',
    hint: '--tool <url> --outcome worked|failed [--domain <category>] [--reason <reason>]',
    after: 'Say what the output above says, briefly. Run nothing else.',
  },
];

function commandFile(command: (typeof PLUGIN_COMMANDS)[number]): string {
  const line = `${RUN_ARP} ${command.args}`;
  // A rule ending in `:*` is a prefix: `line` has arguments, and the others must match exactly.
  const rule = command.file === 'line' ? `${RUN_ARP} line:*` : line;
  return [
    '---',
    `description: ${command.description}`,
    ...(command.hint === undefined ? [] : [`argument-hint: ${command.hint}`]),
    'disable-model-invocation: true',
    `allowed-tools: Bash(${rule})`,
    '---',
    '',
    `!\`${line}\``,
    '',
    command.after,
    '',
  ].join('\n');
}

function files(source: Source, cli: string): Files {
  const out: Files = new Map();
  const hook = readFileSync(join(CLI, 'dist', 'hook.js'), 'utf8');
  const skill = readFileSync(join(ROOT, 'skills', 'arp', 'SKILL.md'), 'utf8');
  const meta = {
    description: `${FIND} The hook records each MCP call on your machine; declaring a use is optional.`,
    homepage: 'https://github.com/Wieedze/ARP',
    repository: 'https://github.com/Wieedze/ARP',
    license: pkg.license,
  };

  const claude = 'packaging/claude/arp';
  out.set(
    `${claude}/.claude-plugin/plugin.json`,
    json({
      name: 'arp',
      version: pkg.version,
      ...meta,
      author: { name: 'ARP' },
      keywords: ['mcp', 'agent', 'reputation', 'erc-8004', 'intuition'],
    }),
  );
  // Nothing to fetch and no shell, so the project stays the working directory and no `npx` puts its
  // `node_modules/.bin` on `PATH`: `ARP_PROJECT_DIR` is for the launch through `npx`.
  out.set(
    `${claude}/.mcp.json`,
    json({
      mcpServers: {
        arp: { command: 'node', args: ['${CLAUDE_PLUGIN_ROOT}/bin/arp.js', 'mcp'], env: PLUGIN_ENV },
      },
    }),
  );
  // The same entry `arp init` writes, from the same spec, so the two can never disagree. Only the
  // command differs: a plugin finds the hook in its own directory, not in ~/.arp/bin.
  const command = 'node "${CLAUDE_PLUGIN_ROOT}/bin/hook.js"';
  out.set(
    `${claude}/hooks/hooks.json`,
    json({
      hooks: Object.fromEntries(
        CLAUDE_HOOKS.events.map((event) => [
          event.name,
          [{ matcher: event.matcher, hooks: [CLAUDE_HOOKS.entry(command)] }],
        ]),
      ),
    }),
  );
  out.set(`${claude}/bin/hook.js`, hook);
  out.set(`${claude}/bin/arp.js`, cli);
  out.set(`${claude}/bin/package.json`, json({ type: 'module', private: true }));
  for (const command of PLUGIN_COMMANDS) {
    out.set(`${claude}/commands/${command.file}.md`, commandFile(command));
  }
  out.set(`${claude}/skills/arp/SKILL.md`, skill);
  out.set(
    '.claude-plugin/marketplace.json',
    json({
      name: 'arp',
      owner: { name: 'ARP' },
      metadata: { description: 'ARP: check before your agent installs or pays.' },
      plugins: [{ name: 'arp', source: `./${claude}`, description: meta.description }],
    }),
  );

  // Gemini: no hook, because the hook cannot read a Gemini payload yet (task 33i).
  const gemini = 'packaging/gemini/arp';
  out.set(
    `${gemini}/gemini-extension.json`,
    json({
      name: 'arp',
      version: pkg.version,
      description: `${FIND} Declaring a use is optional.`,
      mcpServers: { arp: mcpServer(source) },
      contextFileName: 'ARP.md',
    }),
  );
  out.set(`${gemini}/ARP.md`, skill);
  return out;
}

function write(root: string, out: Files): void {
  for (const [path, text] of out) {
    const target = join(root, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, text);
  }
}

const args = process.argv.slice(2);
if (args.length > 0 && !['--check', '--local', '--tarball'].includes(args[0] ?? '')) {
  console.error(
    `unknown option ${args[0]}: use --check, --local <dir>, --tarball <url> <dir>, or nothing`,
  );
  process.exit(2);
}

/** A copy goes outside the repo: the committed packages must stay the published ones. */
function outside(dir: string | undefined, usage: string): string {
  if (dir === undefined) {
    console.error(`usage: bun run packages ${usage}`);
    process.exit(2);
  }
  const target = resolve(dir);
  if (target === ROOT || target.startsWith(`${ROOT}/`)) {
    console.error('a copy is written outside the repo: give it a directory outside it');
    process.exit(2);
  }
  return target;
}

/** Every file under `dir`, relative to ROOT. */
function listed(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(ROOT, join(entry.parentPath, entry.name)));
}
if (!existsSync(join(CLI, 'dist', 'hook.js'))) {
  console.error('no dist/hook.js: run `bun run build` first');
  process.exit(1);
}

const cli = await bundledCli();

if (args[0] === '--local') {
  const target = outside(args[1], '--local <dir>');
  rmSync(join(target, 'packaging'), { recursive: true, force: true });
  write(target, files({ kind: 'local', dist: join(CLI, 'dist') }, cli));
  console.log(`local packages in ${target} (Gemini's MCP runs ${join(CLI, 'dist', 'cli.js')})`);
} else if (args[0] === '--tarball') {
  const url = args[1] ?? '';
  // `npx` takes a path or a URL here; anything else would be read as a package name on npm.
  if (!/^https:\/\/\S+\.tgz$/.test(url)) {
    console.error('--tarball takes the https URL the .tgz will be served at, then a directory');
    process.exit(2);
  }
  const target = outside(args[2], '--tarball <url> <dir>');
  rmSync(join(target, 'packaging'), { recursive: true, force: true });
  write(target, files({ kind: 'tarball', url }, cli));
  const packed = execFileSync('npm', ['pack', '--pack-destination', target], {
    cwd: CLI,
    encoding: 'utf8',
  })
    .trim()
    .split('\n')
    .pop();
  console.log(`packages in ${target}, Gemini's MCP runs npx -y --package ${url} arp mcp`);
  console.log(`archive ${join(target, packed ?? '')}: serve it at that URL`);
} else if (args[0] === '--check') {
  const expected = files({ kind: 'npm' }, cli);
  const stale = [...expected].filter(
    ([path, text]) =>
      !existsSync(join(ROOT, path)) || readFileSync(join(ROOT, path), 'utf8') !== text,
  );
  // A file nobody generates would pass a check that only compares the expected ones.
  const extra = listed(join(ROOT, 'packaging')).filter((path) => !expected.has(path));
  for (const [path] of stale) console.error(`stale: ${path}`);
  for (const path of extra) console.error(`not generated: ${path}`);
  if (stale.length > 0 || extra.length > 0) {
    console.error('run `bun run packages` in apps/cli and commit the result');
    process.exit(1);
  }
  console.log('packaging/ matches this build');
} else {
  rmSync(join(ROOT, 'packaging'), { recursive: true, force: true });
  const out = files({ kind: 'npm' }, cli);
  write(ROOT, out);
  for (const path of out.keys()) console.log(`wrote ${relative(process.cwd(), join(ROOT, path))}`);
}
