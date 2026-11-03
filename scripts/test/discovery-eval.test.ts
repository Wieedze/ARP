import { expect, test } from 'bun:test';

import { agentByName, references } from '../measure/discovery-eval.ts';

test('finds repositories and packages however an answer writes them', () => {
  const answer = [
    'See https://github.com/remotion-dev/skills.git, or run `npx skills add higgsfield-ai/skills`.',
    'Browse skills.sh/anthropics/skills. For the MCP server: `claude mcp add pg -- npx -y @modelcontextprotocol/server-postgres`.',
    'Or `npm install -g vercel`. Also github.com/remotion-dev/skills again.',
  ].join('\n');
  expect(references(answer)).toEqual([
    { kind: 'github', name: 'remotion-dev/skills' },
    { kind: 'github', name: 'anthropics/skills' },
    { kind: 'github', name: 'higgsfield-ai/skills' },
    { kind: 'npm', name: '@modelcontextprotocol/server-postgres' },
    { kind: 'npm', name: 'vercel' },
  ]);
});

test('reads every package of a pip line, without extras or versions', () => {
  expect(references('`pip install -U pillow rembg[gpu] opencv-python==4.9`')).toEqual([
    { kind: 'pip', name: 'pillow' },
    { kind: 'pip', name: 'rembg' },
    { kind: 'pip', name: 'opencv-python' },
  ]);
});

test('does not take the skills CLI for a package', () => {
  expect(references('Run `npx skills find thumbnails`.')).toEqual([]);
});

test('reads the forms an answer from memory uses', () => {
  const answer = [
    'Anthropic publishes these in `anthropics/skills`: run `/plugin marketplace add anthropics/skills`.',
    'For voice: `claude mcp add elevenlabs -- uvx elevenlabs-mcp`. Your config lives in `~/.claude/settings.json`,',
    'and the code in `src/index.ts`. Copy the `skills/pptx` folder into place.',
  ].join('\n');
  expect(references(answer)).toEqual([
    { kind: 'github', name: 'anthropics/skills' },
    { kind: 'pip', name: 'elevenlabs-mcp' },
  ]);
});

test('calls a name a skill or MCP server only on the catalogue or an mcp name', () => {
  const catalogueLower = '{"url": "https://github.com/higgsfield-ai/skills?skill=x", "npm": "remotion"}';
  expect(agentByName('Higgsfield-AI/skills', catalogueLower)).toBe(true);
  expect(agentByName('remotion', catalogueLower)).toBe(true);
  expect(agentByName('@playwright/mcp', catalogueLower)).toBe(true);
  expect(agentByName('python-pillow/Pillow', catalogueLower)).toBeNull();
});
