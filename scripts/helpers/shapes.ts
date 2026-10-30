/**
 * The shapes these measurement scripts read off the wire.
 *
 * Under `strict`, `Response.json()` returns `unknown` — correctly, because nothing about an HTTP
 * response guarantees a shape. Naming the expected shape is an **assertion**, not a check, and it
 * is worth making in one place rather than twenty: ADR `0047` is what a wrong one costs —
 * `arp_find_agents` read `market.totalAssets`, which does not exist, `?? 0n`'d the `undefined`, and
 * reported 0 TRUST for an agent carrying 13.02, on a third-party surface.
 *
 * So these are deliberately **narrow and optional**. Every field is `?`, because the remote may
 * omit any of them, and a reader that forgets to handle the absence gets a type error rather than
 * `undefined` flowing into arithmetic.
 */

/** An `eth_call` / `eth_getLogs` reply. `result` is hex when the call succeeded. */
export type JsonRpcReply = {
  result?: string;
  error?: { message?: string; code?: number };
};

/** A Hasura reply. `T` is what the script's own query asked for. */
export type GraphqlReply<T> = {
  data?: T;
  errors?: { message?: string }[];
};

/**
 * An ERC-8004 registration document, as found in the wild.
 *
 * Not `RegistrationFile` from `@arp-protocol/core`: that type describes what **this project
 * writes**, and these scripts read what **everyone else wrote** — including documents predating
 * the shape, documents with `endpoints` where the current spelling is `services`, and documents
 * missing every optional field. Reading the writer's type would make the scripts assert a
 * conformance they exist to measure.
 */
export type RegistrationDoc = {
  name?: unknown;
  description?: unknown;
  image?: unknown;
  url?: unknown;
  type?: unknown;
  active?: unknown;
  x402Support?: unknown;
  supportedTrust?: unknown;
  /** The current spelling. */
  services?: unknown;
  /** The older one, still on chain. */
  endpoints?: unknown;
  registrations?: unknown;
  skills?: unknown;
  tags?: unknown;
  oasf_skills?: unknown;
  oasf_domains?: unknown;
  domains?: unknown;
};

/** `value` when it is a non-empty string, else `null`. The narrowing these scripts repeat. */
export function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

/** `value` when it is an array, else `[]`. */
export function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** One level of property access on something that may not be an object. */
export function prop(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)[key]
    : undefined;
}
