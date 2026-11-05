/** The hired agent's job in `agent-pulse-walk.ts`: small, real, and checkable by the hirer. */
import { createHash } from 'node:crypto';

export const offer = {
  description: 'Counts the words and headings of a text and gives its sha256.',
  input: '{"text": "<the text>"}',
  output: '{"words": <number>, "headings": <number>, "sha256": "<hex>"}',
};

export type DocumentFacts = { words: number; headings: number; sha256: string };

export function documentFacts(text: string): DocumentFacts {
  return {
    words: text.split(/\s+/).filter((word) => word.length > 0).length,
    headings: text.split('\n').filter((line) => /^#{1,6}\s/.test(line)).length,
    sha256: createHash('sha256').update(text).digest('hex'),
  };
}

export async function handle(payload: unknown): Promise<DocumentFacts> {
  const text = (payload as { text?: unknown } | null)?.text; // narrowed on the next line
  if (typeof text !== 'string') throw new Error('payload.text must be a string');
  return documentFacts(text);
}
