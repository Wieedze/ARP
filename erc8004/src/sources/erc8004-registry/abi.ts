/**
 * The two ERC-721 reads the ERC-8004 Identity Registry needs.
 *
 * `tokenURI` is where the registration file lives — sometimes an `https://` or
 * `ipfs://` URL, sometimes an inline `data:application/json;base64,…` document.
 * This package exposes whichever it is, verbatim, and does not parse it.
 */
export const identityRegistryAbi = [
    {
        type: "function",
        name: "ownerOf",
        stateMutability: "view",
        inputs: [{name: "tokenId", type: "uint256"}],
        outputs: [{name: "", type: "address"}],
    },
    {
        type: "function",
        name: "tokenURI",
        stateMutability: "view",
        inputs: [{name: "tokenId", type: "uint256"}],
        outputs: [{name: "", type: "string"}],
    },
] as const;
