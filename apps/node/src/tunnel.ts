/** The node's one way in: a tunnel the operator rents, never one ARP builds or hosts (ADR `0094` §1).
 *
 *  The node binds `127.0.0.1` and nothing else. Cloudflare Tunnel (`cloudflared`) or ngrok opens an
 *  outbound connection from the operator's machine and serves a public `https://` hostname, so no
 *  port is opened and ARP carries none of the traffic.
 *
 *  | `ARP_NODE_TUNNEL`        | what happens                                                      |
 *  | ------------------------ | ----------------------------------------------------------------- |
 *  | unset or `auto`          | `ARP_NODE_PUBLIC_URL` if set, else `cloudflared`, else `ngrok`     |
 *  | `cloudflared` / `ngrok`  | that binary, found on `PATH`, started as a child of the node       |
 *  | `configured`             | nothing started: `ARP_NODE_PUBLIC_URL` is a tunnel you run yourself |
 *  | `none`                   | localhost only, for development. Nobody else can reach the node    |
 *
 *  **The first real tunnel is a Cloudflare quick tunnel** (task 39a): `cloudflared tunnel --url
 *  http://127.0.0.1:<port>`, no account, a `trycloudflare.com` hostname. Cloudflare's page
 *  (developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/,
 *  read 2026-10-30) says it needs no account or domain, has no uptime guarantee, takes 200
 *  in-flight requests before answering `429`, and does not carry Server-Sent Events — the node
 *  serves none. `--url` and `--no-autoupdate` were checked against `cloudflared tunnel --help` of
 *  cloudflared 2026.5.0.
 *
 *  **A quick tunnel's hostname changes on every start**, and so does a free ngrok session's. A
 *  binding made over one holds until the node restarts; after that the operator runs
 *  `arp init --node` again. A hostname that stays — a named Cloudflare tunnel, which needs the
 *  operator's Cloudflare account, or a reserved ngrok domain — is a follow-up, and is given here as
 *  `ARP_NODE_PUBLIC_URL` today.
 *
 *  Process handling is injected (`Spawn`), so tests drive a scripted child and never start a tunnel.
 */
