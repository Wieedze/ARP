// SPDX-License-Identifier: CC0-1.0
pragma solidity ^0.8.20;

// NOTE: ported from ChaosChain/trustless-agents-erc-ri (CC0-1.0) to
// OpenZeppelin v5 APIs. Two changes vs. the upstream reference impl:
//   1. `utils/Counters` removed (v5 deprecation) → plain `uint256` counter.
//   2. `security/ReentrancyGuard` moved to `utils/ReentrancyGuard`.
// Behavior is byte-equivalent to the reference impl at v5.

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import "./interfaces/IIdentityRegistry.sol";

/**
 * @title IdentityRegistry
 * @dev ERC-8004 Identity Registry - Reference Implementation (Jan 2026 Update)
 * @notice ERC-721 based agent registry with metadata storage and verified payment wallets
 * 
 * This contract implements the Identity Registry as specified in ERC-8004 (Jan 2026 Update).
 * Each agent is represented as an ERC-721 NFT, making agents immediately browsable
 * and transferable with NFT-compliant applications.
 * 
 * Key Features (Jan 2026 Update):
 * - ERC-721 compliance with URIStorage extension
 * - Flexible registration with optional metadata
 * - On-chain key-value metadata storage
 * - Reserved "agentWallet" metadata with EIP-712/ERC-1271 verification
 * - agentWallet auto-resets on transfer for security
 * - setAgentURI() function for updating registration files
 * - Transferable agent ownership
 * 
 * @author ChaosChain Labs
 */
