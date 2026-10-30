// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {ExecutionLib} from "@erc7579/lib/ExecutionLib.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

import {CaveatEnforcer} from "delegation-framework/enforcers/CaveatEnforcer.sol";
import {ModeCode} from "delegation-framework/utils/Types.sol";

/// @title  ReceiptEnforcer
/// @author ARP — Agent Reputation Protocol
/// @notice "No proof, no deposit", held by a contract (ADR 0094 §2, task 43). A redemption passes
///         one signed hire receipt in `_args`; the deposit runs only if the receipt was signed by a
///         node key the delegator accepted, names the redeeming agent as the payer, is for the
///         term the deposit targets, is fresh, and its payment has never unlocked a deposit here.
/// @dev    The receipt is verified exactly as `packages/protocol/src/hire-receipt.ts` signs it:
///         EIP-712, domain `{name: "ARP Hire Receipt", version: "1", chainId}` with **no**
///         `verifyingContract`, struct `HireReceipt` in that file's field order. Nothing in the
///         signed format changes for this contract; the cross-implementation vector in
///         `test/enforcers/ReceiptEnforcer.t.sol` is a viem signature checked here.
///
///         Replay (`security.md`, signature replay), ADR 0098:
///         - **nonce** — the receipt's `payment` transaction hash. One payment unlocks one deposit,
///           keyed by `(chainId, payment)` rather than by the receipt's digest, so a node that signs
///           two receipts for one payment cannot unlock two deposits.
///         - **chain id** — in the domain. The accepted chain is the payment's, fixed in `_terms`.
///         - **verifying contract** — absent from the signed domain, with cause: `hire-receipt.ts`
///           signs for any verifier. The used set is per deployment, so a receipt consumed here can
///           still be presented to a second verifier (another deployment, or the sponsoring
///           service). That gap is recorded in ADR 0098 and closes only with a v2 receipt.
///
///         Threat model:
///         - Every hook is gated on `msg.sender == DELEGATION_MANAGER`. Unlike
///           `TrustStakeCapEnforcer`, this one keys state by a value anyone can read from a pending
///           redemption, so an ungated `beforeHook` would let a stranger burn a receipt by calling
///           it first.
///         - `_delegator` is whoever funds the deposit (ARP's sponsoring account). `_redeemer` is the
///           hiring agent: it must be the receipt's `requester` and the deposit's `receiver`, so the
///           position is the agent's and the agent is the one who paid.
///         - The execution must be one `MultiVault.deposit(receiver, termId, curveId, minShares)`.
///           The target is not checked here: compose with `AllowedTargetsEnforcer`. The amount is
///           not checked here: compose with `TrustStakeCapEnforcer`.
///         - Signers are EOAs (node keys). EIP-1271 is not supported.
///         - A revert in any check aborts the whole redemption; the used set is written only on
///           success and rolls back with it.
contract ReceiptEnforcer is CaveatEnforcer {
    /*//////////////////////////////////////////////////////////////
                                  TYPES
    //////////////////////////////////////////////////////////////*/

    /// @notice The hire receipt, field for field as `hire-receipt.ts` signs it.
    struct HireReceipt {
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

    /// @notice One accepted node key, the ERC-8004 agent it signs as, and the term its receipts
    ///         unlock. The binding the install handshake establishes (ADR 0094 §1), fixed by the
    ///         delegator at signing time.
    /// @param  signer            The node key that signs hire receipts.
    /// @param  agentRegistryHash `keccak256(bytes(agentRegistry))`, e.g. of `eip155:13579:0x…`.
    /// @param  agentId           The agent's ERC-721 token id in that registry.
    /// @param  termId            The MultiVault term a receipt from this signer may be deposited on.
    struct Binding {
        address signer;
        bytes32 agentRegistryHash;
        uint256 agentId;
        bytes32 termId;
    }

    /*//////////////////////////////////////////////////////////////
                              CUSTOM ERRORS
    //////////////////////////////////////////////////////////////*/

    /// @notice A hook was called by something other than the DelegationManager.
    error OnlyDelegationManager(address caller);

    /// @notice The constructor was given the zero address.
    error ZeroDelegationManager();

    /// @notice `_terms` has a zero chain id, a zero max age, no binding, or too many.
    error InvalidTerms();

    /// @notice The receipt's payload version is not one this contract knows.
    error UnknownReceiptVersion(uint256 version);

    /// @notice The signature is not a valid ECDSA signature.
    error InvalidSignature();

    /// @notice No binding in `_terms` names the recovered signer.
    error SignerNotAccepted(address signer);

    /// @notice The signer is accepted, but not as this agent for this term.
    error BindingMismatch(address signer, bytes32 agentRegistryHash, uint256 agentId, bytes32 termId);

    /// @notice The receipt's payer is not the agent redeeming.
    error RequesterNotRedeemer(address requester, address redeemer);

    /// @notice The execution is not a single `deposit(address,bytes32,uint256,uint256)` call.
    error NotADeposit();

    /// @notice The deposit's receiver is not the agent redeeming.
    error ReceiverNotRedeemer(address receiver, address redeemer);

    /// @notice The receipt is dated after the current block.
    error ReceiptFromFuture(uint256 issuedAt);

    /// @notice The receipt is older than `maxAge`.
    error ReceiptExpired(uint256 issuedAt, uint256 maxAge);

    /// @notice This payment already unlocked a deposit through this enforcer.
    error PaymentAlreadyUsed(bytes32 paymentKey);

    /*//////////////////////////////////////////////////////////////
                                  EVENTS
    //////////////////////////////////////////////////////////////*/

    /// @notice Emitted when a receipt unlocks a deposit.
    /// @param  delegationHash The delegation being redeemed.
    /// @param  paymentKey     `keccak256(abi.encode(chainId, payment))`, the replay key.
    /// @param  signer         The node key that signed the receipt.
    /// @param  requester      The agent that paid and now deposits.
    /// @param  termId         The term deposited on.
    event ReceiptConsumed(
        bytes32 indexed delegationHash,
        bytes32 indexed paymentKey,
        address indexed signer,
        address requester,
        bytes32 termId
    );

    /*//////////////////////////////////////////////////////////////
                                  STATE
    //////////////////////////////////////////////////////////////*/

    /// @notice The only payload version `hire-receipt.ts` signs (`HIRE_RECEIPT_VERSION`).
    uint256 public constant RECEIPT_VERSION = 1;

    /// @notice Upper bound on bindings per delegation, so the lookup loop is bounded.
    uint256 public constant MAX_BINDINGS = 32;

    /// @notice `typeHash` of the EIP-712 domain `hire-receipt.ts` signs under.
    bytes32 public constant DOMAIN_TYPEHASH = keccak256("EIP712Domain(string name,string version,uint256 chainId)");

    /// @notice `typeHash` of `HireReceipt`, in `HIRE_RECEIPT_TYPES` field order.
    bytes32 public constant RECEIPT_TYPEHASH = keccak256(
        "HireReceipt(uint256 version,string agentRegistry,uint256 agentId,address requester,bytes32 payment,"
        "uint256 paid,bytes32 requestHash,bytes32 resultHash,uint256 issuedAt)"
    );

    bytes32 private constant _NAME_HASH = keccak256("ARP Hire Receipt");
    bytes32 private constant _VERSION_HASH = keccak256("1");

    /// @dev `MultiVault.deposit(address receiver, bytes32 termId, uint256 curveId, uint256 minShares)`.
    bytes4 private constant _DEPOSIT_SELECTOR = bytes4(keccak256("deposit(address,bytes32,uint256,uint256)"));

    /// @dev The selector plus four 32-byte words.
    uint256 private constant _DEPOSIT_CALLDATA_LENGTH = 132;

    /// @notice The DelegationManager allowed to call the hooks.
    address public immutable DELEGATION_MANAGER;

    /// @dev Payments that already unlocked a deposit, keyed by `keccak256(abi.encode(chainId, payment))`.
    mapping(bytes32 paymentKey => bool used) private _paymentUsed;

    /*//////////////////////////////////////////////////////////////
                                MODIFIERS
    //////////////////////////////////////////////////////////////*/

    modifier onlyDelegationManager() {
        if (msg.sender != DELEGATION_MANAGER) revert OnlyDelegationManager(msg.sender);
        _;
    }

    /*//////////////////////////////////////////////////////////////
                               CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    /// @param delegationManager The MetaMask DelegationManager on this chain.
    constructor(address delegationManager) {
        if (delegationManager == address(0)) revert ZeroDelegationManager();
        DELEGATION_MANAGER = delegationManager;
    }

    /*//////////////////////////////////////////////////////////////
                            EXTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Decode `_terms` for off-chain inspection.
    /// @param  _terms ABI-encoded `(uint256 receiptChainId, uint256 maxAge, Binding[] bindings)`.
    /// @return receiptChainId The chain the payment, and so the receipt's domain, is on.
    /// @return maxAge         Seconds a receipt stays usable after `issuedAt`.
    /// @return bindings       The accepted signers, each bound to one agent and one term.
    function getTermsInfo(bytes calldata _terms)
        external
        pure
        returns (uint256 receiptChainId, uint256 maxAge, Binding[] memory bindings)
    {
        return abi.decode(_terms, (uint256, uint256, Binding[]));
    }

    /// @notice Whether a payment has already unlocked a deposit through this enforcer.
    /// @param  chainId The chain the payment was made on.
    /// @param  payment The payment's transaction hash.
    /// @return used    True once a receipt naming it has been consumed.
    function isPaymentUsed(uint256 chainId, bytes32 payment) external view returns (bool used) {
        return _paymentUsed[_paymentKey(chainId, payment)];
    }

    /*//////////////////////////////////////////////////////////////
                             PUBLIC FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Check the receipt in `_args` against `_terms` and the deposit in the execution, and
    ///         mark its payment used. Called by the DelegationManager during redemption; a revert
    ///         aborts the redemption.
    /// @param  _terms             ABI-encoded `(uint256 receiptChainId, uint256 maxAge, Binding[] bindings)`.
    /// @param  _args              ABI-encoded `(HireReceipt receipt, bytes signature)`.
    /// @param  _mode              Execution mode (must be single call, default).
    /// @param  _executionCallData The single-call execution (target ++ value ++ callData).
    /// @param  _delegationHash    The delegation being redeemed, for the event.
    /// @param  _redeemer          The agent redeeming: must be the payer and the receiver.
    function beforeHook(
        bytes calldata _terms,
        bytes calldata _args,
        ModeCode _mode,
        bytes calldata _executionCallData,
        bytes32 _delegationHash,
        address, /* _delegator */
        address _redeemer
    ) public override onlyDelegationManager onlySingleCallTypeMode(_mode) onlyDefaultExecutionMode(_mode) {
        (uint256 receiptChainId, uint256 maxAge, Binding[] memory bindings) =
            abi.decode(_terms, (uint256, uint256, Binding[]));
        if (receiptChainId == 0 || maxAge == 0 || bindings.length == 0 || bindings.length > MAX_BINDINGS) {
            revert InvalidTerms();
        }

        (HireReceipt memory receipt, bytes memory signature) = abi.decode(_args, (HireReceipt, bytes));
        if (receipt.version != RECEIPT_VERSION) revert UnknownReceiptVersion(receipt.version);

        (address signer, ECDSA.RecoverError err,) = ECDSA.tryRecover(hashReceipt(receipt, receiptChainId), signature);
        if (err != ECDSA.RecoverError.NoError) revert InvalidSignature();

        bytes32 termId = _depositTerm(_executionCallData, _redeemer);
        _requireBinding(bindings, signer, keccak256(bytes(receipt.agentRegistry)), receipt.agentId, termId);

        if (receipt.requester != _redeemer) revert RequesterNotRedeemer(receipt.requester, _redeemer);
        if (receipt.issuedAt > block.timestamp) revert ReceiptFromFuture(receipt.issuedAt);
        if (block.timestamp - receipt.issuedAt > maxAge) revert ReceiptExpired(receipt.issuedAt, maxAge);

        bytes32 paymentKey = _paymentKey(receiptChainId, receipt.payment);
        if (_paymentUsed[paymentKey]) revert PaymentAlreadyUsed(paymentKey);
        _paymentUsed[paymentKey] = true;

        emit ReceiptConsumed(_delegationHash, paymentKey, signer, receipt.requester, termId);
    }

    /// @notice No-op, gated so the hook surface has one caller.
    function beforeAllHook(bytes calldata, bytes calldata, ModeCode, bytes calldata, bytes32, address, address)
        public
        view
        override
        onlyDelegationManager
    {}

    /// @notice No-op, gated so the hook surface has one caller.
    function afterHook(bytes calldata, bytes calldata, ModeCode, bytes calldata, bytes32, address, address)
        public
        view
        override
        onlyDelegationManager
    {}

    /// @notice No-op, gated so the hook surface has one caller.
    function afterAllHook(bytes calldata, bytes calldata, ModeCode, bytes calldata, bytes32, address, address)
        public
        view
        override
        onlyDelegationManager
    {}

    /// @notice The EIP-712 digest `hire-receipt.ts` signs for `receipt` on `chainId`.
    /// @param  receipt The receipt.
    /// @param  chainId The chain in the domain: the payment's.
    /// @return digest  `keccak256("\x19\x01" ‖ domainSeparator ‖ structHash)`.
    function hashReceipt(HireReceipt memory receipt, uint256 chainId) public pure returns (bytes32 digest) {
        bytes32 domainSeparator = keccak256(abi.encode(DOMAIN_TYPEHASH, _NAME_HASH, _VERSION_HASH, chainId));
        bytes32 structHash = keccak256(
            abi.encode(
                RECEIPT_TYPEHASH,
                receipt.version,
                keccak256(bytes(receipt.agentRegistry)),
                receipt.agentId,
                receipt.requester,
                receipt.payment,
                receipt.paid,
                receipt.requestHash,
                receipt.resultHash,
                receipt.issuedAt
            )
        );
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
    }

    /*//////////////////////////////////////////////////////////////
                            PRIVATE FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    function _depositTerm(bytes calldata executionCallData, address redeemer) private pure returns (bytes32 termId) {
        (,, bytes calldata callData) = ExecutionLib.decodeSingle(executionCallData);
        if (callData.length != _DEPOSIT_CALLDATA_LENGTH || bytes4(callData[:4]) != _DEPOSIT_SELECTOR) {
            revert NotADeposit();
        }
        address receiver;
        (receiver, termId,,) = abi.decode(callData[4:], (address, bytes32, uint256, uint256));
        if (receiver != redeemer) revert ReceiverNotRedeemer(receiver, redeemer);
    }

    function _requireBinding(
        Binding[] memory bindings,
        address signer,
        bytes32 agentRegistryHash,
        uint256 agentId,
        bytes32 termId
    ) private pure {
        bool signerKnown;
        for (uint256 i; i < bindings.length; ++i) {
            Binding memory b = bindings[i];
            if (b.signer != signer) continue;
            if (b.agentRegistryHash == agentRegistryHash && b.agentId == agentId && b.termId == termId) return;
            signerKnown = true;
        }
        if (!signerKnown) revert SignerNotAccepted(signer);
        revert BindingMismatch(signer, agentRegistryHash, agentId, termId);
    }

    function _paymentKey(uint256 chainId, bytes32 payment) private pure returns (bytes32) {
        return keccak256(abi.encode(chainId, payment));
    }
}
