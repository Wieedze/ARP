/** What the sponsoring service does with a request, separated from where it reads its key.
 *
 *  `main.ts` reads the environment and listens; this file is the part a test can construct, with
 *  the wallet, the chain and the pinning service injected. Each route is its own file in `routes/`,
 *  over the queue, the allow-list and the agent checks they share (`routes/context.ts`); this file
 *  holds the types, the guard every request passes first, and the dispatch.
 *
 *  **Eight routes that spend, and each checks before it spends** (ADR `0092` item 2, ADR `0094`):
 *
 *  | route           | what it pays for                                     | what it checks first                 |
 *  | --------------- | ---------------------------------------------------- | ------------------------------------ |
 *  | `POST /gas`     | the gas for the agent's one `approve`, once ever     | a registered ERC-8004 agent          |
 *  | `POST /deposit` | a deposit with `receiver = agent`                    | the signed request, the proof, limits |
 *  | `POST /publish` | the atoms and triples that index a signed delegation | the delegator's signature, limits    |
 *  | `POST /mint-gas`| the gas for an address's own `register()`, once ever | the address's signature, a daily cap |
 *  | `POST /identity`| the atoms and triples of an agent's identity        | a registered agent, the pins, the cap |
 *  | `POST /list-tool`| a tool's atom, and a skill's repository and `source` | the URL exists, the pins, a daily cap |
 *  | `POST /propose-category`| a new category, its parent edge and one skill's tag | `planCategory`'s rules, a daily cap |
 *  | `POST /line`    | one form B line, with the agent's position on each level | a registered agent's signature, daily caps |
 *
 *  `/mint-gas`, `/identity`, and the `uses` triple `/deposit` creates when it is missing, are ADR
 *  `0110`. `/list-tool` is ADR `0123`; it and `/propose-category` are the only routes a browser may
 *  call.
 *  `/propose-category` is task 59 and ADR `0124`: the service writes as an attestor the index reads.
 *
 *  **The allow-list is enforced here, not trusted to the wallet.** Every call sent goes to the
 *  MultiVault on this chain, and the only value sent anywhere else is gas: `limits.approvalGas` to
 *  a registered agent, and `limits.mintGas` to an address that is about to register. ADR `0094`
 *  §3: "The sponsoring service calls the MultiVault and nothing else."
 *
 *  **One spend at a time.** Every route that sends runs inside one queue, so two requests cannot
 *  both pass the day's count, or both spend one proof, before either is recorded.
 *
 *  **Recorded before it is sent.** A deposit and a gas transfer are reserved in the ledger before
 *  the key is used and settled after (`ledger.ts`), so a send whose outcome is lost to a failing RPC
 *  still spends its proof, and the agent's gas, once.
 *
 *  **The edge is the proof's edge.** A sponsored deposit is on `(requester, uses, X)`, where the
 *  subject is the requesting agent's identity atom and X is what the proof is about: the tool atom
 *  a content receipt names, or the identity atom of the agent a hire receipt says was hired. Any
 *  other `uses` triple is refused, so a deposit this service paid for is _proven_ about that edge
 *  and no other.
 *
 *  **The service is never its own agent.** An agent whose ERC-8004 holder is the sponsor wallet is
 *  refused by `/gas` and `/deposit`: a deposit with the service as receiver would be ARP paying
 *  itself a position, and the approval gas would go back to the key that sent it.
 *
 *  **On testnet the agent pays nothing** (ADR `0094` as amended, ADR `0110`): `/mint-gas` pays for
 *  its `register()`, `/identity` for its identity atoms, `/gas` for its `approve`, and the service
 *  pays the deposit. When the deposit's `uses` triple is not on chain yet, `/deposit` creates it
 *  first at `cost + minDeposit`, so the term is born with a sponsor-held position and the agent's
 *  position lands on top (« peu importe le créateur, c'est le stake qui compte », the user). Task
 *  40 §3 had refused that creation; ADR `0110` reverses it. `/publish` creates its terms the same
 *  way (task 37c, ADR `0053`). The cost-of-proof rule and the withdrawal threshold are mainnet
 *  rules, off here. A hire's payment is still the agent's own.
 *
 *  **A refusal always leaves the agent a way.** A 409 for a missing approval carries the approve
 *  call; a 429 carries the call the agent can send itself. Unplugging this service costs an agent
 *  its sponsorship and the _proven_ label, never a capability (ADR `0094`, ADR `0092` item 6).
 */
import type {
  AgentIdentityRef,
  AgentKeyReads,
  AgentThing,
  DelegationPredicates,
  MultiVaultReads,
  PaymentReads,
  PreparedCall,
  SponsorLimits,
  StrictIdentityAtom,
  TypedDataVerifier,
} from '@arp-protocol/core';
import { redactUrls, refuseForeignRequest } from '@arp-protocol/core/node';
import { getAddress, isAddress, type Address, type Hex } from 'viem';

