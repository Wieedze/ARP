/**
 * The identifier shapes this package checks, each written once.
 *
 * Every integer is canonical decimal: no sign, no leading zero (`0` itself excepted). Two
 * spellings of one token id — `7` and `007` — would otherwise be two CAIP-19 strings for one agent,
 * and a CAIP-19 string is an atom's name, so they would be two atoms.
 */

/** A non-negative integer in canonical decimal. */
export const DECIMAL = /^(0|[1-9][0-9]*)$/;

/** An ERC-8004 registry reference, `eip155:<chainId>:<address>`. Groups: chain id, address. */
export const ERC8004_REGISTRY = /^eip155:([1-9][0-9]*):(0x[0-9a-fA-F]{40})$/;

/**
 * An ERC-721 CAIP-19 asset id, `eip155:<chainId>/erc721:<address>/<tokenId>`. Groups: chain id,
 * address, token id.
 */
export const CAIP19_ERC721 = /^eip155:([1-9][0-9]*)\/erc721:(0x[0-9a-fA-F]{40})\/(0|[1-9][0-9]*)$/;
