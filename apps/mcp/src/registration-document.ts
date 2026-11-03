import { guardedFetchText, type FetchLike } from '@arp-protocol/core';

import { hostGuard, type HostGuard } from './host-guard.js';

/**
 * A registration file is a few kilobytes. The `tokenURI` is a string somebody else controls, so the
 * host it names can answer slowly or without end: both are bounded (ADR `0116`), and a document past
 * either bound is an answer about the agent, like a refused one.
 */
export const DOCUMENT_TIMEOUT_MS = 10_000;
export const MAX_DOCUMENT_BYTES = 256 * 1024;

export type RegistrationDocument =
  | { status: 'read'; document: unknown }
  /** Not fetched or not followed: a scheme, an address or a redirect this server will not go to. */
  | { status: 'refused'; reason: string }
  /** Fetched, and the host's answer is not a document. */
  | { status: 'unreadable'; reason: string };

/**
 * Read the document a `tokenURI` names.
 *
 * Inline `data:` is decoded in place: it carries its own bytes, the shape an agent picks when it
 * wants no hosting dependency. Anything else goes through `guardedFetchText`, the package's one
 * guarded fetch: every hop's URL checked, redirects followed by hand (a guard on hop one is not a
 * guard — measured 2026-10-29, a public host answering `302 Location: http://169.254.169.254/…`
 * returned the private body), and, unless `ARP_ALLOW_PRIVATE_PROBE=1`, every hop's name resolved
 * and refused when it resolves to a private address.
 *
 * Throws on a network failure, a deadline, an oversized body or a body that is not JSON; the
 * caller reports that as "published something we could not read".
 */
export async function readRegistrationDocument(
  file: string,
  deps: { fetch?: FetchLike; guard?: HostGuard } = {},
): Promise<RegistrationDocument> {
  if (file.startsWith('data:')) {
    const comma = file.indexOf(',');
    const payload = file.slice(comma + 1);
    return {
      status: 'read',
      document: JSON.parse(
        file.slice(0, comma).includes(';base64')
          ? Buffer.from(payload, 'base64').toString('utf8')
          : decodeURIComponent(payload),
      ),
    };
  }
  const guard = deps.guard ?? hostGuard();
  const answer = await guardedFetchText(
    deps.fetch ?? globalThis.fetch,
    file,
    { headers: { accept: 'application/json' } },
    {
      timeoutMs: DOCUMENT_TIMEOUT_MS,
      maxBytes: MAX_DOCUMENT_BYTES,
      allowPrivate: guard.allowPrivate,
      ...(guard.resolveHost === undefined ? {} : { resolveHost: guard.resolveHost }),
    },
  );
  if (answer.status === 'refused') return { status: 'refused', reason: answer.reason };
  const { response } = answer;
  if (response.status >= 300 && response.status < 400) {
    // A 3xx with no `Location` is a broken origin, not a redirect chain.
    return {
      status: 'unreadable',
      reason: `the host answered ${response.status} with no Location header`,
    };
  }
  if (!response.ok) return { status: 'unreadable', reason: `the host answered ${response.status}` };
  return { status: 'read', document: JSON.parse(answer.text) };
}
