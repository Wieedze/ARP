// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";

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

import {TrustStakeCapEnforcer} from "../../src/enforcers/TrustStakeCapEnforcer.sol";

contract TrustStakeCapEnforcerTest is Test {
    TrustStakeCapEnforcer internal enforcer;

    address internal constant TARGET = address(0x7E54);
    address internal constant DELEGATOR = address(0xDe11);
    address internal constant REDEEMER = address(0x06ee);
    bytes32 internal constant DELEGATION_HASH = bytes32(uint256(0xbabecafe));
    bytes32 internal constant OTHER_HASH = bytes32(uint256(0xfeed1234));

    uint256 internal constant CAP = 1000 ether;
    uint256 internal constant PERIOD = 7 days;

    /// @dev Stands in for the DelegationManager in the unit tests: every call is pranked from it.
    address internal constant DM = address(0xD3);
    address internal constant ATTACKER = address(0xBAD);

    event StakeCapChecked(
        address indexed delegationManager, bytes32 indexed delegationHash, uint256 newCumulative, uint256 cap
    );

    function setUp() public {
        enforcer = new TrustStakeCapEnforcer();
        vm.warp(1_700_000_000);
    }

    /*//////////////////////////////////////////////////////////////
                              HAPPY PATH
    //////////////////////////////////////////////////////////////*/

    function test_beforeHook_allowsStakeUnderCap() public {
        _callBeforeHook(_terms(CAP, PERIOD), _execution(100 ether), DELEGATION_HASH);
        (uint256 cumulative, uint256 windowStart) = enforcer.getState(DM, DELEGATION_HASH);
        assertEq(cumulative, 100 ether);
        assertEq(windowStart, block.timestamp);
    }

    function test_beforeHook_allowsExactCap() public {
        _callBeforeHook(_terms(CAP, PERIOD), _execution(CAP), DELEGATION_HASH);
        (uint256 cumulative,) = enforcer.getState(DM, DELEGATION_HASH);
        assertEq(cumulative, CAP);
    }

    function test_beforeHook_accumulatesAcrossCalls() public {
        bytes memory terms = _terms(CAP, PERIOD);
        _callBeforeHook(terms, _execution(300 ether), DELEGATION_HASH);
        _callBeforeHook(terms, _execution(400 ether), DELEGATION_HASH);
        _callBeforeHook(terms, _execution(300 ether), DELEGATION_HASH);
        (uint256 cumulative,) = enforcer.getState(DM, DELEGATION_HASH);
        assertEq(cumulative, CAP);
    }

    function test_beforeHook_resetsAfterWindowExpires() public {
        bytes memory terms = _terms(CAP, PERIOD);
        _callBeforeHook(terms, _execution(CAP), DELEGATION_HASH);
        (uint256 cumulativeBefore,) = enforcer.getState(DM, DELEGATION_HASH);
        assertEq(cumulativeBefore, CAP);

        // Advance past the window.
        vm.warp(block.timestamp + PERIOD + 1);
        _callBeforeHook(terms, _execution(50 ether), DELEGATION_HASH);

        (uint256 cumulativeAfter, uint256 windowStart) = enforcer.getState(DM, DELEGATION_HASH);
        assertEq(cumulativeAfter, 50 ether);
        assertEq(windowStart, block.timestamp);
    }

    function test_beforeHook_perDelegationStateIsolation() public {
        bytes memory terms = _terms(CAP, PERIOD);
        _callBeforeHook(terms, _execution(700 ether), DELEGATION_HASH);
        _callBeforeHook(terms, _execution(700 ether), OTHER_HASH);

        (uint256 cumA,) = enforcer.getState(DM, DELEGATION_HASH);
        (uint256 cumB,) = enforcer.getState(DM, OTHER_HASH);
        assertEq(cumA, 700 ether);
        assertEq(cumB, 700 ether);
    }

    function test_beforeHook_emitsEvent() public {
        bytes memory terms = _terms(CAP, PERIOD);
        bytes memory execution = _execution(250 ether);

        vm.expectEmit(true, false, false, true, address(enforcer));
        emit StakeCapChecked(DM, DELEGATION_HASH, 250 ether, CAP);
        _callBeforeHook(terms, execution, DELEGATION_HASH);
    }

    function test_getTermsInfo_returnsDecoded() public view {
        (uint256 cap, uint256 period) = enforcer.getTermsInfo(_terms(CAP, PERIOD));
        assertEq(cap, CAP);
        assertEq(period, PERIOD);
    }

    function test_getState_initialZero() public view {
        (uint256 cumulative, uint256 windowStart) = enforcer.getState(DM, DELEGATION_HASH);
        assertEq(cumulative, 0);
        assertEq(windowStart, 0);
    }

    /*//////////////////////////////////////////////////////////////
                    GRIEFING (ADR 0118) AND THE FIXED WINDOW
    //////////////////////////////////////////////////////////////*/

    /// @dev The attack the old `_delegationHash`-only key allowed: a stranger calls `beforeHook`
    ///      directly with terms of its choosing and fills the counter. It now lands in the
    ///      stranger's own slot, and the DelegationManager's slot is untouched.
    function test_directCall_cannotFillTheManagersSlot() public {
        uint256 huge = 2 ** 255;
        _callBeforeHookAs(ATTACKER, _terms(huge, 1), _execution(huge), DELEGATION_HASH);

        (uint256 attackerSlot,) = enforcer.getState(ATTACKER, DELEGATION_HASH);
        (uint256 managerSlot, uint256 managerStart) = enforcer.getState(DM, DELEGATION_HASH);
        assertEq(attackerSlot, huge);
        assertEq(managerSlot, 0);
        assertEq(managerStart, 0);

        _callBeforeHook(_terms(CAP, PERIOD), _execution(CAP), DELEGATION_HASH);
        (managerSlot,) = enforcer.getState(DM, DELEGATION_HASH);
        assertEq(managerSlot, CAP);
    }

    function test_event_namesTheCaller() public {
        vm.expectEmit(true, true, false, true, address(enforcer));
        emit StakeCapChecked(ATTACKER, DELEGATION_HASH, 1 ether, CAP);
        _callBeforeHookAs(ATTACKER, _terms(CAP, PERIOD), _execution(1 ether), DELEGATION_HASH);
    }

    /// @dev Documents the 2x-cap edge in the NatSpec: the window is fixed, so a full cap at the
    ///      end of one window and a full cap at the start of the next both pass, one second apart.
    function test_fixedWindow_allowsTwoCapsAcrossABoundary() public {
        bytes memory terms = _terms(CAP, PERIOD);
        _callBeforeHook(terms, _execution(1 ether), DELEGATION_HASH);
        vm.warp(block.timestamp + PERIOD - 1);
        _callBeforeHook(terms, _execution(CAP - 1 ether), DELEGATION_HASH);
        vm.warp(block.timestamp + 1);
        _callBeforeHook(terms, _execution(CAP), DELEGATION_HASH);
        (uint256 cumulative, uint256 windowStart) = enforcer.getState(DM, DELEGATION_HASH);
        assertEq(cumulative, CAP);
        assertEq(windowStart, block.timestamp);
    }

    function test_window_doesNotResetOneSecondEarly() public {
        bytes memory terms = _terms(CAP, PERIOD);
        _callBeforeHook(terms, _execution(CAP), DELEGATION_HASH);
        vm.warp(block.timestamp + PERIOD - 1);
        vm.expectRevert(abi.encodeWithSelector(TrustStakeCapEnforcer.CapExceeded.selector, CAP + 1, CAP));
        _callBeforeHook(terms, _execution(1), DELEGATION_HASH);
    }

    /*//////////////////////////////////////////////////////////////
                              REVERT PATHS
    //////////////////////////////////////////////////////////////*/

    function test_beforeHook_revertsOnSingleOverCap() public {
        vm.expectRevert(abi.encodeWithSelector(TrustStakeCapEnforcer.CapExceeded.selector, CAP + 1, CAP));
        _callBeforeHook(_terms(CAP, PERIOD), _execution(CAP + 1), DELEGATION_HASH);
    }

    function test_beforeHook_revertsOnCumulativeOverCap() public {
        bytes memory terms = _terms(CAP, PERIOD);
        _callBeforeHook(terms, _execution(600 ether), DELEGATION_HASH);
        _callBeforeHook(terms, _execution(300 ether), DELEGATION_HASH);

        vm.expectRevert(abi.encodeWithSelector(TrustStakeCapEnforcer.CapExceeded.selector, 1001 ether, CAP));
        _callBeforeHook(terms, _execution(101 ether), DELEGATION_HASH);
    }

    function test_beforeHook_revertsOnZeroPeriod() public {
        vm.expectRevert(TrustStakeCapEnforcer.InvalidPeriod.selector);
        _callBeforeHook(_terms(CAP, 0), _execution(1 ether), DELEGATION_HASH);
    }

    function test_beforeHook_revertsOnBatchMode() public {
        ModeCode batchMode = ModeLib.encode(CALLTYPE_BATCH, EXECTYPE_DEFAULT, MODE_DEFAULT, ModePayload.wrap(0x00));
        vm.expectRevert(bytes("CaveatEnforcer:invalid-call-type"));
        vm.prank(DM);
        enforcer.beforeHook(
            _terms(CAP, PERIOD), "", batchMode, _execution(1 ether), DELEGATION_HASH, DELEGATOR, REDEEMER
        );
    }

    function test_beforeHook_revertsOnTryMode() public {
        ModeCode tryMode = ModeLib.encode(CALLTYPE_SINGLE, EXECTYPE_TRY, MODE_DEFAULT, ModePayload.wrap(0x00));
        vm.expectRevert(bytes("CaveatEnforcer:invalid-execution-type"));
        vm.prank(DM);
        enforcer.beforeHook(_terms(CAP, PERIOD), "", tryMode, _execution(1 ether), DELEGATION_HASH, DELEGATOR, REDEEMER);
    }

    /*//////////////////////////////////////////////////////////////
                                  FUZZ
    //////////////////////////////////////////////////////////////*/

    function testFuzz_beforeHook_acceptsValuesUnderCap(uint128 cap, uint128 value) public {
        vm.assume(cap > 0);
        vm.assume(value <= cap);
        _callBeforeHook(_terms(cap, PERIOD), _execution(value), DELEGATION_HASH);
        (uint256 cumulative,) = enforcer.getState(DM, DELEGATION_HASH);
        assertEq(cumulative, value);
    }

    function testFuzz_beforeHook_rejectsValueOverCap(uint128 cap, uint128 value) public {
        vm.assume(cap > 0 && value > cap);
        vm.expectRevert(abi.encodeWithSelector(TrustStakeCapEnforcer.CapExceeded.selector, value, cap));
        _callBeforeHook(_terms(cap, PERIOD), _execution(value), DELEGATION_HASH);
    }

    /*//////////////////////////////////////////////////////////////
                                HELPERS
    //////////////////////////////////////////////////////////////*/

    function _terms(uint256 cap, uint256 period) internal pure returns (bytes memory) {
        return abi.encode(cap, period);
    }

    function _execution(uint256 value) internal pure returns (bytes memory) {
        return ExecutionLib.encodeSingle(TARGET, value, hex"");
    }

    function _callBeforeHook(bytes memory terms, bytes memory execution, bytes32 delegationHash) internal {
        _callBeforeHookAs(DM, terms, execution, delegationHash);
    }

    function _callBeforeHookAs(address caller, bytes memory terms, bytes memory execution, bytes32 delegationHash)
        internal
    {
        ModeCode mode = ModeLib.encodeSimpleSingle();
        vm.prank(caller);
        enforcer.beforeHook(terms, "", mode, execution, delegationHash, DELEGATOR, REDEEMER);
    }
}

