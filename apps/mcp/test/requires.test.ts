import { describe, expect, it } from 'vitest';

import { requiresFor } from '../src/handlers/find-tools.js';

// Against the committed `data/catalogue/skill-requires.json` (task 56), so a rebuild that drops
// these two cases fails here.
describe('what a skill needs, in a search result', () => {
  it('shows the CLI a skill declares and the login line it mentions', () => {
    const lark = requiresFor('github.com/larksuite/cli?skill=lark-slides').requires;
    expect(lark?.cli).toEqual(['lark-cli']);
    expect(typeof lark?.mentions_login).toBe('string');

    expect(
      requiresFor('github.com/101-skills/superpowers?skill=landing-page-design').requires?.cli,
    ).toEqual(['belt']);
  });

  it('shows a command only the instructions run, for a skill listed after the first reading', () => {
    expect(
      requiresFor('github.com/softaworks/agent-toolkit?skill=web-to-markdown').requires?.runs,
    ).toEqual(['web2md']);
  });

  it('tells a file nobody read from a file that showed nothing', () => {
    expect(requiresFor('github.com/nobody/nothing?skill=none')).toEqual({ file_not_read: true });
    expect(requiresFor('github.com/vercel-labs/skills?skill=find-skills')).not.toHaveProperty(
      'file_not_read',
    );
  });

  it('adds nothing for a tool that is not a skill, or for no label', () => {
    expect(requiresFor('github.com/nobody/nothing')).toEqual({});
    expect(requiresFor(null)).toEqual({});
  });
});
