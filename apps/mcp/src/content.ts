/** The server's content path: the IO behind `GET /content/:atomId`.
 *
 *  The decisions are in `packages/protocol/src/content-serve.ts`, which holds no key and touches no
 *  network. This file is the transport: it reads the key, caches the listings, does the two fetches
 *  and shapes the HTTP. Same split as the rest of `apps/mcp` (`rules/portability.md`).
 *
 *  ## The key, and what an operator is trusting
 *
 *  ADR `0080`, resolved on the user's decision 2026-10-29: **both kinds of server sign.** The server an
 *  operator installs holds its own key, and so does a server somebody else runs. The receipt names
 *  its signer and a reader compares that to the address that declared — same hand, and the receipt
 *  corroborates nobody. `corroborationOf` is that comparison.
 *
 *  So this generates a key on first run rather than asking for one:
 *
 *  ```
 *  ARP_RECEIPT_KEY=0x…   a key the operator manages. For a hosted server
 *  .arp/receipt-key      generated on first run, mode 0600, gitignored
 *  ARP_NO_RECEIPTS=1     no key at all. The content path still works
 *  ```
 *
 *  **A generated key cannot move value.** It is not a wallet, it never holds TRUST, and it is not
 *  the key any plan is signed with — the plan path still has none (ADR `0038`). Losing it lets
 *  somebody forge corroboration under this server's name; it lets them spend nothing. A reader who
 *  stops accepting the signer is back to the declaration they already had.
 *
 *  **`ARP_RECEIPT_KEY` is the operator's own risk, and this is a convention rather than a
 *  guarantee.** Nothing here can tell a funded key from an empty one, so hand the server a funded
 *  key and ADR `0080` constraint 3 is broken by configuration. It warns and carries on, because
 *  refusing would need a balance read on every chain the key might hold value on. The earlier
 *  wording of this paragraph stated flatly that the key *cannot* move value, which was a property
 *  of the generated key read as a property of the module.
 *
 *  **Only the address is ever printed.** The key is read, used and never logged, never returned in
 *  a response, and never sent anywhere.
 *
 *  ## What is cached and what is not
 *
 *  A repository's file listing, for `LISTING_TTL_MS`. It is public metadata and it is what saves a
 *  tree request per fetch. **The content is never cached** — it is read from the origin and passed
 *  through, because a cache of bytes is a mirror and a mirror is a different product with different
 *  obligations (`tasks/31` §9).
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import type { Address, Hex } from 'viem';

import { SKILL_CATALOGUES } from './data.js';

import {
  type ContentAnswer,
  contentIndexOf,
  recoverContentRequester,
  type RepositoryFile,
  serveContent,
  type TypedDataSigner,
} from '@arp-protocol/core';

/** A listing changes when somebody pushes. Ten minutes is a compromise nobody has measured. */
const LISTING_TTL_MS = 10 * 60 * 1000;
const FETCH_TIMEOUT_MS = 15_000;
const KEY_PATH = '.arp/receipt-key';

export type CataloguedSkill = { repo: string; skill: string; url: string; atom: string | null };

const catalogues = new Map<number, CataloguedSkill[]>();

/**
 * The catalogue recorded for one chain, or an empty list.
 *
 * **Keyed by chain, never a single chain's file.** It was `import skills from
 * '../catalogue/skills-13579.json'` at module scope in a process whose chain is configurable, so a
 * server started on its default target — mainnet 1155 — served atom ids drawn from the testnet
 * record and stamped 1155 into every receipt's domain. `rules/portability.md` rule 1 names that
 * shape: no chain constant at module scope.
 *
 * `data.ts` holds every chain's record so a bundle carries them (ADR `0082`); the lookup is still
 * by the chain this server was started on. An absent chain is an empty catalogue and not an error. There is no `data/catalogue/skills-1155.json`
 * because no skill was seeded on mainnet, and the honest consequence is that a mainnet server knows
 * no skills — which the refusal says in those words.
 */
export function catalogueFor(chainId: number): CataloguedSkill[] {
  const held = catalogues.get(chainId);
  if (held !== undefined) return held;
  const rows = SKILL_CATALOGUES[chainId]?.skills ?? [];
  catalogues.set(chainId, rows);
  return rows;
}

const indexes = new Map<number, ReadonlyMap<string, string>>();

/**
 * Atom id to URL, for one chain's catalogue.
 *
 * 601 of 662 rows on 13579 carry a recorded id, 2026-10-29. **The other 61 do have atoms on
 * chain** — measured, every one of them `isTermCreated` — and what is missing is the recorded id in
 * the JSON, not the atom. So they are reported as `unrecorded` rather than unknown: saying "not
 * catalogued" about a tool that is in the catalogue was simply false.
 *
 * Deriving the missing ids is `calculateAtomId` on the MultiVault, a chain read, and confirmed by
 * measurement to be **not** plain `keccak256` of the same bytes — 0 of 662 agreed with a local
 * keccak (`scripts/measure/catalogue-atom-ids.ts`).
 * So it cannot be computed here, and a module that resolves identities must not need a chain to be
 * reachable.
 */
