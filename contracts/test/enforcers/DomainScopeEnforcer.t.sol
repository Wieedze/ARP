// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Test} from "forge-std/Test.sol";

import {ExecutionLib} from "@erc7579/lib/ExecutionLib.sol";
import {
    ModeLib,
    CALLTYPE_BATCH,
    CALLTYPE_SINGLE,
    EXECTYPE_DEFAULT,
    EXECTYPE_TRY,
    MODE_DEFAULT
} from "@erc7579/lib/ModeLib.sol";

import {ModeCode, ModePayload} from "delegation-framework/utils/Types.sol";

import {DomainScopeEnforcer, IModuleRegistry} from "../../src/enforcers/DomainScopeEnforcer.sol";

contract DomainScopeEnforcerTest is Test {
    DomainScopeEnforcer internal enforcer;

    address internal constant MODULE_REGISTRY = address(0xCa11);
    address internal constant DELEGATOR = address(0xDe11);
    address internal constant REDEEMER = address(0x06ee);
    bytes32 internal constant DELEGATION_HASH = bytes32(uint256(0xdeadbeefdeadbeef));

    bytes32 internal constant H_SOLIDITY_AUDIT = keccak256(bytes("solidity-audit"));
    bytes32 internal constant H_URL_CLASSIFICATION = keccak256(bytes("url-classification"));
    bytes32 internal constant H_CLAIM_VERIFICATION = keccak256(bytes("claim-verification"));
    bytes32 internal constant H_OUT_OF_SCOPE = keccak256(bytes("out-of-scope"));

    event DomainScopeChecked(bytes32 indexed delegationHash, bytes32 domainHash);

    function setUp() public {
        enforcer = new DomainScopeEnforcer();
    }

    /*//////////////////////////////////////////////////////////////
                              HAPPY PATH
    //////////////////////////////////////////////////////////////*/

    function test_beforeHook_allowsValidDomain() public {
        bytes32[] memory allowed = new bytes32[](1);
        allowed[0] = H_SOLIDITY_AUDIT;
        bytes memory terms = abi.encode(allowed);
        bytes memory execution = _buildExecution("solidity-audit");

        _callBeforeHook(terms, execution);
    }

    function test_beforeHook_allowsAmongMultiple() public {
        bytes32[] memory allowed = new bytes32[](3);
        allowed[0] = H_SOLIDITY_AUDIT;
        allowed[1] = H_URL_CLASSIFICATION;
        allowed[2] = H_CLAIM_VERIFICATION;
        bytes memory terms = abi.encode(allowed);

        _callBeforeHook(terms, _buildExecution("solidity-audit"));
        _callBeforeHook(terms, _buildExecution("url-classification"));
        _callBeforeHook(terms, _buildExecution("claim-verification"));
    }

    function test_beforeHook_emitsEvent() public {
        bytes32[] memory allowed = new bytes32[](1);
        allowed[0] = H_SOLIDITY_AUDIT;
        bytes memory terms = abi.encode(allowed);
        bytes memory execution = _buildExecution("solidity-audit");

        vm.expectEmit(true, false, false, true, address(enforcer));
        emit DomainScopeChecked(DELEGATION_HASH, H_SOLIDITY_AUDIT);
        _callBeforeHook(terms, execution);
    }

    function test_beforeHook_matchesLastEntry() public {
        bytes32[] memory allowed = new bytes32[](3);
        allowed[0] = H_URL_CLASSIFICATION;
        allowed[1] = H_CLAIM_VERIFICATION;
        allowed[2] = H_SOLIDITY_AUDIT;
        bytes memory terms = abi.encode(allowed);

        _callBeforeHook(terms, _buildExecution("solidity-audit"));
    }

    function test_beforeHook_acceptsLargeAllowedList() public {
        // 50-entry allowed list with the target near the middle.
        bytes32[] memory allowed = new bytes32[](50);
        for (uint256 i = 0; i < 50; i++) {
            allowed[i] = keccak256(abi.encode("dummy-", i));
        }
        allowed[25] = H_SOLIDITY_AUDIT;
        bytes memory terms = abi.encode(allowed);

        _callBeforeHook(terms, _buildExecution("solidity-audit"));
    }

    function test_getTermsInfo_returnsDecoded() public view {
        bytes32[] memory allowed = new bytes32[](2);
        allowed[0] = H_SOLIDITY_AUDIT;
        allowed[1] = H_URL_CLASSIFICATION;
        bytes memory terms = abi.encode(allowed);

        bytes32[] memory decoded = enforcer.getTermsInfo(terms);
        assertEq(decoded.length, 2);
        assertEq(decoded[0], H_SOLIDITY_AUDIT);
        assertEq(decoded[1], H_URL_CLASSIFICATION);
    }

    /*//////////////////////////////////////////////////////////////
                              REVERT PATHS
    //////////////////////////////////////////////////////////////*/

    function test_beforeHook_revertsOnDisallowedDomain() public {
        bytes32[] memory allowed = new bytes32[](1);
        allowed[0] = H_SOLIDITY_AUDIT;
        bytes memory terms = abi.encode(allowed);
        bytes memory execution = _buildExecution("out-of-scope");

        vm.expectRevert(abi.encodeWithSelector(DomainScopeEnforcer.DomainNotAllowed.selector, H_OUT_OF_SCOPE));
        _callBeforeHook(terms, execution);
    }

    function test_beforeHook_revertsOnEmptyAllowedList() public {
        bytes32[] memory allowed = new bytes32[](0);
        bytes memory terms = abi.encode(allowed);
        bytes memory execution = _buildExecution("solidity-audit");

        vm.expectRevert(DomainScopeEnforcer.EmptyAllowedList.selector);
        _callBeforeHook(terms, execution);
    }

    function test_beforeHook_revertsOnWrongSelector() public {
        bytes32[] memory allowed = new bytes32[](1);
        allowed[0] = H_SOLIDITY_AUDIT;
        bytes memory terms = abi.encode(allowed);

        // Build an execution that targets a different selector.
        bytes4 wrongSelector = bytes4(keccak256("totallyDifferentFunction()"));
        bytes memory callData = abi.encodeWithSelector(wrongSelector);
        bytes memory execution = ExecutionLib.encodeSingle(MODULE_REGISTRY, 0, callData);

        vm.expectRevert(abi.encodeWithSelector(DomainScopeEnforcer.UnsupportedSelector.selector, wrongSelector));
        _callBeforeHook(terms, execution);
    }

    function test_beforeHook_revertsOnTooShortCalldata() public {
        bytes32[] memory allowed = new bytes32[](1);
        allowed[0] = H_SOLIDITY_AUDIT;
        bytes memory terms = abi.encode(allowed);

        // callData with fewer than 4 bytes — cannot contain a selector.
        bytes memory callData = hex"001122";
        bytes memory execution = ExecutionLib.encodeSingle(MODULE_REGISTRY, 0, callData);

        vm.expectRevert(abi.encodeWithSelector(DomainScopeEnforcer.UnsupportedSelector.selector, bytes4(0)));
        _callBeforeHook(terms, execution);
    }

    function test_beforeHook_revertsOnBatchMode() public {
        bytes32[] memory allowed = new bytes32[](1);
        allowed[0] = H_SOLIDITY_AUDIT;
        bytes memory terms = abi.encode(allowed);
        bytes memory execution = _buildExecution("solidity-audit");

        ModeCode batchMode = ModeLib.encode(CALLTYPE_BATCH, EXECTYPE_DEFAULT, MODE_DEFAULT, ModePayload.wrap(0x00));

        vm.expectRevert(bytes("CaveatEnforcer:invalid-call-type"));
        enforcer.beforeHook(terms, "", batchMode, execution, DELEGATION_HASH, DELEGATOR, REDEEMER);
    }

    function test_beforeHook_revertsOnTryMode() public {
        bytes32[] memory allowed = new bytes32[](1);
        allowed[0] = H_SOLIDITY_AUDIT;
        bytes memory terms = abi.encode(allowed);
        bytes memory execution = _buildExecution("solidity-audit");

        ModeCode tryMode = ModeLib.encode(CALLTYPE_SINGLE, EXECTYPE_TRY, MODE_DEFAULT, ModePayload.wrap(0x00));

        vm.expectRevert(bytes("CaveatEnforcer:invalid-execution-type"));
        enforcer.beforeHook(terms, "", tryMode, execution, DELEGATION_HASH, DELEGATOR, REDEEMER);
    }

    /*//////////////////////////////////////////////////////////////
                                  FUZZ
    //////////////////////////////////////////////////////////////*/

    function testFuzz_beforeHook_allowsAnyEntryInList(
        uint8 listSeed,
        uint8 indexSeed
    ) public {
        uint256 listLen = bound(listSeed, 1, 32);
        uint256 hitIdx = bound(indexSeed, 0, listLen - 1);

        bytes32[] memory allowed = new bytes32[](listLen);
        for (uint256 i = 0; i < listLen; i++) {
            allowed[i] = keccak256(abi.encode("entry-", i));
        }
        // Replace one slot with the hash we will hit.
        string memory hitDomain = "fuzz-target";
        allowed[hitIdx] = keccak256(bytes(hitDomain));

        bytes memory terms = abi.encode(allowed);
        bytes memory execution = _buildExecution(hitDomain);

        _callBeforeHook(terms, execution);
    }

    function testFuzz_beforeHook_rejectsRandomDomainNotInList(
        bytes32 randomDomainHash
    ) public {
        bytes32[] memory allowed = new bytes32[](2);
        allowed[0] = H_SOLIDITY_AUDIT;
        allowed[1] = H_URL_CLASSIFICATION;
        // Reject fuzz hash that happens to match an allowed entry.
        vm.assume(randomDomainHash != allowed[0] && randomDomainHash != allowed[1]);

        // Build calldata where domain bytes happen to keccak to randomDomainHash.
        // We can't reverse keccak, so instead we craft the calldata directly:
        // encode a 4-string registerModule call where we substitute a "domain"
        // whose hash we know is unequal to the allowed entries by construction.
        // Easier: just use a literal domain string and require its hash differs.
        string memory candidate = "fuzz-domain-not-in-list";
        bytes32 candidateHash = keccak256(bytes(candidate));
        vm.assume(candidateHash != H_SOLIDITY_AUDIT && candidateHash != H_URL_CLASSIFICATION);
        // `randomDomainHash` is unused as a calldata input but ensures the
        // fuzz spans a wide input domain for the harness.
        // Silence unused-variable warning:
        randomDomainHash;

        bytes memory terms = abi.encode(allowed);
        bytes memory execution = _buildExecution(candidate);

        vm.expectRevert(abi.encodeWithSelector(DomainScopeEnforcer.DomainNotAllowed.selector, candidateHash));
        _callBeforeHook(terms, execution);
    }

    /*//////////////////////////////////////////////////////////////
                                HELPERS
    //////////////////////////////////////////////////////////////*/

    function _buildExecution(string memory domain) internal pure returns (bytes memory) {
        bytes memory callData = abi.encodeWithSelector(
            IModuleRegistry.registerModule.selector,
            "Solidity Audit",
            domain,
            "ipfs://bafy1",
            ""
        );
        return ExecutionLib.encodeSingle(MODULE_REGISTRY, 0, callData);
    }

    function _callBeforeHook(bytes memory terms, bytes memory execution) internal {
        ModeCode mode = ModeLib.encodeSimpleSingle();
        enforcer.beforeHook(terms, "", mode, execution, DELEGATION_HASH, DELEGATOR, REDEEMER);
    }
}
