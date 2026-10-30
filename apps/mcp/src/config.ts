import {
  type CataloguedSkill,
  createErc8004Client,
  intuitionSource,
  intuitionToolAtomLookup,
  multiVaultReads,
} from '@arp-protocol/core';
import { getAddress, type Address } from 'viem';
import { catalogueFor, receiptSigner } from './content.js';
import { DEPLOYMENTS } from './data.js';

import { isAddress } from './rpc.js';

export const PORT = Number(process.env.PORT ?? 3002);

/**
 * The only key on ARP's side of the loop, and it signs content receipts and nothing else.
 *
 * ADR `0080`. It is not a wallet, it never holds TRUST, and it is not the key any plan is signed
 * with — the plan path still has none (ADR `0038`), which is what keeps "ARP cannot spend an
 * operator's funds" a structural property rather than a promise. Generated on first run into
 * `.arp/receipt-key`; `ARP_NO_RECEIPTS=1` runs with none and the content path still works.
 */
export const RECEIPT_SIGNER = receiptSigner();

/** Where the hook writes, and where the fetch records what it fetched. Both overridable. */
export const SESSION_LOG = process.env['ARP_SESSION_LOG'] ?? '.arp/session.jsonl';
export const RECEIPTS_LOG = process.env['ARP_RECEIPTS'] ?? '.arp/receipts.jsonl';

/**
 * Which chain this server plans against — config with a default, never a module constant.
 *
 * `rules/portability.md` rule 1, and rule 3 is why it matters here: a triple costs 0.1 TRUST on
 * 1155 and 0.001 on 13579. The addresses and URLs come from `deployments/<chainId>.json`, looked
 * up by this chain in `data.ts`, so a mainnet server cannot be served a testnet constant.
 */
const TARGETS = { mainnet: 1155, testnet: 13579 } as const;
export const targetName = (process.env.ARP_TARGET ?? 'mainnet') as keyof typeof TARGETS;
export const chainId = TARGETS[targetName];
if (chainId === undefined) {
  console.error(`ARP_TARGET must be one of ${Object.keys(TARGETS).join(', ')}`);
  process.exit(1);
}

type DeploymentRecord = {
  chain?: { rpcUrl?: string; graphqlUrl?: string; name?: string };
  intuition?: { multiVault?: string };
};

const recorded = DEPLOYMENTS[chainId];
if (recorded === undefined) {
  console.error(`no deployments/${chainId}.json`);
  process.exit(1);
}
// The record is JSON this repo writes; `required` below checks each field before it is used.
export const record = recorded as DeploymentRecord;

/**
 * The catalogue `arp_declare_session` resolves a runtime's names against, for THIS server's chain.
 *
 * It was `catalogue/skills-13579.json` imported at module scope while `ARP_TARGET` defaults to
 * mainnet, so a default-run server resolved testnet atom ids and would have planned against 1155 —
 * where those atoms do not exist and where a create pair costs 0.22 TRUST against 0.004, measured
 * 2026-10-29. `rules/portability.md` rule 1 and rule 3 in one line of code.
 */
export const sessionCatalogue: CataloguedSkill[] = catalogueFor(chainId);

/**
 * The signers THIS server's reader accepts, from `ARP_ACCEPTED_SIGNERS`.
 *
 * ADR `0080` constraint 4 as configuration rather than a principle. Empty is the honest default and
 * it is why `corroborationOf` reports `unknown-signer`: a server an operator installs generates its
 * own key, so its address differs from that operator's agent key while the same hand holds both.
 * Nothing in a receipt tells that apart from a genuinely separate server, so the reader has to say.
 */
let accepted: Address[] | null = null;
export function acceptedSigners(): Address[] {
  // Lazy, and that is not a style choice: the first version read `isAddress` — a `const` helper
  // then declared further down the same file — at module initialisation, so the process died in the
  // temporal dead zone while `tsc --noEmit` stayed green. `claims.md` §4, found by starting it.
  if (accepted !== null) return accepted;
  accepted = (process.env['ARP_ACCEPTED_SIGNERS'] ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry): entry is Address => isAddress(entry));
  return accepted;
}

const GRAPHQL_URL = process.env.INTUITION_GRAPHQL_URL ?? record.chain?.graphqlUrl;
const RPC_URL = process.env.INTUITION_RPC_URL ?? record.chain?.rpcUrl;
const MULTI_VAULT_RAW = (process.env.ARP_MULTI_VAULT ?? record.intuition?.multiVault) as
  | `0x${string}`
  | undefined;

/**
 * Narrowed once, here, because the guard below cannot do it.
 *
 * `process.exit` is not typed `never`, so TypeScript keeps all three as `T | undefined` everywhere
 * downstream and every use is an error. The repo never saw them: `scripts/` is outside `tsc -b`,
 * outside eslint and outside `bun build`'s checks — `rules/claims.md` §4 names that gap by name.
 * Two had accumulated by 2026-10-29. Re-assigning after the guard fixes every call site at once
 * and keeps the loud failure the guard exists for.
 */
function required<T>(value: T | undefined, what: string): T {
  if (value === undefined || value === null || value === '') {
    console.error(`deployments/${chainId}.json is missing ${what}`);
    process.exit(1);
  }
  return value;
}

export const GRAPHQL = required(GRAPHQL_URL, 'a graphqlUrl');
export const RPC = required(RPC_URL, 'an rpcUrl');
export const MULTI_VAULT = required(MULTI_VAULT_RAW, 'a multiVault');

export const reads = multiVaultReads({ address: MULTI_VAULT, chainId, rpcUrl: RPC });

