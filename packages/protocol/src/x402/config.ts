/**
 * What a server needs to answer 402: who is paid, how much, on which network, through which
 * facilitator. Read from the environment by `x402ConfigFrom`, under a prefix, so the MCP server
 * (`ARP_X402_*`) and an operator's node (`AGENT_NODE_X402_*`) share one parser and never one value.
 *
 * **Off unless asked for.** No `<PREFIX>_PAY_TO`, no gate: every route stays free, which is what an
 * operator running their own server gets (ADR `0045`). Turning it on takes an address and a price,
 * both stated, because a price nobody chose is a price somebody invented.
 */
import {getAddress, isAddress, type Address} from "viem";

import {X402_TESTNET} from "../arp/x402.js";

export type X402Config = {
    /** CAIP-2. Only Base Sepolia is accepted on this branch. */
    network: `${string}:${string}`;
    /** The address the USDC is paid to. */
    payTo: Address;
    /** A dollar amount as `@x402/evm` reads it: `"$0.001"`. Converted to USDC atomic units by the scheme. */
    price: string;
    facilitatorUrl: string;
    /** How long a signed authorisation stays valid, in seconds. The `exact` scheme's own bound. */
    maxTimeoutSeconds: number;
};

const PRICE = /^\$(0|[1-9][0-9]*)(\.[0-9]{1,6})?$/;
const DEFAULT_TIMEOUT_SECONDS = 300;

/**
 * The gate's configuration from `env`, or `null` when `<prefix>_PAY_TO` is unset, or an `Error`
 * naming the variable that is wrong.
 *
 * - `<prefix>_PAY_TO`          the address paid. Its presence is what turns the gate on.
 * - `<prefix>_PRICE`           required with it: `$` and a decimal, at most 6 places (USDC's).
 * - `<prefix>_NETWORK`         default `eip155:84532`. Nothing else is accepted yet: a mainnet
 *                              facilitator is an open decision, not a default.
 * - `<prefix>_FACILITATOR_URL` default `https://x402.org/facilitator`.
 * - `<prefix>_TIMEOUT_SECONDS` default 300.
 */
export function x402ConfigFrom(
    env: Readonly<Record<string, string | undefined>>,
    prefix: string,
): X402Config | null | Error {
    const read = (name: string): string | undefined => {
        const value = env[`${prefix}_${name}`]?.trim();
        return value === undefined || value.length === 0 ? undefined : value;
    };

    const payTo = read("PAY_TO");
    if (payTo === undefined) return null;
    if (!isAddress(payTo)) return new Error(`${prefix}_PAY_TO must be an address, got ${payTo}`);

    const price = read("PRICE");
    if (price === undefined) {
        return new Error(`${prefix}_PRICE is required with ${prefix}_PAY_TO, as "$0.001"`);
    }
    if (!PRICE.test(price) || Number(price.slice(1)) <= 0) {
        return new Error(`${prefix}_PRICE must be a positive "$" amount with at most 6 decimals, got ${price}`);
    }

    const network = read("NETWORK") ?? X402_TESTNET.network;
    if (network !== X402_TESTNET.network) {
        return new Error(
            `${prefix}_NETWORK ${network} is not accepted: only ${X402_TESTNET.network} (Base Sepolia) until a mainnet facilitator is chosen`,
        );
    }

    const facilitatorUrl = read("FACILITATOR_URL") ?? X402_TESTNET.facilitatorUrl;
    if (!/^https?:\/\/[^\s]+$/.test(facilitatorUrl)) {
        return new Error(`${prefix}_FACILITATOR_URL must be an http(s) URL, got ${facilitatorUrl}`);
    }

    const timeout = read("TIMEOUT_SECONDS");
    const maxTimeoutSeconds = timeout === undefined ? DEFAULT_TIMEOUT_SECONDS : Number(timeout);
    if (!Number.isInteger(maxTimeoutSeconds) || maxTimeoutSeconds <= 0) {
        return new Error(`${prefix}_TIMEOUT_SECONDS must be a positive integer, got ${timeout}`);
    }

    return {network: X402_TESTNET.network, payTo: getAddress(payTo), price, facilitatorUrl, maxTimeoutSeconds};
}
