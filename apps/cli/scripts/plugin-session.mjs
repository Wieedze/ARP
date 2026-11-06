/**
 * One session against a plugin's MCP server, as Claude Code starts it: the command and the env from
 * `.mcp.json`, with `${CLAUDE_PLUGIN_ROOT}` replaced, in this working directory, stdin held open.
 * Prints what it got as one JSON line and exits 0 only if the server listed its tools.
 *
 *     node plugin-session.mjs <plugin dir> [--search "<words>"]
 *
 * Used by `check-node.sh` and `scripts/measure/plugin-start.sh`, so it runs under Node with nothing
 * installed.
 */
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const [root, flag, words] = process.argv.slice(2);
const entry = JSON.parse(readFileSync(join(root, '.mcp.json'), 'utf8')).mcpServers.arp;
const expand = (text) => text.replaceAll('${CLAUDE_PLUGIN_ROOT}', root);

const started = performance.now();
const server = spawn(expand(entry.command), entry.args.map(expand), {
  env: { ...process.env, ...entry.env },
  stdio: ['pipe', 'pipe', 'ignore'],
});
const waiting = new Map();
let buffer = '';
server.stdout.on('data', (chunk) => {
  buffer += chunk;
  for (let at = buffer.indexOf('\n'); at !== -1; at = buffer.indexOf('\n')) {
    const message = JSON.parse(buffer.slice(0, at));
    buffer = buffer.slice(at + 1);
    waiting.get(message.id)?.(message);
  }
});
const ask = (id, method, params) =>
  new Promise((resolve) => {
    waiting.set(id, resolve);
    server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });

const report = { ok: false, tools: [], ms_to_tools: null, searched: false };
const limit = setTimeout(() => finish(), 90_000);
server.on('exit', () => finish());
let done = false;
function finish() {
  if (done) return;
  done = true;
  clearTimeout(limit);
  server.kill();
  process.stdout.write(`${JSON.stringify(report)}\n`);
  process.exit(report.ok ? 0 : 1);
}

await ask(1, 'initialize', {});
const listed = await ask(2, 'tools/list', {});
report.tools = (listed.result?.tools ?? []).map((tool) => tool.name);
report.ms_to_tools = Math.round(performance.now() - started);
report.ok = report.tools.length > 0;
if (flag === '--search') {
  const answer = await ask(3, 'tools/call', { name: 'arp_pulse', arguments: { query: words } });
  report.searched = answer.result !== undefined;
  report.ok &&= report.searched;
}
finish();
