// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Test} from "forge-std/Test.sol";

import {ExecutionLib} from "@erc7579/lib/ExecutionLib.sol";
import {ModeLib} from "@erc7579/lib/ModeLib.sol";

import {DelegationManager} from "delegation-framework/DelegationManager.sol";
import {Caveat, Delegation, ModeCode} from "delegation-framework/utils/Types.sol";
import {EncoderLib} from "delegation-framework/libraries/EncoderLib.sol";

import {TrustStakeCapEnforcer} from "../../src/enforcers/TrustStakeCapEnforcer.sol";

/// @dev The smallest delegator the real DelegationManager accepts: it approves every ERC-1271
///      check and forwards a single-call execution. Enough to drive a redemption end to end
///      without a DeleGator implementation and its signer libraries.
contract MockDelegator {
    address public immutable MANAGER;

    error OnlyManager();

    constructor(address manager) {
        MANAGER = manager;
    }

    receive() external payable {}

    function isValidSignature(bytes32, bytes calldata) external pure returns (bytes4) {
        return 0x1626ba7e;
    }

    function executeFromExecutor(ModeCode, bytes calldata executionCallData)
        external
        payable
        returns (bytes[] memory results)
    {
        if (msg.sender != MANAGER) revert OnlyManager();
        (address target, uint256 value, bytes calldata callData) = ExecutionLib.decodeSingle(executionCallData);
        (bool ok, bytes memory ret) = target.call{value: value}(callData);
        require(ok, "MockDelegator:call-failed");
        results = new bytes[](1);
        results[0] = ret;
    }
}

/// @notice The griefing attack ADR 0118 closes, driven through the real `DelegationManager`.
contract TrustStakeCapEnforcerRedemptionTest is Test {
    DelegationManager internal manager;
    TrustStakeCapEnforcer internal enforcer;
    MockDelegator internal delegator;

    address internal constant AGENT = address(0xA6E7);
    address internal constant ATTACKER = address(0xBAD);
    address internal constant TARGET = address(0x7E54);

    uint256 internal constant CAP = 1 ether;
    uint256 internal constant PERIOD = 1 days;

    function setUp() public {
        vm.warp(1_700_000_000);
        manager = new DelegationManager(address(this));
        enforcer = new TrustStakeCapEnforcer();
        delegator = new MockDelegator(address(manager));
        vm.deal(address(delegator), 10 ether);
    }

    function test_redemption_succeedsAfterAttackerFillsTheHashDirectly() public {
        Delegation memory delegation = _delegation();
        bytes32 delegationHash = EncoderLib._getDelegationHash(delegation);

        // The attack: the hash is public, `_terms` is the caller's to choose.
        uint256 huge = 2 ** 255;
        vm.prank(ATTACKER);
        enforcer.beforeHook(
            abi.encode(huge, uint256(1)),
            "",
            ModeLib.encodeSimpleSingle(),
            ExecutionLib.encodeSingle(TARGET, huge, hex""),
            delegationHash,
            address(delegator),
            ATTACKER
        );

        _redeem(delegation, CAP);

        assertEq(TARGET.balance, CAP);
        (uint256 cumulative,) = enforcer.getState(address(manager), delegationHash);
        assertEq(cumulative, CAP);
    }

    function test_redemption_stillCapped() public {
        Delegation memory delegation = _delegation();
        _redeem(delegation, CAP);

        bytes[] memory contexts = new bytes[](1);
        contexts[0] = _context(delegation);
        ModeCode[] memory modes = new ModeCode[](1);
        modes[0] = ModeLib.encodeSimpleSingle();
        bytes[] memory executions = new bytes[](1);
        executions[0] = ExecutionLib.encodeSingle(TARGET, 1, hex"");

        vm.expectRevert(abi.encodeWithSelector(TrustStakeCapEnforcer.CapExceeded.selector, CAP + 1, CAP));
        vm.prank(AGENT);
        manager.redeemDelegations(contexts, modes, executions);
    }

    function _delegation() internal view returns (Delegation memory delegation) {
        Caveat[] memory caveats = new Caveat[](1);
        caveats[0] = Caveat({enforcer: address(enforcer), terms: abi.encode(CAP, PERIOD), args: ""});
        delegation = Delegation({
            delegate: AGENT,
            delegator: address(delegator),
            authority: manager.ROOT_AUTHORITY(),
            caveats: caveats,
            salt: 0,
            signature: ""
        });
    }

    function _context(Delegation memory delegation) internal pure returns (bytes memory) {
        Delegation[] memory chain = new Delegation[](1);
        chain[0] = delegation;
        return abi.encode(chain);
    }

    function _redeem(Delegation memory delegation, uint256 value) internal {
        bytes[] memory contexts = new bytes[](1);
        contexts[0] = _context(delegation);
        ModeCode[] memory modes = new ModeCode[](1);
        modes[0] = ModeLib.encodeSimpleSingle();
        bytes[] memory executions = new bytes[](1);
        executions[0] = ExecutionLib.encodeSingle(TARGET, value, hex"");
        vm.prank(AGENT);
        manager.redeemDelegations(contexts, modes, executions);
    }
}
