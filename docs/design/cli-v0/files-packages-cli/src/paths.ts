import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Where ARP keeps its state on this machine: `~/.arp`, or `ARP_HOME` when set.
 *
 * The override exists for tests and for a user who wants the database elsewhere. It is read on
 * every call rather than once, so a test can point two runs at two directories.
 */
export function arpHome(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.ARP_HOME;
  return override !== undefined && override.length > 0 ? override : join(homedir(), '.arp');
}

export function dbPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(arpHome(env), 'arp.db');
}