import { spawn as spawnChild } from 'node:child_process';
import { accessSync, constants, statSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { createInterface } from 'node:readline';

import { normaliseEndpoint } from '@arp-protocol/core';

export type TunnelSpec =
  | { kind: 'cloudflared'; binary: string }
  | { kind: 'ngrok'; binary: string }
  | { kind: 'configured'; publicUrl: string }
  | { kind: 'none' };

/** A started child, reduced to what the tunnel needs: its output lines, its exit, a way to stop it. */
export type TunnelProcess = {
  onLine(listener: (line: string) => void): void;
  onExit(listener: (code: number | null) => void): void;
  kill(): void;
};
export type Spawn = (command: string, args: readonly string[]) => TunnelProcess;

export type RunningTunnel = {
  spec: TunnelSpec;
  /** `null` only for `none`. */
  publicUrl: string | null;
  /** Whether the hostname survives a restart. Only a configured one does. */
  stable: boolean;
  stop(): void;
};

export const DEFAULT_TUNNEL_TIMEOUT_MS = 30_000;

/** Whether `path` is a file this user may execute. */
export function isExecutable(path: string): boolean {
  try {
    if (!statSync(path).isFile()) return false;
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** The first `name` on `PATH` that `executable` accepts, or `null`. */
export function findOnPath(
  name: string,
  path: string | undefined,
  executable: (path: string) => boolean,
): string | null {
  for (const dir of (path ?? '').split(delimiter)) {
    if (dir.length === 0) continue;
    const candidate = join(dir, name);
    if (executable(candidate)) return candidate;
  }
  return null;
}

/** Reads `ARP_NODE_TUNNEL`, `ARP_NODE_PUBLIC_URL` and `PATH`. `process.env` is one. */
type TunnelEnv = Readonly<Record<string, string | undefined>>;

/** Which tunnel the environment asks for, or why it cannot have one. Starts nothing. */
export function chooseTunnel(
  env: TunnelEnv,
  executable: (path: string) => boolean = isExecutable,
): TunnelSpec | Error {
  const mode = (env['ARP_NODE_TUNNEL'] ?? 'auto').trim().toLowerCase();
  const configured = (): TunnelSpec | Error => {
    const raw = env['ARP_NODE_PUBLIC_URL'];
    if (raw === undefined || raw.trim() === '') {
      return new Error('ARP_NODE_TUNNEL=configured needs ARP_NODE_PUBLIC_URL');
    }
    const publicUrl = normaliseEndpoint(raw);
    if (publicUrl === null) {
      return new Error(`ARP_NODE_PUBLIC_URL must be an https URL without credentials, got ${raw}`);
    }
    return { kind: 'configured', publicUrl };
  };
  const binary = (kind: 'cloudflared' | 'ngrok'): TunnelSpec | Error => {
    const found = findOnPath(kind, env['PATH'], executable);
    return found === null ? new Error(`${kind} is not on PATH`) : { kind, binary: found };
  };

  switch (mode) {
    case 'none':
      return { kind: 'none' };
    case 'configured':
      return configured();
    case 'cloudflared':
    case 'ngrok':
      return binary(mode);
    case 'auto': {
      if (env['ARP_NODE_PUBLIC_URL'] !== undefined && env['ARP_NODE_PUBLIC_URL'].trim() !== '') {
        return configured();
      }
      const cloudflared = binary('cloudflared');
      if (!(cloudflared instanceof Error)) return cloudflared;
      const ngrok = binary('ngrok');
      if (!(ngrok instanceof Error)) return ngrok;
      return new Error(
        'no tunnel: install cloudflared or ngrok, or set ARP_NODE_PUBLIC_URL to a tunnel you run. ' +
          'ARP_NODE_TUNNEL=none serves localhost only.',
      );
    }
    default:
      return new Error(
        `ARP_NODE_TUNNEL must be auto, cloudflared, ngrok, configured or none, got ${mode}`,
      );
  }
}

/** The arguments each binary is started with, pointing at the node's loopback address. */
export function tunnelArgs(kind: 'cloudflared' | 'ngrok', localUrl: string): string[] {
  return kind === 'cloudflared'
    ? ['tunnel', '--no-autoupdate', '--url', localUrl]
    : ['http', localUrl, '--log', 'stdout', '--log-format', 'json'];
}

const QUICK_TUNNEL = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/;

/** The public URL in one line of a tunnel's output, or `null` when the line does not carry it. */
export function publicUrlFrom(kind: 'cloudflared' | 'ngrok', line: string): string | null {
  if (kind === 'cloudflared') return QUICK_TUNNEL.exec(line)?.[0] ?? null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const url = (parsed as Record<string, unknown>)['url'];
  return typeof url === 'string' ? normaliseEndpoint(url) : null;
}

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/**
 * Who sent a request, for the node's per-client rate limit.
 *
 * Behind a tunnel every request arrives from the tunnel's own loopback connection, so the socket
 * address is the same for every caller and one flood would spend everybody's allowance. Both
 * tunnels name the caller in a header — Cloudflare in `cf-connecting-ip`, ngrok in
 * `x-forwarded-for` — and the header is trusted **only on a loopback socket**, which is the only
 * socket the node listens on. A local process can set the header too; it could already reach the
 * port.
 */
export function clientAddress(request: Request, socketIp: string): string {
  if (!LOOPBACK.has(socketIp)) return socketIp;
  const cloudflare = request.headers.get('cf-connecting-ip')?.trim();
  if (cloudflare !== undefined && cloudflare !== '') return cloudflare;
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (forwarded !== undefined && forwarded !== '') return forwarded;
  return socketIp;
}

/** A real child process, its stdout and stderr merged into lines. */
export const spawnProcess: Spawn = (command, args) => {
  const child = spawnChild(command, [...args], { stdio: ['ignore', 'pipe', 'pipe'] });
  const lineListeners: ((line: string) => void)[] = [];
  for (const stream of [child.stdout, child.stderr]) {
    createInterface({ input: stream }).on('line', (line) => {
      for (const listener of lineListeners) listener(line);
    });
  }
  return {
    onLine: (listener) => lineListeners.push(listener),
    onExit: (listener) => child.on('exit', (code) => listener(code)),
    kill: () => child.kill('SIGTERM'),
  };
};

/**
 * Start the chosen tunnel in front of `localUrl` and resolve with its public URL.
 *
 * A binary that exits, or prints no URL within `timeoutMs`, rejects and is stopped: a node that
 * believes it is reachable when it is not is worse than one that says it is not.
 */
export function startTunnel(
  spec: TunnelSpec,
  localUrl: string,
  options: {
    spawn?: Spawn;
    timeoutMs?: number;
    /** Called if the tunnel exits after it was up: the node is unreachable from then on. */
    onDown?: (code: number | null) => void;
  } = {},
): Promise<RunningTunnel> {
  if (spec.kind === 'none') {
    return Promise.resolve({ spec, publicUrl: null, stable: false, stop: () => {} });
  }
  if (spec.kind === 'configured') {
    return Promise.resolve({ spec, publicUrl: spec.publicUrl, stable: true, stop: () => {} });
  }
  const { kind } = spec;
  const child = (options.spawn ?? spawnProcess)(spec.binary, tunnelArgs(kind, localUrl));
  const timeoutMs = options.timeoutMs ?? DEFAULT_TUNNEL_TIMEOUT_MS;
  return new Promise((resolve, reject) => {
    let state: 'pending' | 'up' | 'failed' | 'stopped' = 'pending';
    const fail = (message: string) => {
      if (state !== 'pending') return;
      state = 'failed';
      clearTimeout(timer);
      child.kill();
      reject(new Error(message));
    };
    const timer = setTimeout(
      () => fail(`${kind} printed no public URL within ${timeoutMs} ms`),
      timeoutMs,
    );
    child.onLine((line) => {
      if (state !== 'pending') return;
      const publicUrl = publicUrlFrom(kind, line);
      if (publicUrl === null) return;
      state = 'up';
      clearTimeout(timer);
      const stop = () => {
        state = 'stopped';
        child.kill();
      };
      resolve({ spec, publicUrl, stable: false, stop });
    });
    child.onExit((code) => {
      if (state === 'up') options.onDown?.(code);
      else fail(`${kind} exited (${code ?? 'signal'}) before printing a public URL`);
    });
  });
}
