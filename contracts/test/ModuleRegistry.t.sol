// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {ModuleRegistry} from "../src/ModuleRegistry.sol";

contract ModuleRegistryTest is Test {
    ModuleRegistry internal registry;

    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    string internal constant VALID_NAME = "Solidity Audit";
    string internal constant VALID_DOMAIN = "solidity-audit";
    string internal constant VALID_SCHEMA_URI = "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";
    string internal constant VALID_DESCRIPTION = "Auditor module for Solidity contracts.";

    event ModuleRegistered(
        uint256 indexed id,
        address indexed creator,
        string indexed domain,
        string name,
        string schemaURI
    );

    function setUp() public {
        registry = new ModuleRegistry();
    }

    /*//////////////////////////////////////////////////////////////
                              HAPPY PATH
    //////////////////////////////////////////////////////////////*/

    function test_registerModule_returnsIncrementingIds() public {
        vm.prank(alice);
        uint256 id1 = registry.registerModule(VALID_NAME, VALID_DOMAIN, "ipfs://bafy1", "");
        vm.prank(bob);
        uint256 id2 = registry.registerModule(VALID_NAME, VALID_DOMAIN, "ipfs://bafy2", "");
        vm.prank(alice);
        uint256 id3 = registry.registerModule(VALID_NAME, VALID_DOMAIN, "ipfs://bafy3", "");

        assertEq(id1, 1);
        assertEq(id2, 2);
        assertEq(id3, 3);
    }

    function test_registerModule_emitsEvent() public {
        vm.expectEmit(true, true, true, true, address(registry));
        emit ModuleRegistered(1, alice, VALID_DOMAIN, VALID_NAME, VALID_SCHEMA_URI);

        vm.prank(alice);
        registry.registerModule(VALID_NAME, VALID_DOMAIN, VALID_SCHEMA_URI, VALID_DESCRIPTION);
    }

    function test_registerModule_storesCorrectData() public {
        vm.warp(1_700_000_000);
        vm.prank(alice);
        uint256 id = registry.registerModule(VALID_NAME, VALID_DOMAIN, VALID_SCHEMA_URI, VALID_DESCRIPTION);

        ModuleRegistry.Module memory m = registry.getModule(id);
        assertEq(m.id, 1);
        assertEq(m.name, VALID_NAME);
        assertEq(m.domain, VALID_DOMAIN);
        assertEq(m.schemaURI, VALID_SCHEMA_URI);
        assertEq(m.description, VALID_DESCRIPTION);
        assertEq(m.creator, alice);
        assertEq(m.createdAt, 1_700_000_000);
    }

    function test_totalModules_startsAtZero() public view {
        assertEq(registry.totalModules(), 0);
    }

    function test_totalModules_incrementsOnRegister() public {
        vm.prank(alice);
        registry.registerModule(VALID_NAME, VALID_DOMAIN, "ipfs://bafy1", "");
        assertEq(registry.totalModules(), 1);

        vm.prank(bob);
        registry.registerModule(VALID_NAME, VALID_DOMAIN, "ipfs://bafy2", "");
        assertEq(registry.totalModules(), 2);
    }

    function test_getModulesByDomain_returnsCorrectIds() public {
        vm.startPrank(alice);
        registry.registerModule("M1", "solidity-audit", "ipfs://bafy1", "");
        registry.registerModule("M2", "url-classification", "ipfs://bafy2", "");
        registry.registerModule("M3", "solidity-audit", "ipfs://bafy3", "");
        vm.stopPrank();

        uint256[] memory auditIds = registry.getModulesByDomain("solidity-audit");
        assertEq(auditIds.length, 2);
        assertEq(auditIds[0], 1);
        assertEq(auditIds[1], 3);

        uint256[] memory urlIds = registry.getModulesByDomain("url-classification");
        assertEq(urlIds.length, 1);
        assertEq(urlIds[0], 2);

        uint256[] memory missing = registry.getModulesByDomain("claim-verification");
        assertEq(missing.length, 0);
    }

    function test_registerModule_acceptsBoundaries() public {
        // name at max (64), domain at max (63), schemaURI at max (128), description at max (512)
        string memory maxName = string(_repeat(0x61, 64));
        string memory maxDomain = string(_repeat(0x61, 63));
        string memory maxSchemaURI = string(abi.encodePacked("ipfs://", _repeat(0x61, 121)));
        string memory maxDescription = string(_repeat(0x61, 512));

        vm.prank(alice);
        uint256 id = registry.registerModule(maxName, maxDomain, maxSchemaURI, maxDescription);
        assertEq(id, 1);

        ModuleRegistry.Module memory m = registry.getModule(1);
        assertEq(bytes(m.name).length, 64);
        assertEq(bytes(m.domain).length, 63);
        assertEq(bytes(m.schemaURI).length, 128);
        assertEq(bytes(m.description).length, 512);
    }

    function test_registerModule_acceptsEmptyDescription() public {
        vm.prank(alice);
        uint256 id = registry.registerModule(VALID_NAME, VALID_DOMAIN, VALID_SCHEMA_URI, "");
        assertEq(id, 1);
        assertEq(registry.getModule(1).description, "");
    }

    function test_registerModule_acceptsDigitsAndHyphensInDomain() public {
        vm.prank(alice);
        uint256 id = registry.registerModule(VALID_NAME, "abc-123-xyz", VALID_SCHEMA_URI, "");
        assertEq(id, 1);
    }

    function test_registerModule_acceptsMinimumDomainLength() public {
        // 2 chars: first must be a-z, second can be a-z, 0-9, or -
        vm.startPrank(alice);
        registry.registerModule(VALID_NAME, "ab", "ipfs://bafy-min1", "");
        registry.registerModule(VALID_NAME, "a9", "ipfs://bafy-min2", "");
        registry.registerModule(VALID_NAME, "a-", "ipfs://bafy-min3", "");
        vm.stopPrank();
        assertEq(registry.totalModules(), 3);
    }

    /*//////////////////////////////////////////////////////////////
                              REVERT PATHS
    //////////////////////////////////////////////////////////////*/

    function test_registerModule_revertsOnEmptyName() public {
        vm.expectRevert(ModuleRegistry.EmptyName.selector);
        registry.registerModule("", VALID_DOMAIN, VALID_SCHEMA_URI, "");
    }

    function test_registerModule_revertsOnNameTooLong() public {
        string memory longName = string(_repeat(0x61, 65));
        vm.expectRevert(ModuleRegistry.NameTooLong.selector);
        registry.registerModule(longName, VALID_DOMAIN, VALID_SCHEMA_URI, "");
    }

    function test_registerModule_revertsOnEmptyDomain() public {
        vm.expectRevert(ModuleRegistry.InvalidDomain.selector);
        registry.registerModule(VALID_NAME, "", VALID_SCHEMA_URI, "");
    }

    function test_registerModule_revertsOnDomainTooShort() public {
        vm.expectRevert(ModuleRegistry.InvalidDomain.selector);
        registry.registerModule(VALID_NAME, "a", VALID_SCHEMA_URI, "");
    }

    function test_registerModule_revertsOnDomainTooLong() public {
        string memory longDomain = string(_repeat(0x61, 64));
        vm.expectRevert(ModuleRegistry.InvalidDomain.selector);
        registry.registerModule(VALID_NAME, longDomain, VALID_SCHEMA_URI, "");
    }

    function test_registerModule_revertsOnDomainStartsWithDigit() public {
        vm.expectRevert(ModuleRegistry.InvalidDomain.selector);
        registry.registerModule(VALID_NAME, "1abc", VALID_SCHEMA_URI, "");
    }

    function test_registerModule_revertsOnDomainStartsWithHyphen() public {
        vm.expectRevert(ModuleRegistry.InvalidDomain.selector);
        registry.registerModule(VALID_NAME, "-abc", VALID_SCHEMA_URI, "");
    }

    function test_registerModule_revertsOnDomainUppercase() public {
        vm.expectRevert(ModuleRegistry.InvalidDomain.selector);
        registry.registerModule(VALID_NAME, "Abc", VALID_SCHEMA_URI, "");
    }

    function test_registerModule_revertsOnDomainContainsSpace() public {
        vm.expectRevert(ModuleRegistry.InvalidDomain.selector);
        registry.registerModule(VALID_NAME, "ab c", VALID_SCHEMA_URI, "");
    }

    function test_registerModule_revertsOnDomainContainsUnderscore() public {
        vm.expectRevert(ModuleRegistry.InvalidDomain.selector);
        registry.registerModule(VALID_NAME, "ab_c", VALID_SCHEMA_URI, "");
    }

    function test_registerModule_revertsOnDomainContainsDot() public {
        vm.expectRevert(ModuleRegistry.InvalidDomain.selector);
        registry.registerModule(VALID_NAME, "ab.c", VALID_SCHEMA_URI, "");
    }

    function test_registerModule_revertsOnInvalidSchemaURI_noScheme() public {
        vm.expectRevert(ModuleRegistry.InvalidSchemaURI.selector);
        registry.registerModule(VALID_NAME, VALID_DOMAIN, "bafyxxxxxxxxxxx", "");
    }

    function test_registerModule_revertsOnInvalidSchemaURI_httpScheme() public {
        vm.expectRevert(ModuleRegistry.InvalidSchemaURI.selector);
        registry.registerModule(VALID_NAME, VALID_DOMAIN, "http://example.com", "");
    }

    function test_registerModule_revertsOnInvalidSchemaURI_tooShort() public {
        // length < 7 (the IPFS_SCHEME byte length)
        vm.expectRevert(ModuleRegistry.InvalidSchemaURI.selector);
        registry.registerModule(VALID_NAME, VALID_DOMAIN, "ipfs:/", "");
    }

    function test_registerModule_revertsOnInvalidSchemaURI_tooLong() public {
        // ipfs:// (7) + 122 'a' = 129 bytes > 128
        string memory uri = string(abi.encodePacked("ipfs://", _repeat(0x61, 122)));
        vm.expectRevert(ModuleRegistry.InvalidSchemaURI.selector);
        registry.registerModule(VALID_NAME, VALID_DOMAIN, uri, "");
    }

    function test_registerModule_revertsOnDescriptionTooLong() public {
        string memory longDesc = string(_repeat(0x61, 513));
        vm.expectRevert(ModuleRegistry.DescriptionTooLong.selector);
        registry.registerModule(VALID_NAME, VALID_DOMAIN, VALID_SCHEMA_URI, longDesc);
    }

    function test_getModule_revertsOnIdZero() public {
        vm.expectRevert(abi.encodeWithSelector(ModuleRegistry.ModuleNotFound.selector, 0));
        registry.getModule(0);
    }

    function test_getModule_revertsOnNonexistentId() public {
        vm.prank(alice);
        registry.registerModule(VALID_NAME, VALID_DOMAIN, VALID_SCHEMA_URI, "");
        // Registered ids: {1}. Asking for 2 reverts.
        vm.expectRevert(abi.encodeWithSelector(ModuleRegistry.ModuleNotFound.selector, 2));
        registry.getModule(2);
    }

    function test_getModule_revertsOnEmptyRegistry() public {
        // No modules registered; asking for id 1 reverts (1 >= _nextId == 1).
        vm.expectRevert(abi.encodeWithSelector(ModuleRegistry.ModuleNotFound.selector, 1));
        registry.getModule(1);
    }

    /*//////////////////////////////////////////////////////////////
                       SCHEMA URI UNIQUENESS (ADR 0013)
    //////////////////////////////////////////////////////////////*/

    function test_registerModule_revertsOnDuplicateSchemaURI() public {
        vm.prank(alice);
        uint256 firstId = registry.registerModule(VALID_NAME, VALID_DOMAIN, VALID_SCHEMA_URI, "");

        vm.expectRevert(
            abi.encodeWithSelector(ModuleRegistry.ModuleAlreadyRegistered.selector, firstId)
        );
        vm.prank(bob);
        registry.registerModule("Different Name", "different-domain", VALID_SCHEMA_URI, "");
    }

    function test_registerModule_revertsOnDuplicateSchemaURI_sameCreator() public {
        // Even the original creator cannot re-register their own module.
        vm.startPrank(alice);
        uint256 firstId = registry.registerModule(VALID_NAME, VALID_DOMAIN, VALID_SCHEMA_URI, "");

        vm.expectRevert(
            abi.encodeWithSelector(ModuleRegistry.ModuleAlreadyRegistered.selector, firstId)
        );
        registry.registerModule(VALID_NAME, VALID_DOMAIN, VALID_SCHEMA_URI, "");
        vm.stopPrank();
    }

    function test_getModuleIdBySchemaURI_returnsZeroBeforeRegistration() public view {
        assertEq(registry.getModuleIdBySchemaURI(VALID_SCHEMA_URI), 0);
    }

    function test_getModuleIdBySchemaURI_returnsIdAfterRegistration() public {
        vm.prank(alice);
        uint256 id = registry.registerModule(VALID_NAME, VALID_DOMAIN, VALID_SCHEMA_URI, "");
        assertEq(registry.getModuleIdBySchemaURI(VALID_SCHEMA_URI), id);
    }

    function test_getModuleIdBySchemaURI_returnsZeroForUnknownURI() public {
        vm.prank(alice);
        registry.registerModule(VALID_NAME, VALID_DOMAIN, "ipfs://bafy-registered", "");
        assertEq(registry.getModuleIdBySchemaURI("ipfs://bafy-unknown"), 0);
    }

    function test_uniqueness_doesNotBlockOtherDomainsOrNames() public {
        vm.startPrank(alice);
        registry.registerModule("Slither", "solidity-audit", "ipfs://bafy-slither", "");
        registry.registerModule("Mythril", "solidity-audit", "ipfs://bafy-mythril", "");
        registry.registerModule("Slither", "different-domain", "ipfs://bafy-slither-2", "");
        vm.stopPrank();
        assertEq(registry.totalModules(), 3);
    }

    /*//////////////////////////////////////////////////////////////
                                  FUZZ
    //////////////////////////////////////////////////////////////*/

    function testFuzz_registerModule_acceptsValidInputs(
        uint8 nameLenSeed,
        uint8 domainLenSeed,
        uint16 descLenSeed,
        address caller
    ) public {
        vm.assume(caller != address(0));
        uint256 nameLen = bound(nameLenSeed, 1, 64);
        uint256 domainLen = bound(domainLenSeed, 2, 63);
        uint256 descLen = bound(descLenSeed, 0, 512);

        string memory name = string(_repeat(0x61, nameLen));
        string memory domain = string(_repeat(0x61, domainLen));
        string memory schemaURI = "ipfs://bafy1";
        string memory description = string(_repeat(0x61, descLen));

        vm.prank(caller);
        uint256 id = registry.registerModule(name, domain, schemaURI, description);
        assertEq(id, 1);
        assertEq(registry.totalModules(), 1);
        assertEq(registry.getModule(1).creator, caller);
    }

    function testFuzz_registerModule_rejectsInvalidFirstChar(bytes1 firstByte) public {
        // Valid first byte is in [0x61, 0x7a]. Reject anything else.
        vm.assume(firstByte < 0x61 || firstByte > 0x7a);
        bytes memory domain = new bytes(5);
        domain[0] = firstByte;
        domain[1] = 0x61; // 'a'
        domain[2] = 0x61;
        domain[3] = 0x61;
        domain[4] = 0x61;

        vm.expectRevert(ModuleRegistry.InvalidDomain.selector);
        registry.registerModule(VALID_NAME, string(domain), VALID_SCHEMA_URI, "");
    }

    function testFuzz_registerModule_rejectsInvalidMiddleChar(uint8 idxSeed, bytes1 c) public {
        // Valid middle byte is in {a-z, 0-9, -}. Reject anything else.
        bool isLower = (c >= 0x61 && c <= 0x7a);
        bool isDigit = (c >= 0x30 && c <= 0x39);
        bool isHyphen = (c == 0x2d);
        vm.assume(!isLower && !isDigit && !isHyphen);

        uint256 idx = bound(idxSeed, 1, 9);
        bytes memory domain = new bytes(10);
        domain[0] = 0x61; // first must be valid
        for (uint256 i = 1; i < 10; i++) domain[i] = 0x61;
        domain[idx] = c;

        vm.expectRevert(ModuleRegistry.InvalidDomain.selector);
        registry.registerModule(VALID_NAME, string(domain), VALID_SCHEMA_URI, "");
    }

    /*//////////////////////////////////////////////////////////////
                                HELPERS
    //////////////////////////////////////////////////////////////*/

    function _repeat(uint8 c, uint256 n) internal pure returns (bytes memory) {
        bytes memory out = new bytes(n);
        for (uint256 i = 0; i < n; i++) out[i] = bytes1(c);
        return out;
    }
}

