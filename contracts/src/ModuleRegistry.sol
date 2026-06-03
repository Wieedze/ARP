// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title  ModuleRegistry
/// @notice On-chain registry of ARP modules. A module is an attestation type
///         declared by a creator: a name, a domain it belongs to, an IPFS URI
///         pointing at its JSON Schema, and an optional description.
/// @dev    Permissionless: any address can register. Registration is
///         append-only — modules cannot be updated or deleted in the MVP.
///         ID 0 is reserved as a null sentinel; the first registered module
///         has id 1.
///
///         This contract has no external calls and no admin role. The only
///         state mutation is `registerModule`. Reentrancy is structurally
///         impossible.
///
///         Domain identifiers are lowercase kebab-case strings validated by
///         the on-chain equivalent of the regex `^[a-z][a-z0-9-]{1,62}$`.
///         Strings indexed in events are hashed by Solidity into the topic.
contract ModuleRegistry {
    /*//////////////////////////////////////////////////////////////
                              CUSTOM ERRORS
    //////////////////////////////////////////////////////////////*/

    /// @notice Thrown when `name` is empty (zero bytes).
    error EmptyName();

    /// @notice Thrown when `name` exceeds 64 bytes.
    error NameTooLong();

    /// @notice Thrown when `domain` violates the kebab-case schema.
    /// @dev    Valid domains match `^[a-z][a-z0-9-]{1,62}$` — first byte must
    ///         be a-z, remaining 1–62 bytes must be a-z, 0-9, or '-'.
    error InvalidDomain();

    /// @notice Thrown when `schemaURI` does not start with `ipfs://` or
    ///         exceeds 128 bytes.
    error InvalidSchemaURI();

    /// @notice Thrown when `description` exceeds 512 bytes.
    error DescriptionTooLong();

    /// @notice Thrown by `getModule` when the requested id was never
    ///         registered. id 0 always reverts.
    /// @param  id The id that was requested.
    error ModuleNotFound(uint256 id);

    /// @notice Thrown by `registerModule` when a module with the same
    ///         `schemaURI` already exists. ADR 0008 fixes `schemaURI` as
    ///         the canonical tool identifier — one URI maps to one module,
    ///         enforced at the registry level so the marketplace cannot be
    ///         flooded with duplicates.
    /// @param  existingId The id of the pre-existing module.
    error ModuleAlreadyRegistered(uint256 existingId);

    /*//////////////////////////////////////////////////////////////
                                  EVENTS
    //////////////////////////////////////////////////////////////*/

    /// @notice Emitted on every successful module registration.
    /// @dev    `domain` is indexed; Solidity hashes the string into the topic,
    ///         so off-chain consumers filter by `keccak256(bytes(domain))`.
    /// @param  id        The newly allocated module id (always >= 1).
    /// @param  creator   The address that registered the module (msg.sender).
    /// @param  domain    The module's domain identifier (kebab-case).
    /// @param  name      The module's human-readable name.
    /// @param  schemaURI The IPFS URI of the module's JSON Schema.
    event ModuleRegistered(
        uint256 indexed id,
        address indexed creator,
        string indexed domain,
        string name,
        string schemaURI
    );

    /*//////////////////////////////////////////////////////////////
                                CONSTANTS
    //////////////////////////////////////////////////////////////*/

    uint256 private constant MAX_NAME_LENGTH = 64;
    uint256 private constant MIN_DOMAIN_LENGTH = 2;
    uint256 private constant MAX_DOMAIN_LENGTH = 63;
    uint256 private constant MAX_SCHEMA_URI_LENGTH = 128;
    uint256 private constant MAX_DESCRIPTION_LENGTH = 512;
    bytes7 private constant IPFS_SCHEME = "ipfs://";

    /*//////////////////////////////////////////////////////////////
                                  TYPES
    //////////////////////////////////////////////////////////////*/

    /// @notice A registered module record.
    /// @param  id          The unique module identifier (>= 1).
    /// @param  name        Human-readable module name.
    /// @param  domain      Domain identifier (kebab-case).
    /// @param  schemaURI   IPFS URI of the module's JSON Schema.
    /// @param  description Optional free-form description.
    /// @param  creator     Address that registered the module.
    /// @param  createdAt   Block timestamp at registration.
    struct Module {
        uint256 id;
        string name;
        string domain;
        string schemaURI;
        string description;
        address creator;
        uint256 createdAt;
    }

    /*//////////////////////////////////////////////////////////////
                                 STORAGE
    //////////////////////////////////////////////////////////////*/

    /// @dev id => Module. id 0 is reserved as a null sentinel.
    mapping(uint256 id => Module module) private _modules;

    /// @dev keccak256(bytes(domain)) => list of module ids in that domain.
    mapping(bytes32 domainHash => uint256[] ids) private _modulesByDomainHash;

    /// @dev keccak256(bytes(schemaURI)) => module id. Zero means the URI
    ///      has never been registered. Used to enforce one-module-per-URI
    ///      and to enable O(1) lookup by canonical tool URI.
    mapping(bytes32 schemaURIHash => uint256 id) private _moduleBySchemaURIHash;

    /// @dev Monotonic id allocator. Next module gets `_nextId`, then it
    ///      increments. Starts at 1 so the first registered id is 1.
    uint256 private _nextId = 1;

    /*//////////////////////////////////////////////////////////////
                            EXTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Register a new module. Permissionless; `msg.sender` is recorded
    ///         as the creator. The returned id is monotonically increasing.
    /// @param  name        1–64 byte human-readable name.
    /// @param  domain      Kebab-case domain identifier, 2–63 bytes,
    ///                     matching `^[a-z][a-z0-9-]{1,62}$`.
    /// @param  schemaURI   IPFS URI of the JSON Schema, must start with
    ///                     `ipfs://` and be at most 128 bytes.
    /// @param  description Optional description, at most 512 bytes.
    /// @return id          The newly allocated module id (>= 1).
    function registerModule(
        string calldata name,
        string calldata domain,
        string calldata schemaURI,
        string calldata description
    ) external returns (uint256 id) {
        _validateName(name);
        _validateDomain(domain);
        _validateSchemaURI(schemaURI);
        _validateDescription(description);

        bytes32 uriHash = keccak256(bytes(schemaURI));
        uint256 existing = _moduleBySchemaURIHash[uriHash];
        if (existing != 0) revert ModuleAlreadyRegistered(existing);

        id = _nextId;
        unchecked {
            // `_nextId` cannot realistically overflow uint256 in any feasible
            // chain lifetime. Saves one SSTORE check per registration.
            _nextId = id + 1;
        }

        _modules[id] = Module({
            id: id,
            name: name,
            domain: domain,
            schemaURI: schemaURI,
            description: description,
            creator: msg.sender,
            createdAt: block.timestamp
        });

        _modulesByDomainHash[keccak256(bytes(domain))].push(id);
        _moduleBySchemaURIHash[uriHash] = id;

        emit ModuleRegistered(id, msg.sender, domain, name, schemaURI);
    }

    /// @notice Look up a module id by its canonical `schemaURI`.
    /// @dev    Returns `0` when no module has been registered for the URI.
    ///         Off-chain consumers (the agent runtime, the UI) check this
    ///         before attempting `registerModule` so duplicates do not even
    ///         reach simulation.
    /// @param  schemaURI The IPFS URI to look up.
    /// @return The id of the module registered with this URI, or 0 if none.
    function getModuleIdBySchemaURI(string calldata schemaURI)
        external
        view
        returns (uint256)
    {
        return _moduleBySchemaURIHash[keccak256(bytes(schemaURI))];
    }

    /// @notice Return the module with the given id.
    /// @param  id The module id to look up.
    /// @return    The full `Module` record.
    function getModule(uint256 id) external view returns (Module memory) {
        if (id == 0 || id >= _nextId) revert ModuleNotFound(id);
        return _modules[id];
    }

    /// @notice Return the total number of modules registered so far.
    /// @dev    Equivalent to the highest assigned id. Equals `_nextId - 1`.
    /// @return The count of registered modules.
    function totalModules() external view returns (uint256) {
        unchecked {
            return _nextId - 1;
        }
    }

    /// @notice Return the ids of every module registered under `domain`.
    /// @dev    Returns the empty array if no modules match. Iteration is
    ///         O(n) over the per-domain list — callers must accept that the
    ///         return size grows unboundedly with the number of registrations
    ///         in that domain. Off-chain pagination is the responsibility
    ///         of the caller; the MVP does not paginate on-chain.
    /// @param  domain The domain identifier to filter by.
    /// @return The ids of every module registered under `domain`.
    function getModulesByDomain(
        string calldata domain
    ) external view returns (uint256[] memory) {
        return _modulesByDomainHash[keccak256(bytes(domain))];
    }

    /*//////////////////////////////////////////////////////////////
                            INTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    function _validateName(string calldata name) private pure {
        uint256 len = bytes(name).length;
        if (len == 0) revert EmptyName();
        if (len > MAX_NAME_LENGTH) revert NameTooLong();
    }

    function _validateDomain(string calldata domain) private pure {
        bytes calldata raw = bytes(domain);
        uint256 len = raw.length;
        if (len < MIN_DOMAIN_LENGTH || len > MAX_DOMAIN_LENGTH) revert InvalidDomain();

        // First byte must be lowercase a-z.
        bytes1 first = raw[0];
        if (first < 0x61 || first > 0x7a) revert InvalidDomain();

        // Remaining bytes must be lowercase a-z, digit 0-9, or '-'.
        for (uint256 i = 1; i < len; i++) {
            bytes1 c = raw[i];
            bool isLower = (c >= 0x61 && c <= 0x7a);
            bool isDigit = (c >= 0x30 && c <= 0x39);
            bool isHyphen = (c == 0x2d);
            if (!isLower && !isDigit && !isHyphen) revert InvalidDomain();
        }
    }

    function _validateSchemaURI(string calldata schemaURI) private pure {
        bytes calldata raw = bytes(schemaURI);
        uint256 len = raw.length;
        if (len < 7 || len > MAX_SCHEMA_URI_LENGTH) revert InvalidSchemaURI();
        // Compare the first 7 bytes to "ipfs://" without allocating.
        bytes7 prefix;
        assembly {
            prefix := calldataload(raw.offset)
        }
        if (prefix != IPFS_SCHEME) revert InvalidSchemaURI();
    }

    function _validateDescription(string calldata description) private pure {
        if (bytes(description).length > MAX_DESCRIPTION_LENGTH) {
            revert DescriptionTooLong();
        }
    }
}
