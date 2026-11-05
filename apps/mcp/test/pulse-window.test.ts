import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { PulseSource, RepositoryListing, SkillSearchResult } from '@arp-protocol/core';
import { describe, expect, it } from 'vitest';

import { diskListingCache } from '../src/pulse-cache.js';
import { readWindow } from '../src/pulse-window.js';

const results: SkillSearchResult[] = Array.from({ length: 20 }, (_, index) => ({
  source: `owner/repo${index}`,
  skill: 'wanted',
  installs: '1',
  installsText: '1',
  url: `https://skills.sh/owner/repo${index}/wanted`,
  queries: [],
})) as unknown as SkillSearchResult[]; // only the fields the reader uses

function source(failFrom = Infinity) {
  let listings = 0;
  const reader: PulseSource = {
    listing: async (repo) => {
      listings += 1;
      if (listings > failFrom) return 'rate_limited';
      return {
        rootTreeId: repo,
        files: [{ path: 'skills/wanted/SKILL.md', sha: `${repo}-f`, size: 1 }],
        trees: new Map([['skills/wanted', repo]]),
        truncated: false,
      };
    },
    file: async () => '---\nname: wanted\n---\nbody',
    repository: async () => null,
  };
  return { reader, count: () => listings };
}
const never = () => false;

describe('readWindow', () => {
  it('reads only as many as asked with no token', async () => {
    const { reader, count } = source();
    const pulses = await readWindow(results, reader, { limit: 5, hasToken: false, setAside: never });
    expect(pulses).toHaveLength(5);
    expect(count()).toBe(5);
  });

  it('reads the whole window with a token, for the copies', async () => {
    const { reader } = source();
    expect(await readWindow(results, reader, { limit: 5, hasToken: true, setAside: never })).toHaveLength(15);
  });

  it('reads further when a person\'s constraints set results aside, within the window', async () => {
    const { reader } = source();
    const pulses = await readWindow(results, reader, {
      limit: 2,
      hasToken: false,
      setAside: (pulse) => pulse.source === 'owner/repo0' || pulse.source === 'owner/repo1',
    });
    expect(pulses).toHaveLength(4);
  });

  it('keeps what it read when the limit comes in the middle', async () => {
    const { reader } = source(2);
    const pulses = await readWindow(results, reader, { limit: 5, hasToken: false, setAside: never });
    expect(pulses.slice(0, 2).map((pulse) => pulse.status)).toEqual(['read', 'read']);
    expect(pulses.at(-1)?.status).not.toBe('read');
  });
});

describe('diskListingCache', () => {
  const listing: RepositoryListing = {
    rootTreeId: 'r',
    files: [{ path: 'SKILL.md', sha: 'f', size: 1 }],
    trees: new Map([['a', 'b']]),
    truncated: false,
  };
  const start = Date.parse('2026-11-05T20:00:00.000Z');

  it('gives a list back within a day, with the date it was read', async () => {
    const directory = join(mkdtempSync(join(tmpdir(), 'arp-listing-')), 'cache');
    let now = start;
    const cache = diskListingCache(directory, () => now);
    expect(await cache.get('a/b')).toBeNull();
    await cache.set('a/b', listing);
    now = start + 3_600_000;
    const back = await cache.get('a/b');
    expect(back?.readAt).toBe('2026-11-05T20:00:00.000Z');
    expect(back?.trees.get('a')).toBe('b');
  });

  it('asks again after a day', async () => {
    const directory = join(mkdtempSync(join(tmpdir(), 'arp-listing-')), 'cache');
    let now = start;
    const cache = diskListingCache(directory, () => now);
    await cache.set('a/b', listing);
    now = start + 86_400_000;
    expect(await cache.get('a/b')).toBeNull();
  });
});

describe('readWindow against a time limit', () => {
  const silent: PulseSource = {
    listing: () => new Promise((_, reject) => setTimeout(() => reject(new Error('no answer')), 20)),
    file: async () => null,
    repository: async () => null,
  };

  it('starts no further read once the signal fired, and returns what it has', async () => {
    const stop = new AbortController();
    setTimeout(() => stop.abort(), 30);
    const read = await readWindow(results, silent, {
      limit: 5,
      hasToken: true,
      setAside: () => false,
      signal: stop.signal,
    });
    expect(read.length).toBeGreaterThan(0);
    expect(read.length).toBeLessThan(15);
    expect(read.every((row) => row.status === 'repository_unreachable')).toBe(true);
  });
});