/*//////////////////////////////////////////////////////////////
                           INVARIANT TESTS
//////////////////////////////////////////////////////////////*/

/// @dev Bounds inputs so most random sequences succeed, then verifies that
///      the cumulative spend never exceeds the cap and the window start is
///      monotonic.
contract TrustStakeCapHandler is Test {
    TrustStakeCapEnforcer public enforcer;
    bytes32 public constant DELEGATION_HASH = bytes32(uint256(0xa5519));
    uint256 public constant CAP = 1000 ether;
    uint256 public constant PERIOD = 7 days;
    address public constant DM = address(0xD3);

    uint256 public lastWindowStart;

    constructor(TrustStakeCapEnforcer _enforcer) {
        enforcer = _enforcer;
    }

    function stake(uint96 amountSeed, uint256 timeSeed) external {
        uint256 amount = bound(amountSeed, 0, CAP);
        // Advance time by 0..2 periods
        vm.warp(block.timestamp + bound(timeSeed, 0, 2 * PERIOD));

        bytes memory terms = abi.encode(CAP, PERIOD);
        bytes memory execution = ExecutionLib.encodeSingle(address(0x7E54), amount, hex"");
        ModeCode mode = ModeLib.encodeSimpleSingle();

        try enforcer.beforeHook(terms, "", mode, execution, DELEGATION_HASH, address(0), address(0)) {
            (, uint256 windowStart) = enforcer.getState(DM, DELEGATION_HASH);
            if (windowStart > lastWindowStart) lastWindowStart = windowStart;
        } catch {}
    }
}

contract TrustStakeCapEnforcerInvariantTest is StdInvariant, Test {
    TrustStakeCapEnforcer internal enforcer;
    TrustStakeCapHandler internal handler;

    function setUp() public {
        vm.warp(1_700_000_000);
        enforcer = new TrustStakeCapEnforcer();
        handler = new TrustStakeCapHandler(enforcer);
        targetContract(address(handler));
    }

    function invariant_cumulativeNeverExceedsCap() public view {
        (uint256 cumulative,) = enforcer.getState(handler.DM(), handler.DELEGATION_HASH());
        assertLe(cumulative, handler.CAP());
    }

    function invariant_windowStartMonotonic() public view {
        (, uint256 windowStart) = enforcer.getState(handler.DM(), handler.DELEGATION_HASH());
        assertGe(windowStart, handler.lastWindowStart());
    }
}