/**
 * So an `https://` tool reuses the atom it already has instead of minting a metadata-less one
 * beside it. Measured by `scripts/measure/tool-atom-shape.ts`: 78 of the 84 tool atoms on mainnet
 * `uses` edges are `ipfs://` and 77 of those resolve a pinned Thing. A graph read, no credential.
 */
export const toolAtoms = intuitionToolAtomLookup({ graphqlUrl: GRAPHQL });

/** The label every domain path climbs to. One word, no hyphen — the user's rule, 2026-10-28. It is
 *  a convention and the one arbitrary choice in the vocabulary, so it is named once here rather
 *  than repeated at each call site. */
export const DOMAIN_ROOT = 'tool';

/**
 * `reachable` — the object of the one claim here a third party can reproduce.
 *
 * A plain string, so its id follows from the word and is **the same on both chains**: verified
 * 2026-10-29, `0x997fd60b…` on 1155 and on 13579, and already created on both. Nothing has to be
 * minted to start recording.
 */
export const REACHABLE_ATOM =
  '0x997fd60b1bd203d0c579fb72eea70e585d2fbd68287a911b7cc0e7ed0eae0805' as `0x${string}`;

/**
 * The address whose positions define ARP's domain tree.
 *
 * A term is in the tree because this address paid to put it there, by creating it with a deposit or
 * by backing one somebody else created — the two are the same act (the user, 2026-10-28). It is a
 * published reading and not a permission: nobody is prevented from writing, and a caller can read
 * the unfiltered graph instead. On 13579 the hierarchy predicate carries 60 triples and this
 * address has a position on 17 of them; the other 43 belong to a different project and to its test
 * runs.
 *
 * Checksummed, because the indexer's `positions.account_id` is and a lowercase filter returns zero
 * rows — which reads as "nobody staked" rather than as a bad query.
 */
/**
 * ARP's published domain attestor — the address whose positions are ARP's index.
 *
 * A **default**, not a fallback to the operator's own address. ADR `0045` has every operator run
 * this server on their own machine, so the attestor has to travel with the code: an operator who
 * clones the repo and starts the server must get ARP's index without configuring anything.
 *
 * The first version of this read `ARP_DOMAIN_ATTESTOR ?? AGENT_ADDRESS`, which was right for one
 * laptop and wrong for a distributed node: `AGENT_ADDRESS` is the *operator's own* agent, it has no
 * position on any ARP domain, so every operator's server would have read an **empty index** and
 * reported that ARP has filed nothing. Silent, and indistinguishable from an empty registry.
 *
 * Override it with `ARP_DOMAIN_ATTESTOR` to read somebody else's index, or your own once you have
 * filed domains yourself. Blank it to disable domain search altogether — the search then refuses
 * rather than falling back to the unfiltered graph.
 */
const ARP_DOMAIN_ATTESTOR = '0x906f3A52ec089f8D4E9127F91C6bE5Ae0d18f91f';

function configuredAttestor(): string | undefined {
  const raw = process.env['ARP_DOMAIN_ATTESTOR'] ?? ARP_DOMAIN_ATTESTOR;
  // `??` alone let an EMPTY string through, because an empty string is not nullish: the guard below
  // saw a value, the query ran with `account_id: ""`, and every domain came back with nothing in
  // it. A search that silently returns zero rows reads as "this domain is empty", not as "this server
  // is misconfigured" — the same trap as the lowercase address, one level up.
  if (raw === undefined || raw.trim().length === 0) return undefined;
  const address = raw.trim();
  if (/^0x[0-9a-f]{40}$/.test(address) || /^0x[0-9A-F]{40}$/.test(address)) {
    // Normalised rather than refused. The indexer's `positions.account_id` is checksummed and a
    // lowercase filter matches nothing, so a perfectly valid address written in lower case would
    // return an empty index for every domain — which reads as "ARP has filed nothing" rather than
    // as a configuration mistake. `getAddress` throws on a bad address and returns the checksummed
    // form otherwise, so this both fixes the case and validates the value.
    try {
      return getAddress(address);
    } catch {
      console.error(
        `ARP_DOMAIN_ATTESTOR is not a valid address: ${JSON.stringify(address)} — domain search disabled.`,
      );
      return undefined;
    }
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    // Refused at load, not at call time. A malformed attestor cannot produce a correct index, and
    // failing at the first search would make it look like a data problem.
    // `console.error`, not `log`: this runs at module load and `log` is declared in `server.ts`, so
    // calling it here threw a ReferenceError and took the whole server down before it could serve
    // anything. stderr is the right stream in both transports anyway — on stdio, stdout is the
    // protocol.
    console.error(
      `ARP_DOMAIN_ATTESTOR is not a 0x address: ${JSON.stringify(address)} — domain search disabled.`,
    );
    return undefined;
  }
  return address;
}

/**
 * The address whose positions define this server's domain index. Set once, at load.
 *
 * Not a request parameter, deliberately — see the note in `findTools`.
 */
export const DOMAIN_ATTESTOR = configuredAttestor();

/**
 * The directory read, pointed at the same graph as everything else here.
 *
 * Only the Intuition source: the registry source answers per-agent questions and cannot list, and
 * `listAgents` throws `NoListingSourceError` rather than silently returning an empty page when no
 * source can. Explicit about `graphqlUrl` because the default is mainnet, and a testnet server
 * serving a mainnet directory is the kind of mix-up `rules/portability.md` rule 1 exists for.
 */
export const directory = createErc8004Client({
  sources: [intuitionSource({ graphqlUrl: GRAPHQL })],
});
