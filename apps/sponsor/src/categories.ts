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
  readDomainTree,
} from '@arp-protocol/core';

import type { CategoryLogEntry } from './routes/propose-category.ts';

const TREE_MS = 60_000;

export function categoryTree(graphqlUrl: string): (label: string) => Promise<boolean> {
  let read: { at: number; isCategory: (label: string) => Promise<boolean> } | null = null;
  return async (label) => {
    if (read === null || Date.now() - read.at > TREE_MS) {
      const tree = await readDomainTree({
        graphqlUrl,
        hierarchyPredicate: INTUITION_IS_A_SUB_DOMAIN_OF,
        tagPredicate: INTUITION_HAS_TAG_MAINNET,
        root: 'tool',
        attestor: ARP_DOMAIN_ATTESTORS,
      });
      read = { at: Date.now(), isCategory: isCategoryIn(tree) };
    }
    return read.isCategory(label);
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
