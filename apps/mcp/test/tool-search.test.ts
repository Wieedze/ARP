import { describe as group, expect, it } from 'vitest';

import {
  cachedFor,
  collapseCopies,
  describe,
  keyOf,
  matchOf,
  pageOf,
  rankOf,
  relevance,
  shortPurpose,
} from '../src/tool-search.js';

const catalogue = new Map([
  [
    'github.com/stripe/stripe-node',
    { title: 'Stripe Node', purpose: 'Accept card payments. And more.' },
  ],
]);
const skills = new Map([
  [
    'github.com/remotion-dev/skills?skill=remotion-render',
    { description: 'Render videos with Remotion, then export them as MP4.', installs: 1200 },
  ],
]);

group('describe', () => {
  it('names a skill by its skill name and gives one sentence of its description', () => {
    const about = describe(
      'github.com/remotion-dev/skills?skill=remotion-render',
      catalogue,
      skills,
    );
    expect(about).toMatchObject({
      name: 'remotion-render',
      purpose: 'Render videos with Remotion, then export them as MP4.',
      installs: 1200,
    });
  });

  it("names a catalogued tool by its title, whatever the label's scheme or case", () => {
    const about = describe('https://GitHub.com/stripe/stripe-node/', catalogue, skills);
    expect(about).toMatchObject({
      name: 'Stripe Node',
      purpose: 'Accept card payments.',
      installs: null,
    });
  });

  it('falls back to the address when nobody described the tool', () => {
    expect(describe('github.com/someone/thing', catalogue, skills)).toMatchObject({
      name: 'github.com/someone/thing',
      purpose: null,
    });
  });
});

group('relevance', () => {
  const render = describe(
    'github.com/remotion-dev/skills?skill=remotion-render',
    catalogue,
    skills,
  );

  it('matches words of the description the name does not carry', () => {
    expect(relevance('export mp4', render)).toBeGreaterThan(0);
  });

  it('counts a word in the name above a word in the description', () => {
    expect(relevance('render', render)).toBeGreaterThan(relevance('export', render));
  });

  it('finds a word by its root', () => {
    expect(relevance('renders', render)).toBeGreaterThan(0);
  });

  it('ranks a tool holding every word above one holding the loudest word twice', () => {
    const both = describe(
      'github.com/a/b?skill=clip',
      catalogue,
      new Map([
        ['github.com/a/b?skill=clip', { description: 'Video editing for clips.', installs: null }],
      ]),
    );
    const one = describe(
      'github.com/a/b?skill=video-video',
      catalogue,
      new Map([
        ['github.com/a/b?skill=video-video', { description: 'Video generation.', installs: null }],
      ]),
    );
    expect(relevance('video editing', both)).toBeGreaterThan(relevance('video editing', one));
  });

  it('is zero when one word of the query is missing', () => {
    const cards = describe(
      'github.com/a/b?skill=orbit-card',
      catalogue,
      new Map([['github.com/a/b?skill=orbit-card', { description: 'A feature card orbits a sphere.', installs: null }]]),
    );
    expect(relevance('card payments', cards)).toBe(0);
    expect(relevance('card', cards)).toBeGreaterThan(0);
  });

  it('ignores the words that say nothing about the need', () => {
    expect(relevance('a tool to export my mp4', render)).toBe(relevance('export mp4', render));
  });

  it('matches at the start of a word, not inside one', () => {
    const terraform = describe(
      'github.com/h/t',
      new Map([['github.com/h/t', { title: 'Terraform', purpose: 'A platform for performance.' }]]),
      skills,
    );
    expect(relevance('form', terraform)).toBe(0);
  });

  it('is zero when no word matches', () => {
    expect(relevance('email', render)).toBe(0);
  });
});

group('shortPurpose', () => {
  it('cuts a long sentence at a word and marks the cut', () => {
    const cut = shortPurpose(`${'word '.repeat(60)}end.`);
    expect(cut?.endsWith('…')).toBe(true);
    expect((cut ?? '').length).toBeLessThanOrEqual(141);
  });

  it('keys labels the same way both lookups do', () => {
    expect(keyOf('https://Example.com/x/')).toBe('example.com/x');
  });
});