export function contentIndexFor(chainId: number): ReadonlyMap<string, string> {
  const held = indexes.get(chainId);
  if (held !== undefined) return held;
  const index = contentIndexOf(
    catalogueFor(chainId).map((row) => ({
      // Narrowed by `contentIndexOf`, which skips anything that is not a 0x string. The cast is
      // the shape the parameter asks for, not an assertion that the value is one.
      atom: row.atom as Hex,
      url: row.url,
    })),
  );
  indexes.set(chainId, index);
  return index;
}

/**
 * The signing identity, or null.
 *
 * Generated on first run so an installer has nothing to configure. The file is 0600 and `.arp/` is
 * gitignored; a key that lands in a commit is a key that is gone.
 */
export function receiptSigner(): TypedDataSigner | null {
  if (process.env['ARP_NO_RECEIPTS'] === '1') return null;

  const fromEnv = process.env['ARP_RECEIPT_KEY']?.trim();
  let key: Hex;
  if (fromEnv !== undefined && fromEnv.length > 0) {
    // The cast adds the prefix viem's type wants. `privateKeyToAccount` below throws on anything
    // that is not a key, so the validation is there rather than asserted here.
    key = (fromEnv.startsWith('0x') ? fromEnv : `0x${fromEnv}`) as Hex;
    // Nothing here can tell a funded key from an empty one, and reading a balance would need every
    // chain it might hold value on. So it says so once, loudly, on stderr — which is where a stdio
    // server's diagnostics go, because stdout is the protocol channel.
    console.error(
      'ARP_RECEIPT_KEY is set. A receipt key should be able to sign receipts and nothing else ' +
        '(ADR 0080): do not give this process a key that holds funds. Unset it to have one ' +
        'generated instead.',
    );
  } else if (existsSync(KEY_PATH)) {
    key = readFileSync(KEY_PATH, 'utf8').trim() as Hex;
  } else {
    key = generatePrivateKey();
    mkdirSync(dirname(KEY_PATH), { recursive: true });
    writeFileSync(KEY_PATH, `${key}\n`, { mode: 0o600 });
    chmodSync(KEY_PATH, 0o600);
  }

  const account = privateKeyToAccount(key);
  return {
    address: account.address,
    signTypedData: (data) => account.signTypedData(data),
  };
}

const listings = new Map<string, { at: number; files: RepositoryFile[] }>();

/**
 * A repository's SKILL.md paths and their blob shas, cached. One request per repository.
 *
 * The cache is ten minutes and the content is fetched live from `HEAD`, so the two can disagree:
 * after a push that makes two previously-identical paths differ, `resolveContentPath` can still
 * take its "identical sha, serve one and name the others" decision on the stale listing. The
 * **digest is always over the bytes actually served**, so the receipt stays honest about what was
 * served — it is `alsoAt` that can be wrong, and `alsoAt` is the field whose whole claim is that
 * choosing between those paths asserts nothing.
 */
