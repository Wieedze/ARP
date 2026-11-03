import { describe, expect, it, vi } from 'vitest';

import { fileCategory } from '../src/desktop/file-category.js';

const ID = `0x${'c'.repeat(64)}`;
const answering = (status: number, body: unknown) =>
  vi.fn(async (_url: string, _init: RequestInit) => new Response(JSON.stringify(body), { status }));

describe('arp_file_category', () => {
  it('files under an existing category with only the label and the subject', async () => {
    const fetch = answering(200, { label: 'design', newCategory: false, created: true });
    const answer = await fileCategory(
      { id: ID, category: 'design' },
      { sponsorUrl: 'http://sponsor', fetch },
    );
    expect(fetch).toHaveBeenCalledWith('http://sponsor/propose-category', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ label: 'design', subjectId: ID }),
    });
    expect(answer).toEqual({ filed: 'design', new_category: false, written: true });
  });

  it('passes a parent and a reason for a new category, and reports a refusal by its rule', async () => {
    const fetch = answering(422, { error: 'say why no existing category fits', rule: 'reason' });
    const answer = await fileCategory(
      { id: ID, category: 'slides', parent: 'design' },
      { sponsorUrl: 'http://sponsor', fetch },
    );
    expect(
      JSON.parse(
        String(
          (fetch.mock.calls[0] as unknown[])[1] && (fetch.mock.calls[0]![1] as RequestInit).body,
        ),
      ),
    ).toEqual({
      label: 'slides',
      subjectId: ID,
      parent: 'design',
    });
    expect(answer).toEqual({ refused: 'reason', detail: 'say why no existing category fits' });
  });

  it('says so when the sponsor is not running', async () => {
    const down = vi.fn(async (_url: string, _init: RequestInit): Promise<Response> => {
      throw new TypeError('fetch failed');
    });
    expect(
      await fileCategory(
        { id: ID, category: 'design' },
        { sponsorUrl: 'http://sponsor', fetch: down },
      ),
    ).toEqual({
      error: "ARP's sponsor is not reachable, so the category was not filed.",
    });
  });
});
