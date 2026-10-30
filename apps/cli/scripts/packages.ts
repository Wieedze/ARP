/**
 * Generate the native packages from this package's version and build (task 33d, ADR `0089`).
 *
 *     bun run packages            write packaging/ and the repo's marketplace manifest
 *     bun run packages --check    exit 1 if what is committed differs from what would be written
 *     bun run packages --local D  write a copy into D whose MCP entry runs this checkout's dist/,
 *                                 to install and try before anything is published
 *
 * One npm package holds the code; each package here is a thin manifest that calls it, pinned to
 * the same version, so a manifest and the package can never disagree. Nothing in `packaging/` is
 * edited by hand.
 *
 * | output | what |
 * | --- | --- |
 * | `.claude-plugin/marketplace.json` | lets `claude plugin marketplace add <owner>/ARP` and Grok's equivalent find the plugin |
 * | `packaging/claude/arp/` | the Claude Code plugin, which Grok Build reads unchanged: MCP server, hook, skill |
 * | `packaging/gemini/arp/` | the Gemini CLI extension: MCP server and the skill as its context file |
 *
 * The hook is shipped as a built file, `bin/hook.js`, because a plugin's hook runs on every tool
 * call and `npx` there would resolve the package each time (ADR `0089` §2). It has no import but
 * Node's own, so it runs from the plugin directory with nothing installed.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

import { CLAUDE_HOOKS } from '../src/install/edits.ts';

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

function mcpServer(local: string | null) {
  return local === null
    ? { command: 'npx', args: ['-y', `${pkg.name}@${pkg.version}`, 'mcp'] }
    : { command: 'node', args: [join(local, 'cli.js'), 'mcp'] };
}

function files(local: string | null): Files {
  const out: Files = new Map();
  const hook = readFileSync(join(CLI, 'dist', 'hook.js'), 'utf8');
  const skill = readFileSync(join(ROOT, 'skills', 'arp', 'SKILL.md'), 'utf8');
  const meta = {
    description:
      'Declare the tools your agent used on the Intuition graph, and record every MCP call your runtime makes.',
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
  out.set(`${claude}/.mcp.json`, json({ mcpServers: { arp: mcpServer(local) } }));
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
  out.set(`${claude}/skills/arp/SKILL.md`, skill);
  out.set(
    '.claude-plugin/marketplace.json',
    json({
      name: 'arp',
      owner: { name: 'ARP' },
      metadata: { description: 'ARP: declare and record the tools your agent uses.' },
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
      description: meta.description,
      mcpServers: { arp: mcpServer(local) },
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
if (args.length > 0 && args[0] !== '--check' && args[0] !== '--local') {
  console.error(`unknown option ${args[0]}: use --check, --local <dir>, or nothing`);
  process.exit(2);
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

if (args[0] === '--local') {
  const target = resolve(args[1] ?? '');
  if (args[1] === undefined) {
    console.error('usage: bun run packages --local <dir>');
    process.exit(2);
  }
  // The committed packages must stay the published ones; a local copy points at this checkout.
  if (target === ROOT || target.startsWith(`${ROOT}/`)) {
    console.error("--local writes this checkout's paths: give it a directory outside the repo");
    process.exit(2);
  }
  rmSync(join(target, 'packaging'), { recursive: true, force: true });
  write(target, files(join(CLI, 'dist')));
  console.log(`local packages in ${target} (MCP runs ${join(CLI, 'dist', 'cli.js')})`);
} else if (args[0] === '--check') {
  const expected = files(null);
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
  const out = files(null);
  write(ROOT, out);
  for (const path of out.keys()) console.log(`wrote ${relative(process.cwd(), join(ROOT, path))}`);
}
