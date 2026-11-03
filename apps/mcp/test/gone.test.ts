import { describe, expect, it } from 'vitest';

import { isGone } from '../src/handlers/find-tools.js';

// Against the committed `data/catalogue/skill-gone.json`, so a rebuild that drops these fails here.
describe('a skill the content server refused, in a search', () => {
  it('is not offered when it is gone at HEAD', () => {
    expect(isGone('github.com/heygen-com/hyperframes?skill=embedded-captions')).toBe(true);
  });

  it('is offered when it is served, or has no label', () => {
    expect(isGone('github.com/remotion-dev/skills?skill=remotion-captions')).toBe(false);
    expect(isGone('github.com/heygen-com/hyperframes?skill=hyperframes')).toBe(false);
    expect(isGone(null)).toBe(false);
  });
});