async function listing(repo: string): Promise<readonly RepositoryFile[]> {
  const cached = listings.get(repo);
  if (cached !== undefined && Date.now() - cached.at < LISTING_TTL_MS) return cached.files;

  const headers: Record<string, string> = {
    accept: 'application/vnd.github+json',
    'user-agent': 'arp-node',
  };
  const token = process.env['GITHUB_TOKEN']?.trim();
  if (token !== undefined && token.length > 0) headers['authorization'] = `Bearer ${token}`;

  const response = await fetch(`https://api.github.com/repos/${repo}/git/trees/HEAD?recursive=1`, {
    headers,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  // A listing we could not read is not an empty repository. Serving `absent` from a rate limit
  // would publish a liveness claim about somebody's repository on the strength of our own quota.
  if (!response.ok) throw new Error(`listing ${repo}: HTTP ${response.status}`);

  const tree = (await response.json()) as { tree?: { path: string; type: string; sha: string }[] };
  const files: RepositoryFile[] = [];
  for (const entry of tree.tree ?? []) {
    if (entry.type !== 'blob') continue;
    files.push({ path: entry.path, sha: entry.sha });
  }
  listings.set(repo, { at: Date.now(), files });
  return files;
}

async function raw(url: string): Promise<{ code: number; bytes: Uint8Array }> {
  const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) return { code: response.status, bytes: new Uint8Array() };
  return { code: 200, bytes: new Uint8Array(await response.arrayBuffer()) };
}

/**
 * Who is asking, from the request's own query parameters.
 *
 * `?by=<address>&nonce=<bytes32>&sig=<signature>`. The address is recovered from the signature and
 * the claimed one is only used to fail fast, never believed — a mismatch is served as
 * unauthenticated rather than as an error, because an unauthenticated fetch is a served state.
 */
async function requester(
  atomId: string,
  params: URLSearchParams,
  chainId: number,
): Promise<{ to: Address | null; nonce: Hex }> {
  const nonceRaw = params.get('nonce');
  const nonce = /^0x[0-9a-fA-F]{64}$/.test(nonceRaw ?? '')
    ? (nonceRaw as Hex)
    : (`0x${'00'.repeat(32)}` as Hex);

  const signature = params.get('sig');
  if (signature === null || !/^0x[0-9a-fA-F]+$/.test(signature)) return { to: null, nonce };

  const recovered = await recoverContentRequester(
    atomId.toLowerCase() as Hex,
    nonce,
    chainId,
    signature as Hex,
  );
  const claimed = params.get('by');
  if (claimed !== null && recovered !== null && claimed.toLowerCase() !== recovered.toLowerCase()) {
    return { to: null, nonce };
  }
  return { to: recovered, nonce };
}

/** What each refusal is, as a status and a sentence. A caller that cannot tell them apart retries wrong. */
function refusal(answer: ContentAnswer, chainId: number): { code: number; reason: string } {
  switch (answer.status) {
    case 'bad-atom-id':
      return { code: 400, reason: 'an atom id is 0x followed by 64 hex characters' };
    case 'unknown-atom':
      return {
        code: 404,
        reason:
          `no tool with that atom id is recorded for chain ${chainId}. Either it is not ` +
          'catalogued, or it is catalogued with no atom id recorded — 61 of 662 rows on 13579 ' +
          'are the second case, and their atoms do exist on chain',
      };
    case 'not-a-file':
      return { code: 404, reason: `${answer.url} is catalogued but has no file to serve` };
    case 'absent':
      return {
        code: 404,
        reason: `${answer.ref.repo} carries no ${answer.ref.skill}/SKILL.md at HEAD`,
      };
    case 'ambiguous':
      return {
        code: 409,
        reason:
          `${answer.ref.skill} exists at ${answer.paths.length} paths in ${answer.ref.repo} ` +
          `with different contents, so which one was read is unknown: ${answer.paths.join(', ')}`,
      };
    case 'unsafe-path':
      return { code: 500, reason: 'the listing named a path outside the repository' };
    case 'upstream':
      return { code: 502, reason: `the origin answered HTTP ${answer.code}` };
    case 'too-large':
      return { code: 413, reason: `${answer.bytes} bytes is over the ${answer.cap} byte cap` };
    default:
      return { code: 500, reason: 'unreachable' };
  }
}

/**
 * `GET /content/:atomId` — the skill's SKILL.md, verbatim, with a receipt in the headers.
 *
 * The receipt rides in `x-arp-receipt` as JSON rather than in the body, so the body is exactly the
 * bytes the digest is over and a caller can pipe it without stripping anything.
 */
export async function serveContentRequest(
  atomId: string,
  params: URLSearchParams,
  chainId: number,
  signer: TypedDataSigner | null,
): Promise<Response> {
  const { to, nonce } = await requester(atomId, params, chainId);

  let answer: ContentAnswer;
  try {
    answer = await serveContent(atomId, {
      chainId,
      index: contentIndexFor(chainId),
      listing,
      raw,
      signer,
      to,
      nonce,
      now: () => Math.floor(Date.now() / 1000),
    });
  } catch (error) {
    // The message, not a stack: enough to retry or report, nothing about our host.
    return Response.json(
      { error: 'upstream', reason: String(error).slice(0, 200) },
      { status: 502 },
    );
  }

  if (answer.status !== 'served') {
    const { code, reason } = refusal(answer, chainId);
    return Response.json({ error: answer.status, reason }, { status: code });
  }

  const headers: Record<string, string> = {
    'content-type': 'text/plain; charset=utf-8',
    'x-arp-atom': atomId.toLowerCase(),
    'x-arp-path': answer.path,
    'x-arp-digest': answer.digest,
    // Never `inline`: these bytes are Markdown from a third party and nothing here renders them.
    'content-disposition': 'attachment',
    'x-content-type-options': 'nosniff',
  };
  if (answer.alsoAt.length > 0) headers['x-arp-also-at'] = answer.alsoAt.join(', ');
  if (answer.receipt !== null) headers['x-arp-receipt'] = JSON.stringify(answer.receipt);

  // The bytes, unchanged, so the body is exactly what the digest is over. `Uint8Array` is a valid
  // body; the named `BodyInit` type is not in this tsconfig's lib, which `check:scripts` caught.
  return new Response(answer.bytes, { headers });
}

// A module, not a global script — see the note in scripts/measure/predicate-objects.ts.
export {};
