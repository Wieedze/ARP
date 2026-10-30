import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { handleHookEvent } from '../src/hook.js';
import type { ServerEntry } from '../src/mcp-config.js';
import { post, pre, tempDb, tempDir } from './helpers.js';

const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url));

function runHook(env: Record<string, string>, payload: unknown) {
  return spawnSync(process.execPath, [cli, 'hook'], {
    input: JSON.stringify(payload),
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
}

describe('the hook process', () => {
  it.runIf(existsSync(cli))('records a call end to end', () => {
    const home = tempDir();
    expect(runHook({ ARP_HOME: home }, pre('mcp__github__list', 'a1')).status).toBe(0);
    expect(runHook({ ARP_HOME: home }, post('mcp__github__list', 'a1')).status).toBe(0);
    const status = spawnSync(process.execPath, [cli, 'status', '--json'], {
      env: { ...process.env, ARP_HOME: home },
      encoding: 'utf8',
    });
    expect(status.status).toBe(0);
    expect(JSON.parse(status.stdout).tools[0].calls).toBe(1);
    expect(status.stderr).toBe('');
  });

  it.runIf(existsSync(cli))('exits 0 in silence when the database cannot be opened', () => {
    const blocker = join(tempDir(), 'not-a-dir');
    writeFileSync(blocker, 'a file where the directory should be');
    const result = runHook({ ARP_HOME: blocker }, post('mcp__github__list', 'a2'));
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('');
  });

  it.runIf(existsSync(cli))('exits 0 on a payload that is not JSON', () => {
    const result = spawnSync(process.execPath, [cli, 'hook'], {
      input: '{oops',
      env: { ...process.env, ARP_HOME: tempDir() },
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
  });
});

describe('the performance budget', () => {
  it('adds under 20 ms per call, writing included, over 1,000 calls', () => {
    const { db } = tempDb();
    const servers = new Map<string, ServerEntry>([
      ['github', { transport: 'remote', url: 'https://api.githubcopilot.com/mcp/' }],
    ]);
    const start = performance.now();
    for (let i = 0; i < 1000; i += 1) {
      handleHookEvent(db, pre('mcp__github__list', `x${i}`), { servers });
      handleHookEvent(db, post('mcp__github__list', `x${i}`), { servers });
    }
    const perCall = (performance.now() - start) / 1000;
    expect(perCall).toBeLessThan(20);
  });
});
