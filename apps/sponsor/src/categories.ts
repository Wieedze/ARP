/** What `POST /propose-category` reads and writes outside the chain (task 59, ADR `0124`).
 *
 *  `isCategory` reads the tree through ARP's attestor set, the sponsor among them, so a category
 *  this service wrote counts as one on the next request. The tree is read again at most once a
 *  minute: a proposal is rare, and the queue re-plans before it spends anyway.
 *
 *  The log is one JSON line per written proposal under ARP_HOME, read by the weekly review list
 *  (task 59 §2 item 4).
 */
import { appendFileSync, readFileSync } from 'node:fs';

import {
  ARP_DOMAIN_ATTESTORS,
  INTUITION_HAS_TAG_MAINNET,
  INTUITION_IS_A_SUB_DOMAIN_OF,
  isCategoryIn,
  isToolUrl,
  readDomainTree,
} from '@arp-protocol/core';

import type { CategoryLogEntry } from './routes/propose-category.ts';

const TREE_MS = 60_000;

/** The index's tree, read again at most once a minute, and at once after this service writes. */
export function categoryTree(graphqlUrl: string) {
  let read: { at: number; tree: Awaited<ReturnType<typeof readDomainTree>> } | null = null;
  const current = async () => {
    if (read === null || Date.now() - read.at > TREE_MS) {
      const tree = await readDomainTree({
        graphqlUrl,
        hierarchyPredicate: INTUITION_IS_A_SUB_DOMAIN_OF,
        tagPredicate: INTUITION_HAS_TAG_MAINNET,
        root: 'tool',
        attestor: ARP_DOMAIN_ATTESTORS,
      });
      // A partial tree could miss the node a proposal collides with: refuse rather than guess.
      if (tree.truncated) throw new Error('the domain tree read was truncated');
      read = { at: Date.now(), tree };
    }
    return read.tree;
  };
  return {
    isCategory: async (label: string) => isCategoryIn(await current())(label),
    // Any node the tree holds, reachable or not: only "unknown" means the label is not there.
    isKnown: async (label: string) => {
      const path = (await current()).pathToRoot(label);
      return path.found || path.reason !== 'unknown';
    },
    invalidate: () => {
      read = null;
    },
  };
}

/** Whether an atom is a skill or tool: a Thing whose `url` is a tool URL, per the indexer. */
export function toolCheck(graphqlUrl: string): (atomId: string) => Promise<boolean> {
  return async (atomId) => {
    const response = await fetch(graphqlUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        query: 'query($id: String!) { atom(term_id: $id) { type value { thing { url } } } }',
        variables: { id: atomId },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`the indexer answered HTTP ${response.status}`);
    const body = (await response.json()) as {
      data?: {
        atom?: { type?: string; value?: { thing?: { url?: string | null } | null } | null } | null;
      };
    };
    const url = body.data?.atom?.value?.thing?.url;
    return body.data?.atom?.type === 'Thing' && typeof url === 'string' && isToolUrl(url);
  };
}

/** The compounds `domains.proposal.json` allows, each with the reason no single word fits. */
export function compoundsFrom(path: string): ReadonlyMap<string, string> {
  const file = JSON.parse(readFileSync(path, 'utf8')) as {
    compounds?: { label: string; why: string }[];
  };
  return new Map((file.compounds ?? []).map((c) => [c.label, c.why]));
}

export function categoryLog(path: string): (entry: CategoryLogEntry) => void {
  return (entry) => appendFileSync(path, `${JSON.stringify(entry)}\n`, { mode: 0o600 });
}
