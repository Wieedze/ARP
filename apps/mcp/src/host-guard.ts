import { promises as dns } from 'node:dns';

import type { ResolveHost } from '@arp-protocol/core';

/**
 * Every address `hostname` resolves to, through the system resolver: the addresses a connection
 * would use. A name pointing at `127.0.0.1` or `169.254.169.254` is then refused before anything is
 * sent there, which the literal check in the package cannot see.
 *
 * Not a boundary: `fetch` resolves the name again when it connects, so DNS rebinding between the
 * two lookups stays open (`packages/protocol/src/verify/probe.ts`, `privateProbeTarget`).
 */
export const resolveWithDns: ResolveHost = async (hostname) =>
  (await dns.lookup(hostname, { all: true })).map((entry) => entry.address);

/** What every fetch of a URL somebody else supplied is guarded with on this server. */
export type HostGuard = { allowPrivate: boolean; resolveHost?: ResolveHost };

/**
 * `ARP_ALLOW_PRIVATE_PROBE=1` lets private addresses through, for a rig probing its own endpoints,
 * and then nothing is resolved. Otherwise every hop's name is resolved and checked.
 */
export function hostGuard(
  env: Record<string, string | undefined> = process.env,
  resolveHost: ResolveHost = resolveWithDns,
): HostGuard {
  return env['ARP_ALLOW_PRIVATE_PROBE'] === '1'
    ? { allowPrivate: true }
    : { allowPrivate: false, resolveHost };
}
