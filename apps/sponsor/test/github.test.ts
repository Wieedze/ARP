import { afterEach, describe, expect, it, mock } from 'bun:test';

import { resolveOnGitHub } from '../src/github.ts';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** GitHub as far as the repository read: a tree read after it would mean the check let it through. */
function githubAnswers(repo: Record<string, unknown>): string[] {
  const asked: string[] = [];
  // A stand-in for `fetch`: only the two paths `resolveOnGitHub` asks for are reached.
  globalThis.fetch = mock(async (url: string | URL | Request) => {
    asked.push(String(url));
    return String(url).includes('/git/trees/')
      ? Response.json({ tree: [{ path: 'skills/thing/SKILL.md', type: 'blob', sha: 'abc' }] })
      : Response.json(repo);
  }) as unknown as typeof fetch;
  return asked;
}

describe('a repository that is not public', () => {
  it('is refused, even when a token can read it', async () => {
    const asked = githubAnswers({ full_name: 'acme/secret', private: true });
    const answer = await resolveOnGitHub('https://github.com/acme/secret?skill=thing', 'a-token');
    expect(answer).toEqual({ ok: false, reason: 'github.com/acme/secret is not public' });
    expect(asked.some((url) => url.includes('/git/trees/'))).toBe(false);
  });

  it('is refused when GitHub does not say it is public', async () => {
    githubAnswers({ full_name: 'acme/secret' });
    const answer = await resolveOnGitHub('https://github.com/acme/secret', 'a-token');
    expect(answer.ok).toBe(false);
  });

  it('lets a public repository through', async () => {
    githubAnswers({ full_name: 'acme/open', private: false });
    expect(await resolveOnGitHub('https://github.com/acme/open?skill=thing')).toEqual({
      ok: true,
      fullName: 'acme/open',
    });
  });
});
