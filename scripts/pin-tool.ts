/**
 * Pin the canonical Thing for a tool URL, so its atom is readable rather than a bare id.
 *
 *   bun run scripts/pin-tool.ts https://github.com/crytic/slither [more urls…]
 *
 * Signs nothing and creates no on-chain state. Pinning is content-addressed, so re-running is
 * idempotent: the same URL always yields the same document, the same CID and the same atom id —
 * which is the whole point of deriving the Thing from the URL (`declare/tool-thing.ts`).
 *
 * The atom can be created, declared and staked without this. What pinning buys is that a reader
 * sees `github.com/crytic/slither` instead of a hash: Intuition's indexer resolves `value.thing`
 * from the CID. Same split as the identity atom's (ADR `0016`) — the plan needs no credential, the
 * readability does.
 *
 * Exits non-zero if the API's serialisation disagrees with the local recipe, because a mismatch
 * means the bytes that got pinned are not the bytes the atom id derives from.
 */
import { pinThing } from './helpers/intuition-pin.js';
import { requirePinAuth } from './helpers/pin-env.js';
import { DEFAULT_HEADER_NAME } from '../apps/web/src/services/intuition-pin.js';
import {
  isToolUrl,
  normaliseToolUrl,
  toolAtomUri,
  toolThing,
} from '../packages/protocol/src/declare/tool-thing.js';

const urls = process.argv.slice(2);
if (urls.length === 0) {
  console.error('usage: bun run scripts/pin-tool.ts <tool-url> [more…]');
  process.exit(2);
}

// `requirePinAuth` is the only sanctioned constructor of the branded credential (ADR `0016`);
// `pinThing` here takes the plain shape, so the optional header name is resolved once.
const credential = requirePinAuth();
const auth = {
  apiKey: credential.apiKey,
  headerName: credential.headerName ?? DEFAULT_HEADER_NAME,
};
let failed = 0;

for (const raw of urls) {
  if (!isToolUrl(raw)) {
    console.error(`${raw}\n  SKIP  not an http(s) URL, so no Thing can be derived from it`);
    failed += 1;
    continue;
  }
  const normalised = normaliseToolUrl(raw);
  const expected = toolAtomUri(normalised);
  const result = await pinThing(toolThing(normalised), auth);

  console.log(raw);
  if (raw !== normalised) console.log(`  normalised ${normalised}`);
  if (result.status !== 200 || result.uri === undefined) {
    console.log(`  FAIL  http=${result.status} ${result.body.slice(0, 200)}`);
    failed += 1;
    continue;
  }
  if (result.uri !== expected) {
    console.log(`  FAIL  pinned ${result.uri}\n        expected ${expected}`);
    failed += 1;
    continue;
  }
  console.log(`  ok    ${result.uri}`);
}

process.exit(failed === 0 ? 0 : 1);
