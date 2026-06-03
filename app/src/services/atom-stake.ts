import {
    type Account,
    type Address,
    type Chain,
    type Hex,
    type PublicClient,
    type Transport,
    type WalletClient,
} from "viem";

import {multiVaultAbi} from "../lib/abi/multi-vault";
import {deployments} from "../lib/deployments";

const MULTI_VAULT = deployments.intuition.multiVault;

/**
 * Deposit native-token (tTRUST on Intuition Testnet) onto an atom's
 * bonding curve. This is ARP's "mutable layer" mechanism — an agent
 * declares economic conviction that a tool is part of its composition
 * by locking capital on the tool atom.
 *
 * The shares received scale with the curve at the moment of deposit
 * (typically near-linear at low TVL, more expensive at high TVL — that's
 * the bonding curve's defense against late-comers free-riding on
 * reputation accumulated by early stakers).
 *
 * @returns The transaction hash. Await
 *          `publicClient.waitForTransactionReceipt({hash})` to confirm
 *          and parse the `Deposited` event for actual shares minted.
 */
export async function depositOnAtom(params: {
    atomId: Hex;
    amount: bigint;
    walletClient: WalletClient<Transport, Chain, Account>;
    publicClient: PublicClient;
    receiver?: Address;
    minShares?: bigint;
}): Promise<Hex> {
    // The bonding curve config is chain-level state — read once per
    // session. Cached by React Query at the hook layer; here we re-read
    // because the service stays usable from non-React contexts.
    const curveConfig = await params.publicClient.readContract({
        address: MULTI_VAULT,
        abi: multiVaultAbi,
        functionName: "getBondingCurveConfig",
    });

    return params.walletClient.writeContract({
        address: MULTI_VAULT,
        abi: multiVaultAbi,
        functionName: "deposit",
        args: [
            params.receiver ?? params.walletClient.account.address,
            params.atomId,
            curveConfig.defaultCurveId,
            params.minShares ?? 0n,
        ],
        value: params.amount,
    });
}

/**
 * Read the current state of an atom vault: total assets staked, total
 * shares outstanding. Returns `{ totalAssets: 0n, totalShares: 0n }` if
 * the atom exists but has no deposits.
 */
export async function readVaultState(params: {
    atomId: Hex;
    publicClient: PublicClient;
}): Promise<{totalAssets: bigint; totalShares: bigint; curveId: bigint}> {
    const curveConfig = await params.publicClient.readContract({
        address: MULTI_VAULT,
        abi: multiVaultAbi,
        functionName: "getBondingCurveConfig",
    });
    const [totalAssets, totalShares] = await params.publicClient.readContract({
        address: MULTI_VAULT,
        abi: multiVaultAbi,
        functionName: "getVault",
        args: [params.atomId, curveConfig.defaultCurveId],
    });
    return {totalAssets, totalShares, curveId: curveConfig.defaultCurveId};
}
