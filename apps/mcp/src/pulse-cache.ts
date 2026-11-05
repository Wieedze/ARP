import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { ListedFile, ListingCache, RepositoryListing } from '@arp-protocol/core';

const DAY_MS = 86_400_000;
/** A list longer than this is a monorepo: keeping it would cost more than asking again. */
const MAX_FILES = 20_000;

type Stored = {
  readAt: string;
  rootTreeId: string;
  files: ListedFile[];
  trees: [string, string][];
  truncated: boolean;
};

const isStored = (value: unknown): value is Stored => {
  if (typeof value !== 'object' || value === null) return false;
  const row = value as Record<string, unknown>; // each field is checked next
  const isFile = (file: unknown): boolean => {
    if (typeof file !== 'object' || file === null) return false;
    const entry = file as Record<string, unknown>; // each field is checked next
    return typeof entry['path'] === 'string' && typeof entry['sha'] === 'string' && typeof entry['size'] === 'number';
  };
  return (
    typeof row['readAt'] === 'string' &&
    typeof row['rootTreeId'] === 'string' &&
    Array.isArray(row['files']) &&
    row['files'].every(isFile) &&
    Array.isArray(row['trees']) &&
    typeof row['truncated'] === 'boolean'
  );
};

/**
 * Each repository's file list on disk, read for a day and replaced when asked again, never deleted. The date it
 * was read is shown beside any result it served. A list a day old can miss a new file, and the files themselves
 * are always read fresh. It holds what GitHub publishes. With a scoped token it could hold a private repository's
 * file names, which is one more reason `docs/22` says to give a token no scopes.
 */
export function diskListingCache(directory: string, now: () => number = Date.now): ListingCache {
  const pathOf = (repo: string) => join(directory, `${createHash('sha256').update(repo).digest('hex')}.json`);
  return {
    async get(repo) {
      let stored: unknown;
      try {
        stored = JSON.parse(readFileSync(pathOf(repo), 'utf8'));
      } catch {
        return null; // absent or damaged: asking GitHub again is the answer to both
      }
      if (!isStored(stored)) return null;
      const age = now() - Date.parse(stored.readAt);
      if (!(age >= 0 && age < DAY_MS)) return null;
      const listing: RepositoryListing = {
        rootTreeId: stored.rootTreeId,
        files: stored.files,
        trees: new Map(stored.trees),
        truncated: stored.truncated,
        readAt: stored.readAt,
      };
      return listing;
    },
    async set(repo, listing) {
      if (listing.files.length > MAX_FILES) return;
      mkdirSync(directory, { recursive: true, mode: 0o700 });
      chmodSync(directory, 0o700); // `mode` above does not tighten a directory that already exists
      const stored: Stored = {
        readAt: new Date(now()).toISOString(),
        rootTreeId: listing.rootTreeId,
        files: [...listing.files],
        trees: [...listing.trees],
        truncated: listing.truncated,
      };
      writeFileSync(pathOf(repo), JSON.stringify(stored), { mode: 0o600 });
    },
  };
}
