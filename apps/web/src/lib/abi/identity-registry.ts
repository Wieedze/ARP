/**
 * Minimal ABI fragment for the vendored ERC-8004 `IdentityRegistry`.
 *
 * The full ChaosChain reference implementation has ~20 functions (metadata
 * batch ops, agentWallet management, EIP-712 signature verification, etc.).
 * For Task 04b's MVP scope we only need:
 *
 *   - register() — create a new agent NFT for `msg.sender`
 *   - totalAgents()
 *   - agentExists(id)
 *   - balanceOf(owner) — count NFTs owned (heuristic: if > 0, user has an agent)
 *   - tokenURI(id)
 *
 * Plus the `Registered(uint256 indexed agentId, string agentURI, address indexed to)`
 * event so the UI can recover an agentId by filtering by owner.
 */
export const identityRegistryAbi = [
    {
        type: "function",
        stateMutability: "nonpayable",
        name: "register",
        inputs: [],
        outputs: [{name: "agentId", type: "uint256"}],
    },
    /**
     * The form that actually produces a readable identity. Probed on Base 8453 on 2026-10-27:
     * it simulates from a zero-balance address, same as the no-arg form.
     *
     * `register()` leaves `tokenURI` empty, which is a legal identity that says nothing — and the
     * state agents 6649 and 500000 are in. Everything downstream degrades from it: no `tokenURI`,
     * no `registrationFile`, so `prepareIdentityAtom` falls back and the agent reads as
     * `Agent 8453:6649`.
     */
    {
        type: "function",
        stateMutability: "nonpayable",
        name: "register",
        inputs: [{name: "agentURI", type: "string"}],
        outputs: [{name: "agentId", type: "uint256"}],
    },
    /** Owner-only. Probed: it reverts `Not authorized` for anybody else. */
    {
        type: "function",
        stateMutability: "nonpayable",
        name: "setAgentURI",
        inputs: [
            {name: "agentId", type: "uint256"},
            {name: "agentURI", type: "string"},
        ],
        outputs: [],
    },
    {
        type: "function",
        stateMutability: "view",
        name: "totalAgents",
        inputs: [],
        outputs: [{name: "count", type: "uint256"}],
    },
    {
        type: "function",
        stateMutability: "view",
        name: "agentExists",
        inputs: [{name: "agentId", type: "uint256"}],
        outputs: [{name: "exists", type: "bool"}],
    },
    {
        type: "function",
        stateMutability: "view",
        name: "balanceOf",
        inputs: [{name: "owner", type: "address"}],
        outputs: [{name: "", type: "uint256"}],
    },
    {
        type: "function",
        stateMutability: "view",
        name: "ownerOf",
        inputs: [{name: "tokenId", type: "uint256"}],
        outputs: [{name: "", type: "address"}],
    },
    {
        type: "function",
        stateMutability: "view",
        name: "tokenURI",
        inputs: [{name: "tokenId", type: "uint256"}],
        outputs: [{name: "", type: "string"}],
    },
    {
        type: "function",
        stateMutability: "view",
        name: "getAgentWallet",
        inputs: [{name: "agentId", type: "uint256"}],
        outputs: [{name: "wallet", type: "address"}],
    },
    {
        type: "function",
        stateMutability: "nonpayable",
        name: "setAgentWallet",
        inputs: [
            {name: "agentId", type: "uint256"},
            {name: "newWallet", type: "address"},
            {name: "deadline", type: "uint256"},
            {name: "signature", type: "bytes"},
        ],
        outputs: [],
    },
    {
        type: "event",
        name: "Registered",
        inputs: [
            {name: "agentId", type: "uint256", indexed: true},
            {name: "agentURI", type: "string", indexed: false},
            {name: "to", type: "address", indexed: true},
        ],
    },
    {
        type: "event",
        name: "AgentWalletSet",
        inputs: [
            {name: "agentId", type: "uint256", indexed: true},
            {name: "wallet", type: "address", indexed: true},
            {name: "setBy", type: "address", indexed: true},
        ],
    },
] as const;