group('collapseCopies', () => {
  const about = (installs: number | null) => ({
    name: 'product-photography',
    purpose: 'Shoot products.',
    text: '',
    installs,
  });

  it('keeps the copy an agent declared over a more installed one, and counts the copies', () => {
    const declared = { about: about(49_809), declarations: 1, id: 'declared' };
    const popular = { about: about(57_291), declarations: 0, id: 'popular' };
    const [kept, ...rest] = collapseCopies([popular, declared], (entry) => entry.declarations);
    expect(rest).toEqual([]);
    expect(kept).toMatchObject({ id: 'declared', copies: 2 });
  });

  it('breaks a tie on declarations by installs, and keeps a different purpose apart', () => {
    const a = { about: about(10), declarations: 0, id: 'a' };
    const b = { about: about(20), declarations: 0, id: 'b' };
    const other = {
      about: { ...about(5), purpose: 'Something else.' },
      declarations: 0,
      id: 'other',
    };
    const kept = collapseCopies([a, other, b], (entry) => entry.declarations);
    expect(kept.map((entry) => [entry.id, entry.copies])).toEqual([
      ['b', 2],
      ['other', 1],
    ]);
  });
});

group('pageOf', () => {
  it('gives a page, the total, and the next offset until the last page', () => {
    expect(pageOf([1, 2, 3, 4, 5], 0, 2)).toEqual({ rows: [1, 2], total: 5, nextOffset: 2 });
    expect(pageOf([1, 2, 3, 4, 5], 4, 2)).toEqual({ rows: [5], total: 5, nextOffset: null });
    expect(pageOf([1, 2], 5, 2)).toEqual({ rows: [], total: 2, nextOffset: null });
  });
});

group('rankOf', () => {
  it('lets usage lift a match past a better-worded one', () => {
    expect(rankOf(2, 12)).toBeGreaterThan(rankOf(4, 0));
    expect(rankOf(2, 1)).toBeLessThan(rankOf(4, 0));
  });

  it('keeps the words when nobody declared anything', () => {
    expect(rankOf(3, 0)).toBe(3);
    expect(rankOf(0, 50)).toBe(0);
  });
});

group('matchOf', () => {
  const page = {
    name: 'webpage-to-markdown',
    purpose: null,
    text: 'webpage-to-markdown converts a public url into clean markdown',
    installs: null,
  };

  it('finds two words side by side written as one', () => {
    expect(matchOf('web page', page)).toEqual({ score: 4, missed: 0 });
  });

  it('lets one word of three go missing, and says so', () => {
    expect(matchOf('markdown url invoice', page)).toEqual({ score: 3, missed: 1 });
  });

  it('never lets a word of two go missing', () => {
    expect(matchOf('markdown invoice', page).score).toBe(0);
  });

  it('never lets two words of four go missing', () => {
    expect(matchOf('markdown url invoice receipt', page).score).toBe(0);
  });
});

group('cachedFor', () => {
  it('reads once inside the window and again after it', async () => {
    let clock = 0;
    let reads = 0;
    const read = cachedFor(
      100,
      async (key) => {
        reads += 1;
        return key;
      },
      () => clock,
    );
    await Promise.all([read('a'), read('a')]);
    clock = 99;
    await read('a');
    expect(reads).toBe(1);
    await read('b');
    expect(reads).toBe(2);
    clock = 100;
    await read('a');
    expect(reads).toBe(3);
  });

  it('forgets a read that failed', async () => {
    let reads = 0;
    const read = cachedFor(100, async () => {
      reads += 1;
      if (reads === 1) throw new Error('down');
      return 'up';
    });
    await expect(read('a')).rejects.toThrow('down');
    await expect(read('a')).resolves.toBe('up');
  });
});