import type { ToolResolution } from './github.ts';
import type { RepoSpelling } from './indexer.ts';
import type { SponsorLedger } from './ledger.ts';
import { createContext, json, readBody, REGISTRY } from './routes/context.ts';
import { deposit } from './routes/deposit.ts';
import { gas } from './routes/gas.ts';
import { identity } from './routes/identity.ts';
import { info } from './routes/info.ts';
import { mintGas } from './routes/mint-gas.ts';
import { line } from './routes/line.ts';
import { listTool } from './routes/list-tool.ts';
import { proposeCategory, type CategoryLogEntry } from './routes/propose-category.ts';
import { publish } from './routes/publish.ts';

/**
 * What a send came to. `unconfirmed` is a transaction that was broadcast and whose receipt did not
 * arrive within the wait (`main.ts`, `mined`): it may still land, so it stays spent and its hash is
 * recorded for the operator, and the queue moves on rather than waiting on it forever.
 */
export type SendOutcome = { hash: Hex; status: 'success' | 'reverted' | 'unconfirmed' };

/** The one key ARP holds here, behind three methods. `main.ts` builds it from viem. */
export type SponsorWallet = {
  address: Address;
  /** `eth_call` the call from this address. A deposit the agent has not approved fails here. */
  simulate(call: PreparedCall): Promise<{ ok: true } | { ok: false; reason: string }>;
  /** Send one call and wait, for a bounded time, for it to be mined. */
  send(call: PreparedCall): Promise<SendOutcome>;
  /** A plain value transfer, used for the approval gas and for nothing else. */
  sendGas(to: Address, value: bigint): Promise<SendOutcome>;
};

/** Who holds an ERC-8004 token, or `null` when it does not exist, and the `agentWallet` it set. */
export type AgentOwnerReads = AgentKeyReads;

/**
 * An agent's identity atom: the registration-derived atom a `uses` edge carries as its subject
 * (ADR `0032`). `main.ts` resolves it through `same as` with `resolveIdentityAtomStrict`, which
 * answers `ambiguous` rather than picking when two atoms claim one identity.
 */
export type AgentIdentityAtoms = {
  identityAtom(agent: AgentIdentityRef): Promise<StrictIdentityAtom>;
};

/** The delegation register's part. Absent, `POST /publish` answers 503 and spends nothing. */
export type PublishConfig = {
  delegationManager: Address;
  predicates: DelegationPredicates;
  verify: TypedDataVerifier;
  /** Pins the exact document string and returns its `ipfs://` URI. */
  pin(document: string): Promise<string>;
};

export type SponsorOptions = {
  chainId: number;
  wallet: SponsorWallet;
  /** Its `address` is the MultiVault, the only contract this service calls. */
  reads: MultiVaultReads;
  payments: PaymentReads;
  owners: AgentOwnerReads;
  /** How many agents `address` holds, across the sponsored registries. `/mint-gas` refuses above 0. */
  holdings: { agentsHeldBy(address: Address): Promise<bigint> };
  identities: AgentIdentityAtoms;
  /** The ERC-8004 registries whose agents are sponsored, as `eip155:<chainId>:<address>`. */
  registries: readonly string[];
  /** The canonical `uses` predicate. A sponsored deposit is on a `(agent, uses, tool)` triple. */
  usesPredicate: Hex;
  limits: SponsorLimits;
  ledger: SponsorLedger;
  /** Content-receipt signers accepted as ARP's own nodes. */
  acceptedContentSigners: readonly Address[];
  publish: PublishConfig | null;
  /**
   * Pins an identity Thing through Intuition's pinning API and returns its `ipfs://` URI. Absent,
   * `POST /identity` answers 503: an identity atom whose document is not pinned does not resolve
   * (`RESOLVE_AGENT_QUERY` reads the Thing's name), so creating it would spend for nothing.
   */
  pinThing?: ((thing: AgentThing) => Promise<string>) | null;
  /**
   * The `Host` values this service answers to: its own `127.0.0.1:<port>` and `localhost:<port>`.
   * Anything else is refused before a body is read, and so is a browser `Origin` not in
   * {@link origins} and a `POST` that is not `application/json` (ADR `0116`): `/mint-gas`, `/gas` and
   * `/identity` spend the treasury key, and a page on any site can otherwise POST to a loopback port.
   */
  hosts: readonly string[];
  /** Browser origins allowed to call. Empty by default: nothing in a browser needs this service. */
  origins?: readonly string[];
  /**
   * Browser origins allowed to call `POST /list-tool`, and only that route (ADR `0123`): the web
   * app's own path C. They get a CORS answer; every other route still refuses them.
   */
  listToolOrigins?: readonly string[];
  /**
   * Whether a tool URL exists where it says: for GitHub, the repository, and for a skill its
   * SKILL.md, and GitHub's own spelling of the repository. Absent, `POST /list-tool` answers 503.
   * `main.ts` asks GitHub's API.
   */
  resolveTool?: ((url: string) => Promise<ToolResolution>) | null;
  /** The spellings of a GitHub `owner/repo` already on the graph, matched case-insensitively. */
  repoSpellings?: ((repo: string) => Promise<RepoSpelling[]>) | null;
  /**
   * What `POST /propose-category` needs (task 59, ADR `0124`). Absent, it answers 503.
   * `isCategory` reads the tree with the index's attestors, the sponsor among them; `compounds` is
   * `data/catalogue/domains.proposal.json`'s list; `log` keeps each written proposal for review.
   */
  categories?: {
    isCategory(label: string): Promise<boolean>;
    /** Whether a label is any node of the tree, reachable or not (`planCategory`'s `isKnown`). */
    isKnown(label: string): Promise<boolean>;
    /** Whether a subject atom is a skill or tool (`planCategory`'s `isTool`). */
    isTool(subjectId: Hex): Promise<boolean>;
    /** Forget the cached tree, after a write. */
    invalidate(): void;
    compounds: ReadonlyMap<string, string>;
    /** The accounts the index reads (`ARP_DOMAIN_ATTESTORS`); an existing term none of them backs is backed. */
    attestors: readonly Address[];
    log(entry: CategoryLogEntry): void;
  } | null;
  /** What `POST /line` needs (ADR `0144`), with `categories` for the domain. Absent, it answers 503. */
  lines?: { inContextOf: Hex } | null;
  /** Milliseconds. Injected so a test can move the day. */
  now?: () => number;
  /** Where a failed request's detail goes, redacted. `console.error` by default. */
  log?: (line: string) => void;
};

