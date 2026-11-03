import { expect, test } from 'vitest';

import { cappedText } from '../src/capped.js';

test('reads a body under the cap, and refuses one over it, declared or streamed', async () => {
  expect(await cappedText(new Response('{"a":1}'), 100)).toBe('{"a":1}');
  await expect(cappedText(new Response('x'.repeat(200)), 100)).rejects.toThrow(/over 100 bytes/);
  const declared = new Response('x', { headers: { 'content-length': '1000' } });
  await expect(cappedText(declared, 100)).rejects.toThrow(/over 100 bytes/);
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.enqueue(new Uint8Array(64));
    },
  });
  await expect(cappedText(new Response(stream), 1000)).rejects.toThrow(/over 1000 bytes/);
});
