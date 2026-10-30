import { describe, expect, test } from 'bun:test';

import {
  chooseTunnel,
  clientAddress,
  findOnPath,
  isExecutable,
  publicUrlFrom,
  type Spawn,
  spawnProcess,
  startTunnel,
  tunnelArgs,
  type TunnelProcess,
} from '../src/tunnel.ts';

/** A child that prints what the test tells it to. Nothing is ever started. */
function scripted() {
  const lines: ((line: string) => void)[] = [];
  const exits: ((code: number | null) => void)[] = [];
  const calls: { command: string; args: readonly string[] }[] = [];
  let killed = 0;
  const child: TunnelProcess = {
    onLine: (listener) => lines.push(listener),
    onExit: (listener) => exits.push(listener),
    kill: () => {
      killed += 1;
    },
  };
  const spawn: Spawn = (command, args) => {
    calls.push({ command, args });
    return child;
  };
  return {
    spawn,
    calls,
    print: (line: string) => lines.forEach((listener) => listener(line)),
    exit: (code: number | null) => exits.forEach((listener) => listener(code)),
    killed: () => killed,
  };
}

const onPath =
  (...present: string[]) =>
  (path: string) =>
    present.includes(path);

describe('findOnPath', () => {
  test('returns the first executable match and skips empty entries', () => {
    expect(findOnPath('ngrok', '::/a:/b', onPath('/b/ngrok', '/a/ngrok'))).toBe('/a/ngrok');
    expect(findOnPath('ngrok', undefined, onPath())).toBeNull();
  });
});

describe('isExecutable', () => {
  test('is true for an executable file and false for a directory or nothing', () => {
    expect(isExecutable(process.execPath)).toBe(true);
    expect(isExecutable('/')).toBe(false);
    expect(isExecutable('/nonexistent/arp-tunnel')).toBe(false);
  });
});

describe('chooseTunnel', () => {
  const PATH = '/usr/bin';
  test('auto prefers a configured URL, then cloudflared, then ngrok', () => {
    expect(chooseTunnel({ ARP_NODE_PUBLIC_URL: 'https://agent.example/', PATH }, onPath())).toEqual(
      {
        kind: 'configured',
        publicUrl: 'https://agent.example',
      },
    );
    expect(chooseTunnel({ PATH }, onPath('/usr/bin/cloudflared', '/usr/bin/ngrok'))).toEqual({
      kind: 'cloudflared',
      binary: '/usr/bin/cloudflared',
    });
    expect(chooseTunnel({ PATH }, onPath('/usr/bin/ngrok'))).toEqual({
      kind: 'ngrok',
      binary: '/usr/bin/ngrok',
    });
  });

  test('auto with nothing installed says what to do', () => {
    const result = chooseTunnel({ PATH }, onPath());
    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toContain('install cloudflared or ngrok');
  });

  test('a named binary must be on PATH', () => {
    expect(
      chooseTunnel({ ARP_NODE_TUNNEL: 'ngrok', PATH }, onPath('/usr/bin/cloudflared')),
    ).toBeInstanceOf(Error);
    expect(
      chooseTunnel({ ARP_NODE_TUNNEL: ' Cloudflared ', PATH }, onPath('/usr/bin/cloudflared')),
    ).toEqual({
      kind: 'cloudflared',
      binary: '/usr/bin/cloudflared',
    });
  });

  test('configured needs an https URL', () => {
    expect(chooseTunnel({ ARP_NODE_TUNNEL: 'configured' }, onPath())).toBeInstanceOf(Error);
    expect(
      chooseTunnel(
        { ARP_NODE_TUNNEL: 'configured', ARP_NODE_PUBLIC_URL: 'http://agent.example' },
        onPath(),
      ),
    ).toBeInstanceOf(Error);
    expect(chooseTunnel({ ARP_NODE_PUBLIC_URL: 'http://agent.example' }, onPath())).toBeInstanceOf(
      Error,
    );
  });

  test('none, and an unknown mode', () => {
    expect(chooseTunnel({ ARP_NODE_TUNNEL: 'none' }, onPath())).toEqual({ kind: 'none' });
    expect(chooseTunnel({ ARP_NODE_TUNNEL: 'relay' }, onPath())).toBeInstanceOf(Error);
  });
});

describe('tunnelArgs', () => {
  test('points each binary at the loopback address', () => {
    expect(tunnelArgs('cloudflared', 'http://127.0.0.1:3100')).toEqual([
      'tunnel',
      '--no-autoupdate',
      '--url',
      'http://127.0.0.1:3100',
    ]);
    expect(tunnelArgs('ngrok', 'http://127.0.0.1:3100')).toEqual([
      'http',
      'http://127.0.0.1:3100',
      '--log',
      'stdout',
      '--log-format',
      'json',
    ]);
  });
});

