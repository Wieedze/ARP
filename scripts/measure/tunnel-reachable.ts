/** How long a new quick tunnel takes to answer, seen by the two paths the node's address goes through.
 *
 *      bun run scripts/measure/tunnel-reachable.ts [--runs 3] [--seconds 90]
 *
 *  A plain fetch, `guardedFetchText` with the DNS check `arp_agent_endpoints` uses (`getaddrinfo`), and the same guard asking the DNS server directly. Holds no key, signs nothing,
 *  writes nothing on chain. The tunnel serves a local server that answers `{"ok":true}`, for as long as this runs.
 *  Appends to `data/measurements/tunnel-reachable-<date>.jsonl`.
 */
import { spawn } from 'node:child_process';
import { lookup, resolve4, resolve6 } from 'node:dns/promises';
import { appendFileSync } from 'node:fs';

import { guardedFetchText } from '../../packages/protocol/src/verify/probe.ts';

const arg = (name: string, fallback: number) => {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : Number(process.argv[index + 1]);
};
const RUNS = arg('runs', 3);
const SECONDS = arg('seconds', 90);
const PORT = 3190;

const server = Bun.serve({
  port: PORT,
  hostname: '127.0.0.1',
  fetch: () => Response.json({ ok: true }),
});

const reason = (error: unknown) => {
  const err = error as { name?: string; code?: string; message?: string; cause?: { code?: string } };
  return `${err.name ?? 'Error'} ${err.code ?? err.cause?.code ?? ''} ${(err.message ?? '').slice(0, 60)}`.trim();
};
const resolveHost = async (host: string) =>
  (await lookup(host, { all: true })).map((entry) => entry.address);

// The same guard with the resolver that asks the DNS server rather than the system's cached `getaddrinfo`.
const resolveDirect = async (host: string) => {
  const [four, six] = await Promise.allSettled([resolve4(host), resolve6(host)]);
  const addresses = [...(four.status === 'fulfilled' ? four.value : []), ...(six.status === 'fulfilled' ? six.value : [])];
  if (addresses.length === 0) throw new Error('no address');
  return addresses;
};
async function direct(url: string): Promise<string> {
  try {
    const answer = await guardedFetchText(globalThis.fetch, url, {}, { timeoutMs: 5_000, maxBytes: 8_192, resolveHost: resolveDirect });
    return answer.status === 'refused' ? `refused ${answer.reason.slice(0, 60)}` : `http ${answer.response.status}`;
  } catch (error) {
    return reason(error);
  }
}

async function plain(url: string): Promise<string> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    return `http ${response.status}`;
  } catch (error) {
    return reason(error);
  }
}
async function guarded(url: string): Promise<string> {
  try {
    const answer = await guardedFetchText(globalThis.fetch, url, {}, { timeoutMs: 5_000, maxBytes: 8_192, resolveHost });
    return answer.status === 'refused' ? `refused ${answer.reason.slice(0, 60)}` : `http ${answer.response.status}`;
  } catch (error) {
    return reason(error);
  }
}

const output = `data/measurements/tunnel-reachable-${new Date().toISOString().slice(0, 10)}.jsonl`;
for (let run = 1; run <= RUNS; run += 1) {
  const tunnel = spawn('cloudflared', ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${PORT}`], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const opened = Date.now();
  const url = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('no URL in 60 s')), 60_000);
    const read = (chunk: Buffer) => {
      const match = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(chunk.toString());
      if (match) {
        clearTimeout(timer);
        resolve(match[0]);
      }
    };
    tunnel.stderr?.on('data', read);
    tunnel.stdout?.on('data', read);
  });
  const printed = Date.now();
  const samples: { t: number; plain: string; guarded: string; direct: string }[] = [];
  let bothFor = 0;
  while (Date.now() - printed < SECONDS * 1_000 && bothFor < 5) {
    const started = Date.now();
    const [first, second, third] = await Promise.all([plain(url), guarded(url), direct(url)]);
    samples.push({ t: Math.round((started - printed) / 100) / 10, plain: first, guarded: second, direct: third });
    bothFor = first === 'http 200' && second === 'http 200' && third === 'http 200' ? bothFor + 1 : 0;
    await new Promise((resume) => setTimeout(resume, Math.max(0, 2_000 - (Date.now() - started))));
  }
  tunnel.kill();
  const firstOk = (key: 'plain' | 'guarded' | 'direct') => samples.find((sample) => sample[key] === 'http 200')?.t ?? null;
  const row = {
    at: new Date(opened).toISOString(),
    run,
    secondsToUrl: (printed - opened) / 1_000,
    firstPlain200: firstOk('plain'),
    firstGuarded200: firstOk('guarded'),
    firstDirect200: firstOk('direct'),
    samples,
  };
  appendFileSync(output, `${JSON.stringify(row)}\n`);
  console.log(JSON.stringify({ ...row, samples: samples.slice(-1) }));
  await new Promise((resume) => setTimeout(resume, 3_000));
}
server.stop(true);
process.exit(0);