contract IdentityRegistry is ERC721URIStorage, ReentrancyGuard, IIdentityRegistry {
    using ECDSA for bytes32;

    // ============ State Variables ============

    /// @dev Counter for agent IDs (tokenIds). Replaces v4 Counters.Counter.
    uint256 private _agentIdCounter;
    
    /// @dev Mapping from agentId to metadata key to metadata value
    mapping(uint256 => mapping(string => bytes)) private _metadata;
    
    /// @dev Mapping from agentId to agentWallet address (reserved metadata)
    mapping(uint256 => address) private _agentWallet;
    
    // ============ EIP-712 Domain Separator ============
    
    bytes32 private constant _TYPE_HASH = 
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    
    bytes32 private constant _SET_AGENT_WALLET_TYPEHASH = 
        keccak256("SetAgentWallet(uint256 agentId,address newWallet,uint256 deadline)");
    
    bytes32 private immutable _DOMAIN_SEPARATOR;

    // ============ Constructor ============
    
    /**
     * @dev Initializes the ERC-721 contract with name and symbol, and EIP-712 domain
     */
    constructor() ERC721("ERC-8004 Trustless Agent", "AGENT") {
        // Agent IDs start from 1 (0 is reserved for non-existent agents)
        _agentIdCounter = 1;
        
        // Initialize EIP-712 domain separator
        _DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                _TYPE_HASH,
                keccak256(bytes("ERC-8004 IdentityRegistry")),
                keccak256(bytes("1.1")),
                block.chainid,
                address(this)
            )
        );
    }

    // ============ Registration Functions ============
    
    /**
     * @notice Register a new agent with agentURI and metadata
     * @param agentURI The URI pointing to the agent's registration JSON file
     * @param metadata Array of metadata entries to set for the agent
     * @return agentId The newly assigned agent ID
     */
    function register(
        string calldata agentURI, 
        MetadataEntry[] calldata metadata
    ) external nonReentrant returns (uint256 agentId) {
        agentId = _mintAgent(msg.sender, agentURI);
        
        // Set metadata if provided (will reject "agentWallet" key)
        if (metadata.length > 0) {
            _setMetadataBatch(agentId, metadata);
        }
    }
    
    /**
     * @notice Register a new agent with agentURI only
     * @param agentURI The URI pointing to the agent's registration JSON file
     * @return agentId The newly assigned agent ID
     */
    function register(string calldata agentURI) external nonReentrant returns (uint256 agentId) {
        agentId = _mintAgent(msg.sender, agentURI);
    }
    
    /**
     * @notice Register a new agent without agentURI (can be set later)
     * @dev The agentURI can be set later using setAgentURI() by the owner
     * @return agentId The newly assigned agent ID
     */
    function register() external nonReentrant returns (uint256 agentId) {
        agentId = _mintAgent(msg.sender, "");
    }

    // ============ Metadata Functions ============
    
    /**
     * @notice Set metadata for an agent
     * @dev Only the owner or approved operator can set metadata
     * @dev Cannot set the reserved "agentWallet" key - use setAgentWallet() instead
     * @param agentId The agent ID
     * @param metadataKey The metadata key
     * @param metadataValue The metadata value as bytes
     */
    function setMetadata(
        uint256 agentId, 
        string calldata metadataKey, 
        bytes calldata metadataValue
    ) external {
        require(_isApprovedOrOwner(msg.sender, agentId), "Not authorized");
        require(bytes(metadataKey).length > 0, "Empty key");
        require(
            keccak256(bytes(metadataKey)) != keccak256(bytes("agentWallet")),
            "Cannot set agentWallet via setMetadata"
        );
        
        _metadata[agentId][metadataKey] = metadataValue;
        
        emit MetadataSet(agentId, metadataKey, metadataKey, metadataValue);
    }
    
    /**
     * @notice Get metadata for an agent
     * @param agentId The agent ID
     * @param metadataKey The metadata key
     * @return metadataValue The metadata value as bytes
     */
    function getMetadata(
        uint256 agentId, 
        string calldata metadataKey
    ) external view returns (bytes memory metadataValue) {
        require(_exists(agentId), "Agent does not exist");
        
        // Special handling for agentWallet
        if (keccak256(bytes(metadataKey)) == keccak256(bytes("agentWallet"))) {
            return abi.encode(_agentWallet[agentId]);
        }
        
        return _metadata[agentId][metadataKey];
    }
    
    /**
     * @notice Update the agentURI for an agent
     * @dev Only the owner or approved operator can update
     * @param agentId The agent ID
     * @param newURI The new agent URI
     */
    function setAgentURI(uint256 agentId, string calldata newURI) external {
        require(_isApprovedOrOwner(msg.sender, agentId), "Not authorized");
        require(bytes(newURI).length > 0, "Empty URI");
        
        _setTokenURI(agentId, newURI);
        
        emit URIUpdated(agentId, newURI, msg.sender);
    }
    
    /**
     * @notice Set the agentWallet address with signature verification
     * @dev The new wallet must sign to prove ownership (EIP-712 for EOA, ERC-1271 for contracts)
     * @dev Only the owner or approved operator can call this
     * @param agentId The agent ID
     * @param newWallet The new wallet address
     * @param deadline Signature expiration timestamp
     * @param signature The signature from newWallet proving ownership
     */
    function setAgentWallet(
        uint256 agentId,
        address newWallet,
        uint256 deadline,
        bytes calldata signature
    ) external {
        require(_isApprovedOrOwner(msg.sender, agentId), "Not authorized");
        require(newWallet != address(0), "Invalid wallet address");
        require(block.timestamp <= deadline, "Signature expired");
        
        // Construct EIP-712 hash
        bytes32 structHash = keccak256(
            abi.encode(_SET_AGENT_WALLET_TYPEHASH, agentId, newWallet, deadline)
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _DOMAIN_SEPARATOR, structHash));
        
        // Verify signature (try EOA first, then ERC-1271). OZ v5's tryRecover
        // returns a 3-tuple (recovered, error code, error arg) — we ignore the arg.
        (address recoveredSigner, ECDSA.RecoverError recoverErr, ) = ECDSA.tryRecover(digest, signature);

        bool validSignature = (recoverErr == ECDSA.RecoverError.NoError && recoveredSigner == newWallet);
        
        // If EOA recovery fails, try ERC-1271 for smart contract wallets
        if (!validSignature) {
            validSignature = SignatureChecker.isValidSignatureNow(newWallet, digest, signature);
        }
        
        require(validSignature, "Invalid signature");
        
        // Set the wallet
        _agentWallet[agentId] = newWallet;
        
        emit AgentWalletSet(agentId, newWallet, msg.sender);
    }
    
    /**
     * @notice Get the agentWallet address for an agent
     * @param agentId The agent ID
     * @return wallet The agent's payment wallet address
     */
    function getAgentWallet(uint256 agentId) external view returns (address wallet) {
        require(_exists(agentId), "Agent does not exist");
        return _agentWallet[agentId];
    }
    
    /**
     * @notice Clear the agentWallet address (reset to zero address)
     * @dev Only the owner or approved operator can call this
     * @param agentId The agent ID
     */
    function unsetAgentWallet(uint256 agentId) external {
        require(_isApprovedOrOwner(msg.sender, agentId), "Not authorized");
        
        _agentWallet[agentId] = address(0);
        
        emit AgentWalletSet(agentId, address(0), msg.sender);
    }

    // ============ View Functions ============
    
    /**
     * @notice Get the total number of registered agents
     * @return count The total number of agents
     */
    function totalAgents() external view returns (uint256 count) {
        return _agentIdCounter - 1;
    }
    
    /**
     * @notice Check if an agent exists
     * @param agentId The agent ID to check
     * @return exists True if the agent exists
     */
    function agentExists(uint256 agentId) external view returns (bool exists) {
        return _exists(agentId);
    }

    // ============ Internal Functions ============
    
    /**
     * @dev Mints a new agent NFT
     * @param to The address to mint the agent to
     * @param agentURI The agent URI
     * @return agentId The newly minted agent ID
     */
    function _mintAgent(
        address to,
        string memory agentURI
    ) internal returns (uint256 agentId) {
        agentId = _agentIdCounter;
        unchecked {
            _agentIdCounter = agentId + 1;
        }

        _safeMint(to, agentId);
        
        if (bytes(agentURI).length > 0) {
            _setTokenURI(agentId, agentURI);
        }
        
        // Initialize agentWallet to owner's address
        _agentWallet[agentId] = to;
        
        emit Registered(agentId, agentURI, to);
    }

    /**
     * @dev OZ v5 dropped the v4 `_exists` internal helper. Re-add a
     *      semantically equivalent helper so the rest of the ported source
     *      can stay verbatim.
     */
    function _exists(uint256 tokenId) internal view returns (bool) {
        return _ownerOf(tokenId) != address(0);
    }

    /**
     * @dev OZ v5 dropped `_isApprovedOrOwner`. The v5 equivalent is
     *      `_isAuthorized(owner, spender, tokenId)` which returns true
     *      when `spender` is the owner, the approved address, or an
     *      operator-for-all. We re-expose the v4 signature.
     */
    function _isApprovedOrOwner(address spender, uint256 tokenId) internal view returns (bool) {
        address owner = _ownerOf(tokenId);
        return owner != address(0) && _isAuthorized(owner, spender, tokenId);
    }

    /**
     * @dev Sets multiple metadata entries in batch
     * @param agentId The agent ID
     * @param metadata Array of metadata entries
     */
    function _setMetadataBatch(
        uint256 agentId, 
        MetadataEntry[] calldata metadata
    ) internal {
        for (uint256 i = 0; i < metadata.length; i++) {
            require(bytes(metadata[i].metadataKey).length > 0, "Empty key");
            require(
                keccak256(bytes(metadata[i].metadataKey)) != keccak256(bytes("agentWallet")),
                "Cannot set agentWallet via metadata"
            );
            _metadata[agentId][metadata[i].metadataKey] = metadata[i].metadataValue;
            emit MetadataSet(
                agentId, 
                metadata[i].metadataKey, 
                metadata[i].metadataKey, 
                metadata[i].metadataValue
            );
        }
    }
    
    /**
     * @dev OZ v5 moved the v4 `_transfer` hook into `_update`. The v4 source
     *      overrode `_transfer` to reset `agentWallet` on every transfer for
     *      security. The semantically-equivalent v5 hook is `_update`, with
     *      a guard against reset-on-mint (from == 0) and reset-on-burn
     *      (to == 0).
     * @notice agentWallet is reset to address(0) on transfer; the new owner
     *         must re-verify their payment wallet.
     */
    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal virtual override returns (address) {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) {
            _agentWallet[tokenId] = address(0);
        }
        return super._update(to, tokenId, auth);
    }
}