describe('publicUrlFrom', () => {
  test("reads cloudflared's quick-tunnel banner", () => {
    expect(
      publicUrlFrom(
        'cloudflared',
        '2026-10-30T12:00:00Z INF |  https://quiet-lake-42.trycloudflare.com  |',
      ),
    ).toBe('https://quiet-lake-42.trycloudflare.com');
    expect(publicUrlFrom('cloudflared', 'INF Starting tunnel')).toBeNull();
  });

  test("reads ngrok's JSON log, and ignores everything else", () => {
    expect(
      publicUrlFrom(
        'ngrok',
        JSON.stringify({ msg: 'started tunnel', url: 'https://ab12.ngrok-free.app' }),
      ),
    ).toBe('https://ab12.ngrok-free.app');
    expect(
      publicUrlFrom('ngrok', JSON.stringify({ msg: 'x', url: 'tcp://0.tcp.ngrok.io:1' })),
    ).toBeNull();
    expect(publicUrlFrom('ngrok', JSON.stringify({ msg: 'x' }))).toBeNull();
    expect(publicUrlFrom('ngrok', 'null')).toBeNull();
    expect(publicUrlFrom('ngrok', 'not json')).toBeNull();
  });
});

describe('clientAddress', () => {
  const request = (headers: Record<string, string>) =>
    new Request('http://127.0.0.1/task', { headers });
  test("reads the tunnel's header on a loopback socket", () => {
    expect(clientAddress(request({ 'cf-connecting-ip': '203.0.113.7' }), '127.0.0.1')).toBe(
      '203.0.113.7',
    );
    expect(clientAddress(request({ 'x-forwarded-for': '198.51.100.2, 10.0.0.1' }), '::1')).toBe(
      '198.51.100.2',
    );
    expect(clientAddress(request({}), '::ffff:127.0.0.1')).toBe('::ffff:127.0.0.1');
  });
  test('ignores the header on any other socket', () => {
    expect(clientAddress(request({ 'cf-connecting-ip': '203.0.113.7' }), '192.0.2.4')).toBe(
      '192.0.2.4',
    );
  });
});

describe('spawnProcess', () => {
  // A child that is not a tunnel: this runtime, printing two lines. No tunnel is ever started here.
  test('merges stdout and stderr into lines and reports the exit code', async () => {
    const child = spawnProcess(process.execPath, [
      '-e',
      'console.log("out"); console.error("err")',
    ]);
    const lines: string[] = [];
    child.onLine((line) => lines.push(line));
    const code = await new Promise<number | null>((resolve) => child.onExit(resolve));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(code).toBe(0);
    expect(lines.sort()).toEqual(['err', 'out']);
    child.kill();
  });
});

describe('startTunnel', () => {
  test('none and configured start nothing', async () => {
    const child = scripted();
    expect(
      (await startTunnel({ kind: 'none' }, 'http://127.0.0.1:1', { spawn: child.spawn })).publicUrl,
    ).toBeNull();
    const configured = await startTunnel(
      { kind: 'configured', publicUrl: 'https://agent.example' },
      'http://127.0.0.1:1',
      { spawn: child.spawn },
    );
    expect(configured).toMatchObject({ publicUrl: 'https://agent.example', stable: true });
    configured.stop();
    expect(child.calls).toEqual([]);
  });

  test('resolves with the URL the binary prints, and stop kills it without reporting it down', async () => {
    const child = scripted();
    const down: (number | null)[] = [];
    const pending = startTunnel(
      { kind: 'cloudflared', binary: '/usr/bin/cloudflared' },
      'http://127.0.0.1:3100',
      {
        spawn: child.spawn,
        onDown: (code) => down.push(code),
      },
    );
    child.print('INF Requesting new quick Tunnel');
    child.print('INF |  https://quiet-lake.trycloudflare.com  |');
    child.print('INF |  https://second.trycloudflare.com  |');
    const running = await pending;
    expect(running).toMatchObject({
      publicUrl: 'https://quiet-lake.trycloudflare.com',
      stable: false,
    });
    expect(child.calls[0]).toEqual({
      command: '/usr/bin/cloudflared',
      args: tunnelArgs('cloudflared', 'http://127.0.0.1:3100'),
    });
    running.stop();
    child.exit(0);
    expect(child.killed()).toBe(1);
    expect(down).toEqual([]);
  });

  test('reports a tunnel that dies after it was up', async () => {
    const child = scripted();
    const down: (number | null)[] = [];
    const pending = startTunnel(
      { kind: 'ngrok', binary: '/usr/bin/ngrok' },
      'http://127.0.0.1:3100',
      {
        spawn: child.spawn,
        onDown: (code) => down.push(code),
      },
    );
    child.print(JSON.stringify({ url: 'https://ab12.ngrok-free.app' }));
    await pending;
    child.exit(1);
    expect(down).toEqual([1]);
  });

  test('rejects a binary that exits before printing a URL', async () => {
    const child = scripted();
    const pending = startTunnel(
      { kind: 'ngrok', binary: '/usr/bin/ngrok' },
      'http://127.0.0.1:3100',
      {
        spawn: child.spawn,
      },
    );
    child.exit(null);
    await expect(pending).rejects.toThrow('ngrok exited (signal) before printing a public URL');
  });

  test('rejects and kills a binary that prints no URL in time', async () => {
    const child = scripted();
    const pending = startTunnel(
      { kind: 'cloudflared', binary: '/usr/bin/cloudflared' },
      'http://127.0.0.1:3100',
      {
        spawn: child.spawn,
        timeoutMs: 5,
      },
    );
    await expect(pending).rejects.toThrow('printed no public URL within 5 ms');
    child.exit(143);
    expect(child.killed()).toBe(1);
  });
});
