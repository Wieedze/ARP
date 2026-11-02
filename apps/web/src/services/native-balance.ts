import {type Address} from "viem";

import {publicClient} from "../lib/clients";

/**
 * The native balance of an address on 13579, in wei. Testnet by construction: `publicClient` is
 * bound to ARP's own rig (`rules/portability.md`).
 */
export async function readNativeBalance(address: Address): Promise<bigint> {
    return publicClient.getBalance({address});
}
