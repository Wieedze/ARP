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

import {ReceiptEnforcer} from "../../src/enforcers/ReceiptEnforcer.sol";

contract ReceiptEnforcerTest is Test {
    ReceiptEnforcer internal enforcer;

    uint256 internal constant CHAIN = 13_579;
    uint256 internal constant MAX_AGE = 1 days;
    uint256 internal constant ISSUED_AT = 1_700_000_000;
    string internal constant REGISTRY = "eip155:13579:0x8004a169fb4a3325136eb29fa0ceb6d2e539a432";
    uint256 internal constant AGENT_ID = 42;
    address internal constant REDEEMER = address(0x06ee);
    address internal constant DELEGATOR = address(0xDe11);
    address internal constant MULTIVAULT = address(0x7E54);
    bytes32 internal constant TERM = bytes32(uint256(0x7e57));
    bytes32 internal constant PAYMENT = bytes32(0x1111111111111111111111111111111111111111111111111111111111111111);
    bytes32 internal constant DELEGATION_HASH = bytes32(uint256(0xbabecafe));
    /// The `verifyingContract` the viem vector was signed for (`hire-receipt.test.ts`).
    address internal constant VIEM_VERIFIER = 0x00000000000000000000000000000000005Ec044;

    // secp256k1 order, for the high-s malleability case.
    uint256 internal constant SECP256K1_N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141;

    uint256 internal signerKey;
    address internal signer;

    /// The v1 struct `hire-receipt.ts` still signs for nobody that sponsors.
    struct V1Receipt {
        uint256 version;
        string agentRegistry;
        uint256 agentId;
        address requester;
        bytes32 payment;
        uint256 paid;
        bytes32 requestHash;
        bytes32 resultHash;
        uint256 issuedAt;
    }

    event ReceiptConsumed(
        bytes32 indexed delegationHash,
        bytes32 indexed paymentKey,
        address indexed signer,
        address requester,
        bytes32 termId
    );

    function setUp() public {
        // This test contract plays the DelegationManager.
        enforcer = new ReceiptEnforcer(address(this));
        (signer, signerKey) = makeAddrAndKey("node");
        vm.warp(ISSUED_AT + 1 hours);
    }

    /*//////////////////////////////////////////////////////////////
                    THE RECEIPT AS hire-receipt.ts SIGNS IT
    //////////////////////////////////////////////////////////////*/

    /// Produced by `signHireReceipt` in `packages/protocol/src/hire-receipt.ts` with viem, using
    /// anvil's publicly documented account #0 (a test key), for a v2 receipt naming
    /// `VIEM_VERIFIER` as `verifyingContract`. The enforcer is deployed at that address so the
    /// domain matches. `packages/protocol/test/hire-receipt.test.ts` holds the same digest and
    /// signature, so drift in the struct, its order or the domain fails on both sides.
    function test_viemVector_digestAndSignatureVerify() public {
        address viemSigner = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266;
        bytes memory viemSignature =
            hex"9a7c21cedbb7b308fb4df76670bc25437d20da12993aa29345689b8779f3d9772c8f99fdc3233217a8337015e79211c37548c1d3a4faca819ea1755ae138cc021c";
        deployCodeTo("ReceiptEnforcer.sol:ReceiptEnforcer", abi.encode(address(this)), VIEM_VERIFIER);
        ReceiptEnforcer atVector = ReceiptEnforcer(VIEM_VERIFIER);
        ReceiptEnforcer.HireReceipt memory r = _receipt();
        assertEq(r.paid, 1_000_000_000_000_000);
        assertEq(r.expiresAt, 1_700_086_400);

        assertEq(atVector.hashReceipt(r, CHAIN), 0xa97f63e546c51ff2f0511bf52aa6c0ccebef42c44b27205cf82f8d569ece4bb7);

        ReceiptEnforcer.Binding[] memory bindings = new ReceiptEnforcer.Binding[](1);
        bindings[0] = ReceiptEnforcer.Binding(viemSigner, keccak256(bytes(REGISTRY)), AGENT_ID, TERM);
        atVector.beforeHook(
            abi.encode(CHAIN, MAX_AGE, bindings),
            abi.encode(r, viemSignature),
            _singleDefault(),
            _deposit(REDEEMER, TERM),
            DELEGATION_HASH,
            DELEGATOR,
            REDEEMER
        );
        assertTrue(atVector.isPaymentUsed(CHAIN, PAYMENT));
    }

    /*//////////////////////////////////////////////////////////////
                    ONE RECEIPT, ONE VERIFIER (v2, task 44)
    //////////////////////////////////////////////////////////////*/

    /// A receipt signed for another verifier (a second deployment, or the sponsoring service's
    /// address) recovers to a different key here, so it unlocks nothing.
    function test_beforeHook_revertsOnReceiptForAnotherVerifier() public {
        ReceiptEnforcer other = new ReceiptEnforcer(address(this));
        ReceiptEnforcer.HireReceipt memory r = _receipt();
        (uint8 v, bytes32 rr, bytes32 s) = vm.sign(signerKey, other.hashReceipt(r, CHAIN));
        address recovered = ecrecover(enforcer.hashReceipt(r, CHAIN), v, rr, s);
        assertTrue(recovered != signer);
        _hookReverts(
            abi.encodeWithSelector(ReceiptEnforcer.SignerNotAccepted.selector, recovered),
            _terms(),
            abi.encode(r, abi.encodePacked(rr, s, v)),
            _deposit(REDEEMER, TERM)
        );
    }

    function test_hashReceipt_differsPerDeployment() public {
        ReceiptEnforcer other = new ReceiptEnforcer(address(this));
        assertTrue(other.hashReceipt(_receipt(), CHAIN) != enforcer.hashReceipt(_receipt(), CHAIN));
    }

    /// v1 names no verifier, so it is refused before any recovery.
    function test_beforeHook_revertsOnV1Receipt() public {
        ReceiptEnforcer.HireReceipt memory r = _receipt();
        r.version = 1;
        _hookReverts(
            abi.encodeWithSelector(ReceiptEnforcer.UnknownReceiptVersion.selector, 1),
            _terms(),
            _args(r),
            _deposit(REDEEMER, TERM)
        );
    }

    /// A v1 receipt as a v1 signer encodes it, nine fields and no `termId`/`expiresAt`, reaches the
    /// same refusal: the version word decodes first, so the shape difference never matters.
    function test_beforeHook_revertsOnV1ReceiptInItsOwnShape() public {
        V1Receipt memory v1 = V1Receipt({
            version: 1,
            agentRegistry: REGISTRY,
            agentId: AGENT_ID,
            requester: REDEEMER,
            payment: PAYMENT,
            paid: 0.001 ether,
            requestHash: bytes32(0),
            resultHash: bytes32(0),
            issuedAt: ISSUED_AT
        });
        _hookReverts(
            abi.encodeWithSelector(ReceiptEnforcer.UnknownReceiptVersion.selector, 1),
            _terms(),
            abi.encode(v1, new bytes(65)),
            _deposit(REDEEMER, TERM)
        );
    }

    function test_beforeHook_revertsWhenReceiptTermDiffersFromDeposit() public {
        ReceiptEnforcer.HireReceipt memory r = _receipt();
        bytes32 other = bytes32(uint256(0x0dd));
        r.termId = other;
        _hookReverts(
            abi.encodeWithSelector(ReceiptEnforcer.ReceiptTermMismatch.selector, other, TERM),
            _terms(),
            _args(r),
            _deposit(REDEEMER, TERM)
        );
    }

    function test_beforeHook_acceptsAtExactlyExpiresAt() public {
        ReceiptEnforcer.HireReceipt memory r = _receipt();
        r.expiresAt = ISSUED_AT + 1 hours;
        _hook(_terms(), _args(r), _deposit(REDEEMER, TERM));
    }

    /// The node's own expiry holds even inside the delegator's `maxAge`.
    function test_beforeHook_revertsPastOwnExpiry() public {
        ReceiptEnforcer.HireReceipt memory r = _receipt();
        r.expiresAt = ISSUED_AT + 1 hours - 1;
        _hookReverts(
            abi.encodeWithSelector(ReceiptEnforcer.ReceiptPastExpiry.selector, r.expiresAt),
            _terms(),
            _args(r),
            _deposit(REDEEMER, TERM)
        );
        assertFalse(enforcer.isPaymentUsed(CHAIN, PAYMENT));
    }

    function testFuzz_beforeHook_rejectsTamperedV2Fields(bytes32 termId, uint256 expiresAt) public {
        ReceiptEnforcer.HireReceipt memory r = _receipt();
        vm.assume(termId != r.termId || expiresAt != r.expiresAt);
        bytes memory signature = _sign(r, CHAIN);
        r.termId = termId;
        r.expiresAt = expiresAt;
        bytes memory terms = _terms();
        bytes memory execution = _deposit(REDEEMER, TERM);
        vm.expectPartialRevert(ReceiptEnforcer.SignerNotAccepted.selector);
        _hook(terms, abi.encode(r, signature), execution);
    }

    /*//////////////////////////////////////////////////////////////
                               HAPPY PATH
    //////////////////////////////////////////////////////////////*/

    function test_beforeHook_acceptsAndConsumes() public {
        assertFalse(enforcer.isPaymentUsed(CHAIN, PAYMENT));
        vm.expectEmit(address(enforcer));
        emit ReceiptConsumed(DELEGATION_HASH, keccak256(abi.encode(CHAIN, PAYMENT)), signer, REDEEMER, TERM);
        _hook(_terms(), _args(_receipt()), _deposit(REDEEMER, TERM));
        assertTrue(enforcer.isPaymentUsed(CHAIN, PAYMENT));
        assertFalse(enforcer.isPaymentUsed(1, PAYMENT));
    }

    function test_beforeHook_findsBindingAfterOthers() public {
        ReceiptEnforcer.Binding[] memory bindings = new ReceiptEnforcer.Binding[](3);
        bindings[0] = ReceiptEnforcer.Binding(address(0xBEEF), keccak256(bytes(REGISTRY)), AGENT_ID, TERM);
        bindings[1] = ReceiptEnforcer.Binding(signer, keccak256(bytes(REGISTRY)), AGENT_ID, bytes32(uint256(1)));
        bindings[2] = ReceiptEnforcer.Binding(signer, keccak256(bytes(REGISTRY)), AGENT_ID, TERM);
        _hook(abi.encode(CHAIN, MAX_AGE, bindings), _args(_receipt()), _deposit(REDEEMER, TERM));
    }

    function test_beforeHook_acceptsAtExactlyMaxAge() public {
        vm.warp(ISSUED_AT + MAX_AGE);
        _hook(_terms(), _args(_receipt()), _deposit(REDEEMER, TERM));
    }

    function test_beforeHook_acceptsIssuedThisBlock() public {
        vm.warp(ISSUED_AT);
        _hook(_terms(), _args(_receipt()), _deposit(REDEEMER, TERM));
    }

    /*//////////////////////////////////////////////////////////////
                               REPLAY
    //////////////////////////////////////////////////////////////*/

    function test_beforeHook_revertsOnSameReceiptTwice() public {
        bytes memory args = _args(_receipt());
        _hook(_terms(), args, _deposit(REDEEMER, TERM));
        _hookReverts(
            abi.encodeWithSelector(ReceiptEnforcer.PaymentAlreadyUsed.selector, keccak256(abi.encode(CHAIN, PAYMENT))),
            _terms(),
            args,
            _deposit(REDEEMER, TERM)
        );
    }

    /// A node that signs a second receipt for one payment does not unlock a second deposit.
    function test_beforeHook_revertsOnSecondReceiptForOnePayment() public {
        _hook(_terms(), _args(_receipt()), _deposit(REDEEMER, TERM));
        ReceiptEnforcer.HireReceipt memory again = _receipt();
        again.issuedAt = ISSUED_AT + 1;
        again.resultHash = bytes32(uint256(0xdead));
        _hookReverts(
            abi.encodeWithSelector(ReceiptEnforcer.PaymentAlreadyUsed.selector, keccak256(abi.encode(CHAIN, PAYMENT))),
            _terms(),
            _args(again),
            _deposit(REDEEMER, TERM)
        );
    }

    /// A receipt signed for another chain's domain recovers to a different address.
    function test_beforeHook_revertsOnOtherChainDomain() public {
        ReceiptEnforcer.HireReceipt memory r = _receipt();
        (uint8 v, bytes32 rr, bytes32 s) = vm.sign(signerKey, enforcer.hashReceipt(r, 1));
        address recovered = ecrecover(enforcer.hashReceipt(r, CHAIN), v, rr, s);
        _hookReverts(
            abi.encodeWithSelector(ReceiptEnforcer.SignerNotAccepted.selector, recovered),
            _terms(),
            abi.encode(r, abi.encodePacked(rr, s, v)),
            _deposit(REDEEMER, TERM)
        );
    }

    /*//////////////////////////////////////////////////////////////
                          SIGNER AND BINDING
    //////////////////////////////////////////////////////////////*/

    function test_beforeHook_revertsOnUnknownSigner() public {
        (address stranger, uint256 strangerKey) = makeAddrAndKey("stranger");
        ReceiptEnforcer.HireReceipt memory r = _receipt();
        (uint8 v, bytes32 rr, bytes32 s) = vm.sign(strangerKey, enforcer.hashReceipt(r, CHAIN));
        _hookReverts(
            abi.encodeWithSelector(ReceiptEnforcer.SignerNotAccepted.selector, stranger),
            _terms(),
            abi.encode(r, abi.encodePacked(rr, s, v)),
            _deposit(REDEEMER, TERM)
        );
    }

    function test_beforeHook_revertsWhenDepositTargetsAnotherTerm() public {
        bytes32 other = bytes32(uint256(0x0dd));
        _hookReverts(
            abi.encodeWithSelector(
                ReceiptEnforcer.BindingMismatch.selector, signer, keccak256(bytes(REGISTRY)), AGENT_ID, other
            ),
            _terms(),
            _args(_receipt()),
            _deposit(REDEEMER, other)
        );
    }

    function test_beforeHook_revertsWhenReceiptNamesAnotherAgent() public {
        ReceiptEnforcer.HireReceipt memory r = _receipt();
        r.agentId = AGENT_ID + 1;
        _hookReverts(
            abi.encodeWithSelector(
                ReceiptEnforcer.BindingMismatch.selector, signer, keccak256(bytes(REGISTRY)), AGENT_ID + 1, TERM
            ),
            _terms(),
            _args(r),
            _deposit(REDEEMER, TERM)
        );
    }

    function test_beforeHook_revertsWhenReceiptNamesAnotherRegistry() public {
        ReceiptEnforcer.HireReceipt memory r = _receipt();
        r.agentRegistry = "eip155:8453:0x8004a169fb4a3325136eb29fa0ceb6d2e539a432";
        _hookReverts(
            abi.encodeWithSelector(
                ReceiptEnforcer.BindingMismatch.selector, signer, keccak256(bytes(r.agentRegistry)), AGENT_ID, TERM
            ),
            _terms(),
            _args(r),
            _deposit(REDEEMER, TERM)
        );
    }

    function test_beforeHook_revertsWhenRequesterIsNotRedeemer() public {
        ReceiptEnforcer.HireReceipt memory r = _receipt();
        r.requester = address(0xA11CE);
        _hookReverts(
            abi.encodeWithSelector(ReceiptEnforcer.RequesterNotRedeemer.selector, address(0xA11CE), REDEEMER),
            _terms(),
            _args(r),
            _deposit(REDEEMER, TERM)
        );
    }

    function test_beforeHook_revertsOnMalformedSignature() public {
        _hookReverts(
            abi.encodeWithSelector(ReceiptEnforcer.InvalidSignature.selector),
            _terms(),
            abi.encode(_receipt(), hex"1234"),
            _deposit(REDEEMER, TERM)
        );
    }

    function test_beforeHook_revertsOnHighSSignature() public {
        ReceiptEnforcer.HireReceipt memory r = _receipt();
        (uint8 v, bytes32 rr, bytes32 s) = vm.sign(signerKey, enforcer.hashReceipt(r, CHAIN));
        bytes32 highS = bytes32(SECP256K1_N - uint256(s));
        uint8 flipped = v == 27 ? 28 : 27;
        _hookReverts(
            abi.encodeWithSelector(ReceiptEnforcer.InvalidSignature.selector),
            _terms(),
            abi.encode(r, abi.encodePacked(rr, highS, flipped)),
            _deposit(REDEEMER, TERM)
        );
    }

    function test_beforeHook_revertsOnUnknownVersion() public {
        ReceiptEnforcer.HireReceipt memory r = _receipt();
        r.version = 3;
        _hookReverts(
            abi.encodeWithSelector(ReceiptEnforcer.UnknownReceiptVersion.selector, 3),
            _terms(),
            _args(r),
            _deposit(REDEEMER, TERM)
        );
    }

    /// Any change to any signed field breaks the binding to the accepted signer.
    function testFuzz_beforeHook_rejectsTamperedPaid(uint256 paid) public {
        vm.assume(paid != _receipt().paid);
        ReceiptEnforcer.HireReceipt memory r = _receipt();
        bytes memory signature = _sign(r, CHAIN);
        r.paid = paid;
        bytes memory terms = _terms();
        bytes memory execution = _deposit(REDEEMER, TERM);
        vm.expectPartialRevert(ReceiptEnforcer.SignerNotAccepted.selector);
        _hook(terms, abi.encode(r, signature), execution);
    }

    /*//////////////////////////////////////////////////////////////
                               FRESHNESS
    //////////////////////////////////////////////////////////////*/

    function test_beforeHook_revertsWhenExpired() public {
        vm.warp(ISSUED_AT + MAX_AGE + 1);
        _hookReverts(
            abi.encodeWithSelector(ReceiptEnforcer.ReceiptExpired.selector, ISSUED_AT, MAX_AGE),
            _terms(),
            _args(_receipt()),
            _deposit(REDEEMER, TERM)
        );
    }

    function test_beforeHook_revertsWhenFromFuture() public {
        vm.warp(ISSUED_AT - 1);
        _hookReverts(
            abi.encodeWithSelector(ReceiptEnforcer.ReceiptFromFuture.selector, ISSUED_AT),
            _terms(),
            _args(_receipt()),
            _deposit(REDEEMER, TERM)
        );
    }

    /*//////////////////////////////////////////////////////////////
                               EXECUTION
    //////////////////////////////////////////////////////////////*/

    function test_beforeHook_revertsWhenReceiverIsNotRedeemer() public {
        _hookReverts(
            abi.encodeWithSelector(ReceiptEnforcer.ReceiverNotRedeemer.selector, DELEGATOR, REDEEMER),
            _terms(),
            _args(_receipt()),
            _deposit(DELEGATOR, TERM)
        );
    }

    function test_beforeHook_revertsOnOtherSelector() public {
        bytes memory call = abi.encodeWithSignature("redeem(address,bytes32,uint256,uint256)", REDEEMER, TERM, 1, 0);
        _hookReverts(
            abi.encodeWithSelector(ReceiptEnforcer.NotADeposit.selector),
            _terms(),
            _args(_receipt()),
            ExecutionLib.encodeSingle(MULTIVAULT, 1 ether, call)
        );
    }

    function test_beforeHook_revertsOnWrongCalldataLength() public {
        bytes memory call = abi.encodePacked(
            abi.encodeWithSignature("deposit(address,bytes32,uint256,uint256)", REDEEMER, TERM, 1, 0), uint256(0)
        );
        _hookReverts(
            abi.encodeWithSelector(ReceiptEnforcer.NotADeposit.selector),
            _terms(),
            _args(_receipt()),
            ExecutionLib.encodeSingle(MULTIVAULT, 1 ether, call)
        );
    }

    /// The deposit may spend exactly what the receipt says was paid.
    function test_beforeHook_acceptsValueEqualToPaid() public {
        ReceiptEnforcer.HireReceipt memory r = _receipt();
        _hook(_terms(), _args(r), _depositWithValue(REDEEMER, TERM, r.paid));
        assertTrue(enforcer.isPaymentUsed(CHAIN, PAYMENT));
    }

    function test_beforeHook_acceptsValueBelowPaid() public {
        ReceiptEnforcer.HireReceipt memory r = _receipt();
        _hook(_terms(), _args(r), _depositWithValue(REDEEMER, TERM, r.paid - 1));
    }

    function test_beforeHook_revertsWhenValueExceedsPaid() public {
        ReceiptEnforcer.HireReceipt memory r = _receipt();
        _hookReverts(
            abi.encodeWithSelector(ReceiptEnforcer.DepositExceedsPaid.selector, r.paid + 1, r.paid),
            _terms(),
            _args(r),
            _depositWithValue(REDEEMER, TERM, r.paid + 1)
        );
        assertFalse(enforcer.isPaymentUsed(CHAIN, PAYMENT));
    }

    function testFuzz_beforeHook_valueOverPaidReverts(uint256 value) public {
        ReceiptEnforcer.HireReceipt memory r = _receipt();
        value = bound(value, r.paid + 1, type(uint256).max);
        _hookReverts(
            abi.encodeWithSelector(ReceiptEnforcer.DepositExceedsPaid.selector, value, r.paid),
            _terms(),
            _args(r),
            _depositWithValue(REDEEMER, TERM, value)
        );
    }

    function test_beforeHook_revertsOnBatchMode() public {
        ModeCode mode = ModeLib.encode(CALLTYPE_BATCH, EXECTYPE_DEFAULT, MODE_DEFAULT, ModePayload.wrap(0x00));
        _modeReverts(mode, "CaveatEnforcer:invalid-call-type", _terms(), _args(_receipt()));
    }

    function test_beforeHook_revertsOnTryMode() public {
        ModeCode mode = ModeLib.encode(CALLTYPE_SINGLE, EXECTYPE_TRY, MODE_DEFAULT, ModePayload.wrap(0x00));
        _modeReverts(mode, "CaveatEnforcer:invalid-execution-type", _terms(), _args(_receipt()));
    }

    /*//////////////////////////////////////////////////////////////
                                 TERMS
    //////////////////////////////////////////////////////////////*/

    function test_beforeHook_revertsOnZeroChain() public {
        _hookReverts(
            abi.encodeWithSelector(ReceiptEnforcer.InvalidTerms.selector),
            abi.encode(uint256(0), MAX_AGE, _bindings()),
            _args(_receipt()),
            _deposit(REDEEMER, TERM)
        );
    }

    function test_beforeHook_revertsOnZeroMaxAge() public {
        _hookReverts(
            abi.encodeWithSelector(ReceiptEnforcer.InvalidTerms.selector),
            abi.encode(CHAIN, uint256(0), _bindings()),
            _args(_receipt()),
            _deposit(REDEEMER, TERM)
        );
    }

    function test_beforeHook_revertsOnNoBindings() public {
        _hookReverts(
            abi.encodeWithSelector(ReceiptEnforcer.InvalidTerms.selector),
            abi.encode(CHAIN, MAX_AGE, new ReceiptEnforcer.Binding[](0)),
            _args(_receipt()),
            _deposit(REDEEMER, TERM)
        );
    }

    function test_beforeHook_revertsOnTooManyBindings() public {
        uint256 max = enforcer.MAX_BINDINGS();
        ReceiptEnforcer.Binding[] memory bindings = new ReceiptEnforcer.Binding[](max + 1);
        for (uint256 i; i <= max; ++i) {
            bindings[i] = ReceiptEnforcer.Binding(signer, keccak256(bytes(REGISTRY)), AGENT_ID, TERM);
        }
        _hookReverts(
            abi.encodeWithSelector(ReceiptEnforcer.InvalidTerms.selector),
            abi.encode(CHAIN, MAX_AGE, bindings),
            _args(_receipt()),
            _deposit(REDEEMER, TERM)
        );
    }

    function test_getTermsInfo_roundTrips() public view {
        (uint256 chainId, uint256 maxAge, ReceiptEnforcer.Binding[] memory bindings) = enforcer.getTermsInfo(_terms());
        assertEq(chainId, CHAIN);
        assertEq(maxAge, MAX_AGE);
        assertEq(bindings.length, 1);
        assertEq(bindings[0].signer, signer);
        assertEq(bindings[0].agentRegistryHash, keccak256(bytes(REGISTRY)));
        assertEq(bindings[0].agentId, AGENT_ID);
        assertEq(bindings[0].termId, TERM);
    }

    /*//////////////////////////////////////////////////////////////
                             ACCESS CONTROL
    //////////////////////////////////////////////////////////////*/

    function test_constructor_revertsOnZeroManager() public {
        vm.expectRevert(ReceiptEnforcer.ZeroDelegationManager.selector);
        new ReceiptEnforcer(address(0));
    }

    function test_constructor_setsManager() public view {
        assertEq(enforcer.DELEGATION_MANAGER(), address(this));
    }

    /// The front-run this gate exists for: a stranger replays the pending redemption's arguments
    /// straight into the hook to burn the receipt.
    function test_beforeHook_revertsForStrangerCaller() public {
        _strangerHookReverts(
            abi.encodeWithSelector(ReceiptEnforcer.OnlyDelegationManager.selector, address(0xBAD)),
            _terms(),
            _args(_receipt()),
            _deposit(REDEEMER, TERM)
        );
        assertFalse(enforcer.isPaymentUsed(CHAIN, PAYMENT));
    }

    function test_noOpHooks_passForManager() public view {
        ModeCode mode = _singleDefault();
        enforcer.beforeAllHook("", "", mode, "", DELEGATION_HASH, DELEGATOR, REDEEMER);
        enforcer.afterHook("", "", mode, "", DELEGATION_HASH, DELEGATOR, REDEEMER);
        enforcer.afterAllHook("", "", mode, "", DELEGATION_HASH, DELEGATOR, REDEEMER);
    }

    function test_beforeAllHook_revertsForStranger() public {
        vm.prank(address(0xBAD));
        vm.expectRevert(abi.encodeWithSelector(ReceiptEnforcer.OnlyDelegationManager.selector, address(0xBAD)));
        enforcer.beforeAllHook("", "", _singleDefault(), "", DELEGATION_HASH, DELEGATOR, REDEEMER);
    }

    function test_afterHook_revertsForStranger() public {
        vm.prank(address(0xBAD));
        vm.expectRevert(abi.encodeWithSelector(ReceiptEnforcer.OnlyDelegationManager.selector, address(0xBAD)));
        enforcer.afterHook("", "", _singleDefault(), "", DELEGATION_HASH, DELEGATOR, REDEEMER);
    }

    function test_afterAllHook_revertsForStranger() public {
        vm.prank(address(0xBAD));
        vm.expectRevert(abi.encodeWithSelector(ReceiptEnforcer.OnlyDelegationManager.selector, address(0xBAD)));
        enforcer.afterAllHook("", "", _singleDefault(), "", DELEGATION_HASH, DELEGATOR, REDEEMER);
    }

    /*//////////////////////////////////////////////////////////////
                                HELPERS
    //////////////////////////////////////////////////////////////*/

    function _receipt() internal pure returns (ReceiptEnforcer.HireReceipt memory) {
        return ReceiptEnforcer.HireReceipt({
            version: 2,
            agentRegistry: REGISTRY,
            agentId: AGENT_ID,
            requester: REDEEMER,
            payment: PAYMENT,
            paid: 0.001 ether,
            requestHash: bytes32(0x2222222222222222222222222222222222222222222222222222222222222222),
            resultHash: bytes32(0x3333333333333333333333333333333333333333333333333333333333333333),
            issuedAt: ISSUED_AT,
            termId: TERM,
            expiresAt: ISSUED_AT + MAX_AGE
        });
    }

    function _bindings() internal view returns (ReceiptEnforcer.Binding[] memory bindings) {
        bindings = new ReceiptEnforcer.Binding[](1);
        bindings[0] = ReceiptEnforcer.Binding(signer, keccak256(bytes(REGISTRY)), AGENT_ID, TERM);
    }

    function _terms() internal view returns (bytes memory) {
        return abi.encode(CHAIN, MAX_AGE, _bindings());
    }

    function _sign(ReceiptEnforcer.HireReceipt memory r, uint256 chainId) internal view returns (bytes memory) {
        (uint8 v, bytes32 rr, bytes32 s) = vm.sign(signerKey, enforcer.hashReceipt(r, chainId));
        return abi.encodePacked(rr, s, v);
    }

    function _args(ReceiptEnforcer.HireReceipt memory r) internal view returns (bytes memory) {
        return abi.encode(r, _sign(r, CHAIN));
    }

    function _deposit(address receiver, bytes32 termId) internal pure returns (bytes memory) {
        return _depositWithValue(receiver, termId, 0.001 ether);
    }

    function _depositWithValue(address receiver, bytes32 termId, uint256 value) internal pure returns (bytes memory) {
        bytes memory call =
            abi.encodeWithSignature("deposit(address,bytes32,uint256,uint256)", receiver, termId, uint256(1), 0);
        return ExecutionLib.encodeSingle(MULTIVAULT, value, call);
    }

    function _singleDefault() internal pure returns (ModeCode) {
        return ModeLib.encode(CALLTYPE_SINGLE, EXECTYPE_DEFAULT, MODE_DEFAULT, ModePayload.wrap(0x00));
    }

    /// Arguments are evaluated before the cheatcode, so the external `hashReceipt` call that
    /// signing makes is not the call `expectRevert` binds to.
    function _hookReverts(bytes memory err, bytes memory terms, bytes memory args, bytes memory execution) internal {
        vm.expectRevert(err);
        _hook(terms, args, execution);
    }

    function _modeReverts(ModeCode mode, bytes memory err, bytes memory terms, bytes memory args) internal {
        bytes memory execution = _deposit(REDEEMER, TERM);
        vm.expectRevert(err);
        enforcer.beforeHook(terms, args, mode, execution, DELEGATION_HASH, DELEGATOR, REDEEMER);
    }

    function _strangerHookReverts(bytes memory err, bytes memory terms, bytes memory args, bytes memory execution)
        internal
    {
        vm.prank(address(0xBAD));
        vm.expectRevert(err);
        _hook(terms, args, execution);
    }

    function _hook(bytes memory terms, bytes memory args, bytes memory execution) internal {
        enforcer.beforeHook(terms, args, _singleDefault(), execution, DELEGATION_HASH, DELEGATOR, REDEEMER);
    }
}
