/** What every route of the sponsoring service shares: the injected options, the one queue, the
 *  allow-list, and the checks on who an agent is (ADR `0116` split `service.ts` into one file per
 *  route; the behaviour is the closure it was, unchanged).
 */
import { isContractRevert, type PreparedCall, type SponsorRecord } from '@arp-protocol/core';
import { ERC8004_REGISTRY_REF, jsonResponse, redactUrls } from '@arp-protocol/core/node';
import { getAddress, isHex, type Address, type Hex } from 'viem';

import type { SponsorOptions } from '../service.ts';

export const json = jsonResponse;

/**
 * A registry read's `.catch`: a contract revert is the registry's "none" and reads as `null`;
 * anything else is the chain unreachable and is rethrown, so it is never taken for "none".
 */
export function nullOnRevert(error: unknown): null {
  if (isContractRevert(error)) return null;
  throw error;
}

/** Seconds a caller is told to wait when the chain could not be read. */
export const CHAIN_RETRY_AFTER_SECONDS = 5;

/**
 * A 503 with a retry hint: the chain could not be read, so nothing is known about the request
 * either way. Never a 403, which would report an outage as a verdict on the agent.
 */
export function chainUnreadable(reason: string): Response {
  const response = json(
    { error: `the chain could not be read: ${redactUrls(reason).slice(0, 300)}`, retry: true },
    503,
  );
  response.headers.set('retry-after', String(CHAIN_RETRY_AFTER_SECONDS));
  return response;
}

export const ZERO_ADDRESS: Address = '0x0000000000000000000000000000000000000000';

export function isBytes32(value: unknown): value is Hex {
  return typeof value === 'string' && isHex(value) && value.length === 66;
}

export const REGISTRY = ERC8004_REGISTRY_REF;
export const DECIMAL = /^(0|[1-9][0-9]*)$/;

export type Body = Record<string, unknown>;

export async function readBody(request: Request): Promise<Body | Response> {
  try {
    const parsed: unknown = await request.json();
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return json({ error: 'body is not a JSON object' }, 400);
    }
    return parsed as Body; // An object, checked on the line above; fields are narrowed per route.
  } catch {
    return json({ error: 'body is not JSON' }, 400);
  }
}

export type SponsorContext = ReturnType<typeof createContext>;

export function createContext(options: SponsorOptions) {
  const { chainId, wallet, reads, payments, owners, limits, ledger } = options;
  const now = options.now ?? Date.now;
  const multiVault = getAddress(reads.address);
  const registries = new Set(options.registries.map((r) => r.toLowerCase()));

  let queue: Promise<unknown> = Promise.resolve();
  function exclusive<T>(work: () => Promise<T>): Promise<T> {
    const run = queue.then(work, work);
    queue = run.catch(() => undefined);
    return run;
  }

  /** The allow-list. Checked before a spend is reserved, so a refused call burns no proof. */
  function assertMultiVault(call: PreparedCall): void {
    if (getAddress(call.to) !== multiVault || call.chainId !== chainId) {
      throw new Error(`refusing a call to ${call.to} on chain ${call.chainId}`);
    }
  }

  /**
   * A send that was broadcast and not confirmed in time: its reservation stays pending, so it
   * counts as spent, with the hash beside it for the operator to reconcile (ADR `0116`).
   */
  function unconfirmed(kind: SponsorRecord['kind'], key: string, hash: Hex, extra: object = {}) {
    ledger.noteSent(kind, key, hash);
    return json(
      {
        error: `transaction ${hash} was sent and not confirmed in time; it is recorded as pending`,
        pending: hash,
        ...extra,
      },
      504,
    );
  }

  /** The allow-list again, at the last step before a key is used. */
  async function sendToMultiVault(call: PreparedCall) {
    assertMultiVault(call);
    return wallet.send(call);
  }

  /** A registered agent is one whose ERC-8004 token exists in an accepted registry. */
  async function ownerOfAgent(
    agentRegistry: unknown,
    agentId: unknown,
  ): Promise<{ owner: Address } | { error: string; status: number } | { unreadable: Response }> {
    if (
      typeof agentRegistry !== 'string' ||
      typeof agentId !== 'string' ||
      !DECIMAL.test(agentId)
    ) {
      return {
        error: 'agentRegistry (eip155:<chainId>:<address>) and agentId (decimal) are required',
        status: 400,
      };
    }
    const match = REGISTRY.exec(agentRegistry);
    if (match === null || !registries.has(agentRegistry.toLowerCase())) {
      return { error: `${agentRegistry} is not a registry this service sponsors`, status: 403 };
    }
    let owner: Address | null;
    try {
      // `null` is the registry's answer, "no such token". A throw is the chain unreachable.
      owner = await owners.ownerOf(getAddress(match[2] ?? ''), BigInt(agentId));
    } catch (error) {
      return {
        unreadable: chainUnreadable(String(error instanceof Error ? error.message : error)),
      };
    }
    if (owner === null) {
      return { error: `agent ${agentId} is not registered in ${agentRegistry}`, status: 403 };
    }
    return { owner: getAddress(owner) };
  }

  /** A 403 when the agent's holder is this service's own key, `null` otherwise. */
  function refuseOwnAgent(owner: Address, agentId: unknown): Response | null {
    if (owner !== getAddress(wallet.address)) return null;
    return json(
      {
        error: `agent ${String(agentId)} is held by the sponsoring service itself, which sponsors no position of its own`,
      },
      403,
    );
  }

  return {
    options,
    chainId,
    wallet,
    reads,
    payments,
    owners,
    limits,
    ledger,
    now,
    multiVault,
    exclusive,
    assertMultiVault,
    sendToMultiVault,
    ownerOfAgent,
    refuseOwnAgent,
    unconfirmed,
  };
}