export function createSponsor(options: SponsorOptions): {
  fetch(request: Request): Promise<Response>;
} {
  const ctx = createContext(options);
  return {
    async fetch(request: Request): Promise<Response> {
      const url = new URL(request.url);
      // `/list-tool` and `/propose-category` alone answer a browser, and only the origins listed for
      // them (ADRs `0123`, `0124`).
      // And `/propose-category`, the step path C takes right after a listing (ADR `0124`).
      const listing = url.pathname === '/list-tool' || url.pathname === '/propose-category';
      const corsOrigins = listing ? (options.listToolOrigins ?? []) : [];
      const foreign = refuseForeignRequest(request, {
        hosts: options.hosts,
        origins: [...(options.origins ?? []), ...corsOrigins],
      });
      if (foreign !== null) return foreign;
      const origin = request.headers.get('origin');
      const cors =
        origin !== null && corsOrigins.includes(origin)
          ? { 'access-control-allow-origin': origin, vary: 'Origin' }
          : null;
      if (listing && request.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: {
            ...(cors ?? {}),
            'access-control-allow-methods': 'POST',
            'access-control-allow-headers': 'content-type',
          },
        });
      }
      const response = await answer(request, url);
      if (cors !== null)
        for (const [name, value] of Object.entries(cors)) response.headers.set(name, value);
      return response;
    },
  };

  async function answer(request: Request, url: URL): Promise<Response> {
    if (request.method === 'GET' && url.pathname === '/') return json(info(ctx));
    if (request.method !== 'POST')
      return json(
        {
          error:
            'GET /, or POST /gas, /mint-gas, /identity, /deposit, /publish, /list-tool, /propose-category, /line',
        },
        404,
      );
    const route = {
      '/gas': gas,
      '/mint-gas': mintGas,
      '/identity': identity,
      '/deposit': deposit,
      '/publish': publish,
      '/list-tool': listTool,
      '/propose-category': proposeCategory,
      '/line': line,
    }[url.pathname];
    if (route === undefined)
      return json(
        {
          error:
            'GET /, or POST /gas, /mint-gas, /identity, /deposit, /publish, /list-tool, /propose-category, /line',
        },
        404,
      );
    const body = await readBody(request);
    if (body instanceof Response) return body;
    try {
      return await route(ctx, body);
    } catch (error) {
      // Logged here, answered generically: a viem error carries the RPC URL, and the URL can
      // carry its API key (ADR `0116`). The id ties the answer to the log line.
      const id = Math.random().toString(36).slice(2, 10);
      const detail = error instanceof Error ? error.message : String(error);
      (options.log ?? console.error)(`[${id}] ${url.pathname} failed: ${redactUrls(detail)}`);
      return json({ error: `internal error (${id})` }, 500);
    }
  }
}

/**
 * Exported for `main.ts`: the sponsored registries, each `eip155:<chainId>:<address>` on `chainId`,
 * refused whole at start if one entry is not (ADR `0116`). Until then a bad entry surfaced as a
 * `getAddress` throw inside a request, and a registry on another chain was never sponsorable.
 */
export function registryList(raw: string, chainId: number): string[] {
  const entries = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
  if (entries.length === 0) throw new Error('no registry given');
  return entries.map((entry) => {
    const match = REGISTRY.exec(entry);
    if (match === null) throw new Error(`${entry} is not eip155:<chainId>:<address>`);
    if (Number(match[1]) !== chainId) throw new Error(`${entry} is not on chain ${chainId}`);
    return entry;
  });
}

/** Exported for `main.ts`: an address list from configuration, refused whole if one entry is bad. */
export function addressList(raw: string | undefined): Address[] {
  if (raw === undefined || raw.trim() === '') return [];
  return raw.split(',').map((entry) => {
    const value = entry.trim();
    if (!isAddress(value)) throw new Error(`${value} is not an address`);
    return getAddress(value);
  });
}