/*//////////////////////////////////////////////////////////////
                           INVARIANT TESTS
//////////////////////////////////////////////////////////////*/

/// @dev Wraps `registerModule` to bound inputs to the valid surface so the
///      invariant runner doesn't waste cycles on revert paths. Tracks the
///      number of successful registrations as a ghost variable.
contract Handler is Test {
    ModuleRegistry public registry;
    uint256 public successCount;

    constructor(ModuleRegistry _registry) {
        registry = _registry;
    }

    function registerModule(
        uint8 nameLenSeed,
        uint8 domainLenSeed,
        uint16 descLenSeed
    ) external {
        uint256 nameLen = bound(nameLenSeed, 1, 64);
        uint256 domainLen = bound(domainLenSeed, 2, 63);
        uint256 descLen = bound(descLenSeed, 0, 512);

        bytes memory n = new bytes(nameLen);
        for (uint256 i = 0; i < nameLen; i++) n[i] = bytes1(0x61);
        bytes memory d = new bytes(domainLen);
        for (uint256 i = 0; i < domainLen; i++) d[i] = bytes1(0x61);
        bytes memory desc = new bytes(descLen);
        for (uint256 i = 0; i < descLen; i++) desc[i] = bytes1(0x61);

        // Unique schemaURI per call: the registry now enforces a single
        // module per URI (ADR 0013). Feed the call counter into the URI so
        // every iteration registers a fresh URI and the invariants still
        // exercise multiple successful registrations.
        string memory uri = string(
            abi.encodePacked("ipfs://bafy-handler-", vm.toString(successCount + 1))
        );
        registry.registerModule(string(n), string(d), uri, string(desc));
        successCount++;
    }
}

contract ModuleRegistryInvariantTest is StdInvariant, Test {
    ModuleRegistry internal registry;
    Handler internal handler;

    function setUp() public {
        registry = new ModuleRegistry();
        handler = new Handler(registry);

        bytes4[] memory selectors = new bytes4[](1);
        selectors[0] = Handler.registerModule.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
        targetContract(address(handler));
    }

    /// Invariant: after any sequence of successful registrations, the public
    /// counter equals the number of registrations the handler made.
    function invariant_totalModulesMatchesHandlerCount() public view {
        assertEq(registry.totalModules(), handler.successCount());
    }

    /// Invariant: every assigned id from 1..totalModules is retrievable and
    /// the retrieved struct's `id` field matches its key.
    function invariant_allIdsRetrievable() public view {
        uint256 total = registry.totalModules();
        // Cap the inner loop so the invariant test doesn't degenerate on
        // unbounded runs (Foundry default is 256 calls per run).
        uint256 limit = total > 32 ? 32 : total;
        for (uint256 i = 1; i <= limit; i++) {
            ModuleRegistry.Module memory m = registry.getModule(i);
            assertEq(m.id, i);
        }
    }
}
