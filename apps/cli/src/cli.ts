/**
 * `arp` — one binary for ARP's three agent-side programs (ADR `0089`).
 *
 * | command | program | trust surface |
 * | --- | --- | --- |
 * | `arp mcp` | the MCP server, over stdio; `--http` to serve on 127.0.0.1 | `apps/mcp` |
 * | `arp hook` | reads one payload on stdin, appends one line | `apps/hook` |
 * | `arp node` | the hire endpoint, opt-in | `apps/node` |
 *
 * **A shared binary, not a shared process.** Each program is imported only when its command runs,
 * so `arp hook` never loads the MCP server's configuration and `arp mcp` never reads the node's key
 * (ADR `0082`).
 *
 * **The hook is a separate file, `dist/hook.js`, built on its own.** It runs on every tool call, and
 * as a chunk of this bundle it shared one with the MCP server and loaded viem: 0.37 s per call under
 * Node 22, measured 2026-10-30. Built alone and tree-shaken, it loads in about 0.03 s. Its path is
 * resolved at run time so the bundler leaves it out of this file.
 *
 * `init`, `uninstall` and `doctor` install, remove and check the MCP server and the hook in each
 * runtime found on the machine (`src/install/`, task 33c).
 */
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { version } from '../package.json';

const USAGE = `arp ${version} — ARP's agent-side programs

usage
  arp mcp [--http]   the MCP server. stdio by default, which is how an MCP client launches it
  arp hook           the runtime hook: one payload on stdin, one line in .arp/session.jsonl
  arp node           the hire endpoint. Opt-in: it listens on every interface with your agent key

  arp init           add the MCP server and the hook to every runtime found here
  arp uninstall      remove them, and only them
  arp doctor         check what is installed and that the server answers

  options for init, uninstall, doctor
    --dry-run, -n        show the changes, write nothing
    --yes, -y            agree without a prompt
    --no-input           never prompt; fail if a change needs agreement
    --runtime a,b        only these: claude, grok, cursor, gemini, codex
    --project            the project's files instead of your user ones
    --print              (init) print the MCP entry for any other client, write nothing
  arp --version
  arp --help

docs: https://github.com/Wieedze/ARP/blob/main/docs/22_RUNNING_THE_NODE.md
`;

/** Exit codes, mapped to what went wrong rather than all 1 (clig.dev, "The Basics"). */
const EXIT = { ok: 0, usage: 2 } as const;

/** This file once bundled: `dist/cli.js`. `init` writes its path into the MCP entry. */
const CLI_PATH = fileURLToPath(import.meta.url);

async function run(argv: readonly string[]): Promise<number> {
  const [command, ...rest] = argv;
  switch (command) {
    case 'mcp': {
      const { main } = await import('@arp/mcp/server');
      await main(rest.includes('--http') ? rest : ['--stdio', ...rest]);
      return EXIT.ok;
    }
    case 'hook':
      // The hook is a script: importing it reads stdin, writes at most one line and exits 0.
      await import(new URL('./hook.js', import.meta.url).href);
      return EXIT.ok;
    case 'node': {
      const { main } = await import('@arp/node/node');
      await main();
      return EXIT.ok;
    }
    case 'init':
    case 'uninstall':
    case 'doctor': {
      const install = await import('./install/commands.ts');
      const { processEnv } = await import('./install/env.ts');
      const flags = install.parseFlags(rest);
      if (flags instanceof Error) {
        process.stderr.write(`arp ${command}: ${flags.message}\n`);
        return EXIT.usage;
      }
      const env = processEnv(dirname(CLI_PATH), version);
      if (command === 'doctor') return install.doctor(env, flags, CLI_PATH);
      return command === 'init'
        ? install.init(env, flags, CLI_PATH)
        : install.uninstall(env, flags, CLI_PATH);
    }
    case '--version':
    case '-v':
      process.stdout.write(`${version}\n`);
      return EXIT.ok;
    case undefined:
    case 'help':
    case '--help':
    case '-h':
      process.stdout.write(USAGE);
      return EXIT.ok;
    default:
      process.stderr.write(`arp: unknown command '${command}'\n\n${USAGE}`);
      return EXIT.usage;
  }
}

// `arp init | head` closes the pipe early; that is the reader's choice, not an error worth a stack.
process.stdout.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EPIPE') process.exit(0);
  throw error;
});

const code = await run(process.argv.slice(2));
// A server keeps the process alive on its own; only a finished command sets the exit code.
if (code !== EXIT.ok) process.exit(code);
