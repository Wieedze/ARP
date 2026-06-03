import {
    parseAbiItem,
    type Account,
    type Address,
    type Chain,
    type Hex,
    type PublicClient,
    type Transport,
    type WalletClient,
} from "viem";
import {generatePrivateKey, privateKeyToAccount} from "viem/accounts";

import {identityRegistryAbi} from "../lib/abi/identity-registry";
import {intuitionTestnet} from "../lib/chains";
import {deployments} from "../lib/deployments";

const ADDRESS = deployments.arp.identityRegistry;

/**
 * EIP-712 domain for the deployed IdentityRegistry. `name` and `version`
 * match the constants in the contract's constructor; `chainId` and
 * `verifyingContract` are bound to our Intuition Testnet deployment.
 */
const EIP712_DOMAIN = {
    name: "ERC-8004 IdentityRegistry",
    version: "1.1",
    chainId: deployments.chain.chainId,
    verifyingContract: ADDRESS,
} as const;

const SET_AGENT_WALLET_TYPES = {
    SetAgentWallet: [
        {name: "agentId", type: "uint256"},
        {name: "newWallet", type: "address"},
        {name: "deadline", type: "uint256"},
    ],
} as const;

/**
 * Mint a new ERC-8004 agent NFT for the caller. The `register()` overload
 * with no arguments creates an agent without an off-chain metadata URI;
 * the agentURI can be set later via `setAgentURI` (out of MVP scope).
 *
 * Returns the assigned `agentId` (also emitted as the `Registered` event
 * topic — we parse the receipt to recover it).
 */
export async function registerAgent(params: {
    walletClient: WalletClient<Transport, Chain, Account>;
    publicClient: PublicClient;
}): Promise<{agentId: bigint; tx: Hex}> {
    const tx = await params.walletClient.writeContract({
        address: ADDRESS,
        abi: identityRegistryAbi,
        functionName: "register",
        args: [],
        chain: intuitionTestnet,
    });
    const receipt = await params.publicClient.waitForTransactionReceipt({hash: tx});

    // Recover the agentId from the Registered event. `to` is indexed; the
    // event signature matches the ABI item we provided.
    const event = parseAbiItem(
        "event Registered(uint256 indexed agentId, string agentURI, address indexed to)",
    );
    const logs = await params.publicClient.getLogs({
        address: ADDRESS,
        event,
        fromBlock: receipt.blockNumber,
        toBlock: receipt.blockNumber,
        args: {to: params.walletClient.account.address},
    });

    const last = logs[logs.length - 1];
    if (!last || last.args.agentId === undefined) {
        throw new Error("registerAgent: Registered event not found in receipt block");
    }
    return {agentId: last.args.agentId, tx};
}

/**
 * Find the latest agentId owned by `owner`. Uses a `Registered` event scan
 * over the full chain history (cheap enough for our MVP — the registry is
 * small). Returns `null` if the address has never registered.
 *
 * If `owner` registered multiple agents, the most recent is returned.
 */
export async function findAgentIdByOwner(params: {
    owner: Address;
    publicClient: PublicClient;
}): Promise<bigint | null> {
    const event = parseAbiItem(
        "event Registered(uint256 indexed agentId, string agentURI, address indexed to)",
    );
    const logs = await params.publicClient.getLogs({
        address: ADDRESS,
        event,
        fromBlock: 0n,
        toBlock: "latest",
        args: {to: params.owner},
    });
    if (logs.length === 0) return null;

    // Pick the most recent; logs are returned in chronological order.
    const last = logs[logs.length - 1];
    return last.args.agentId ?? null;
}

/**
 * Generate a fresh agent runtime keypair and bind it to an agent NFT via
 * `setAgentWallet`.
 *
 * The conceptual split (ADR 0010, post-recentrage):
 *
 *   - The agent NFT owner = the OPERATOR (human team running the agent)
 *   - The agentWallet     = the agent's RUNTIME wallet (the keys the
 *                            autonomous program holds)
 *
 * ERC-8004 binds these explicitly: `setAgentWallet(agentId, newWallet, ...)`.
 * The runtime wallet must consent via an EIP-712 signature over
 * `SetAgentWallet(agentId, newWallet, deadline)` — proves the new wallet
 * agreed to be designated.
 *
 * For the demo we generate the runtime key in the browser and immediately
 * compute the signature. The caller is responsible for surfacing the
 * generated private key to the operator (one-time display) so it can be
 * given to the agent's runtime later.
 *
 * @returns `{ agentWalletAddress, agentWalletPrivateKey, tx }`. The private
 *          key is returned ONCE — the caller MUST display it and the
 *          operator MUST save it; there is no recovery.
 */
export async function designateAgentRuntimeWallet(params: {
    agentId: bigint;
    operatorWalletClient: WalletClient<Transport, Chain, Account>;
    publicClient: PublicClient;
    /** Seconds from now after which the signature expires. Default 1 h. */
    validForSeconds?: number;
}): Promise<{agentWalletAddress: Address; agentWalletPrivateKey: Hex; tx: Hex}> {
    const privateKey = generatePrivateKey();
    const account = privateKeyToAccount(privateKey);

    const now = Math.floor(Date.now() / 1000);
    const deadline = BigInt(now + (params.validForSeconds ?? 3600));

    const signature = await account.signTypedData({
        domain: EIP712_DOMAIN,
        types: SET_AGENT_WALLET_TYPES,
        primaryType: "SetAgentWallet",
        message: {
            agentId: params.agentId,
            newWallet: account.address,
            deadline,
        },
    });

    const tx = await params.operatorWalletClient.writeContract({
        address: ADDRESS,
        abi: identityRegistryAbi,
        functionName: "setAgentWallet",
        args: [params.agentId, account.address, deadline, signature],
        chain: intuitionTestnet,
    });
    await params.publicClient.waitForTransactionReceipt({hash: tx});

    return {
        agentWalletAddress: account.address,
        agentWalletPrivateKey: privateKey,
        tx,
    };
}
