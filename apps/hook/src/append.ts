import { closeSync, constants, lstatSync, openSync, writeSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Append to a file of ours, refusing a symbolic link. `.arp/` sits in a project that may be somebody else's,
 * and a repository can ship `.arp/session.jsonl` as a link to any file of the person's. It throws, and a hook
 * catches: a record not kept is better than a record kept somewhere else. `O_NOFOLLOW` does not exist on Windows.
 */
export function appendOwn(path: string, text: string): void {
  if (lstatSync(dirname(path)).isSymbolicLink()) throw new Error(`${dirname(path)} is a symbolic link`);
  const flags = constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | (constants.O_NOFOLLOW ?? 0);
  const fd = openSync(path, flags, 0o600);
  try {
    writeSync(fd, text);
  } finally {
    closeSync(fd);
  }
}
