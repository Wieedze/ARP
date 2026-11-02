// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {ExecutionLib} from "@erc7579/lib/ExecutionLib.sol";

import {CaveatEnforcer} from "delegation-framework/enforcers/CaveatEnforcer.sol";
import {ModeCode} from "delegation-framework/utils/Types.sol";

/// @title  TrustStakeCapEnforcer
/// @author ARP — Agent Reputation Protocol (MetaMask Dev Cook-Off 2026)
/// @notice Caps cumulative native-token (tTRUST on Intuition) spend per
///         delegation within a fixed time window. The agent can spend up to
///         `cap` in a window of `periodSeconds`; the window opens at the first
///         spend after the previous one expired, and the counter resets then.
/// @dev    Stateful single-purpose caveat enforcer. Target and calldata
///         semantics are ignored — only the `value` field of the execution
///         matters. Compose with other enforcers (`AllowedTargetsEnforcer`,
///         `AllowedMethodsEnforcer`, etc.) to bound the action's shape.
///
///         **The window is fixed, not rolling.** It does not slide with each
///         spend: it starts at the first spend after expiry and lasts
///         `periodSeconds`. So spend can reach about 2 × `cap` inside any
///         interval of length `periodSeconds` that straddles a boundary —
///         `cap` at the end of one window, `cap` again at the start of the
///         next. Choose `cap` with that in mind.
///
///         `block.timestamp` is the window clock. Validator manipulation
///         tolerance (~15 s) is irrelevant at period scales of hours or days.
///
///         Threat model:
///         - `beforeHook` is called by the MetaMask `DelegationManager` during
///           `redeemDelegations`. State mutations on success are intentional.
///         - `beforeHook` is public and `_terms` is caller-supplied, so anyone
///           can call it with any `_delegationHash` — and a delegation hash is
///           public once the delegation is published or redeemed. State is
///           therefore keyed by `(msg.sender, _delegationHash)`, the pattern
///           MetaMask's own stateful enforcers use (`LimitedCallsEnforcer`,
///           `NativeTokenPeriodTransferEnforcer`). A direct caller only ever
///           writes its own slot; the slot a real redemption reads is the
///           DelegationManager's, which only the DelegationManager writes.
///           Until ADR 0118 the key was `_delegationHash` alone, and a direct
///           call with `cap = value = 2**255` filled a victim's counter so
///           every real redemption reverted `CapExceeded` for a whole period.
///         - The guard does not stop a delegator's own DelegationManager from
///           being used against them: that is the redemption path itself.
contract TrustStakeCapEnforcer is CaveatEnforcer {
    /*//////////////////////////////////////////////////////////////
                              CUSTOM ERRORS
    //////////////////////////////////////////////////////////////*/

    /// @notice Thrown when `_terms` decodes a zero `periodSeconds`.
    error InvalidPeriod();

    /// @notice Thrown when the attempted cumulative spend would exceed `cap`.
    /// @param  proposed The hypothetical cumulative after this call.
    /// @param  cap      The per-window cap.
    error CapExceeded(uint256 proposed, uint256 cap);

    /*//////////////////////////////////////////////////////////////
                                  EVENTS
    //////////////////////////////////////////////////////////////*/

    /// @notice Emitted on every successful `beforeHook` pass.
    /// @dev    `delegationManager` is `msg.sender`. Anyone can emit this event
    ///         by calling `beforeHook` directly, so a log is evidence of a
    ///         redemption only when `delegationManager` is the real one.
    /// @param  delegationManager The caller whose slot was updated.
    /// @param  delegationHash    The delegation under which the action runs.
    /// @param  newCumulative     The updated cumulative spend for this window.
    /// @param  cap               The configured per-window cap.
    event StakeCapChecked(
        address indexed delegationManager, bytes32 indexed delegationHash, uint256 newCumulative, uint256 cap
    );

    /*//////////////////////////////////////////////////////////////
                                 STORAGE
    //////////////////////////////////////////////////////////////*/

    /// @dev Cumulative native-token spend within the current window, keyed by
    ///      caller (the DelegationManager) and delegation hash.
    mapping(address delegationManager => mapping(bytes32 delegationHash => uint256 cumulative)) private
        _cumulativeSpend;

    /// @dev Block timestamp at which the current window started, keyed by
    ///      caller and delegation hash. Zero on first use.
    mapping(address delegationManager => mapping(bytes32 delegationHash => uint256 windowStart)) private _windowStart;

    /*//////////////////////////////////////////////////////////////
                            EXTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Validates an attempted staking action against the per-window
    ///         cap encoded in `_terms`, in the caller's own slot. Called by the
    ///         DelegationManager during redemption — reverting aborts the
    ///         redemption atomically.
    /// @param  _terms             ABI-encoded `(uint256 cap, uint256 periodSeconds)`.
    /// @param  _mode              Execution mode (must be single-call, default).
    /// @param  _executionCallData The single-call execution payload
    ///                            (target ++ value ++ callData). Only `value`
    ///                            is consumed.
    /// @param  _delegationHash    The delegation being redeemed.
    function beforeHook(
        bytes calldata _terms,
        bytes calldata, /* _args */
        ModeCode _mode,
        bytes calldata _executionCallData,
        bytes32 _delegationHash,
        address, /* _delegator */
        address /* _redeemer */
    ) public override onlySingleCallTypeMode(_mode) onlyDefaultExecutionMode(_mode) {
        (uint256 cap, uint256 period) = abi.decode(_terms, (uint256, uint256));
        if (period == 0) revert InvalidPeriod();

        (, uint256 value,) = ExecutionLib.decodeSingle(_executionCallData);

        uint256 currentStart = _windowStart[msg.sender][_delegationHash];
        uint256 currentCumulative = _cumulativeSpend[msg.sender][_delegationHash];

        // Reset the window if it expired (or if this is the first use).
        if (block.timestamp - currentStart >= period) {
            currentStart = block.timestamp;
            currentCumulative = 0;
            _windowStart[msg.sender][_delegationHash] = currentStart;
        }

        uint256 proposed = currentCumulative + value;
        if (proposed > cap) revert CapExceeded(proposed, cap);

        _cumulativeSpend[msg.sender][_delegationHash] = proposed;
        emit StakeCapChecked(msg.sender, _delegationHash, proposed, cap);
    }

    /// @notice Decode the `_terms` payload for off-chain inspection.
    /// @param  _terms ABI-encoded `(uint256 cap, uint256 periodSeconds)`.
    /// @return cap           The per-window cap.
    /// @return periodSeconds The window length.
    function getTermsInfo(bytes calldata _terms) external pure returns (uint256 cap, uint256 periodSeconds) {
        return abi.decode(_terms, (uint256, uint256));
    }

    /// @notice Return the current cumulative spend and window start for a
    ///         given delegation, as recorded for one caller. Both are zero
    ///         before that caller's first call.
    /// @dev    Pass the DelegationManager's address to read the slot that
    ///         governs real redemptions. Any other address reads a slot only
    ///         that address can write.
    /// @param  delegationManager The caller whose slot to read.
    /// @param  delegationHash    The delegation to query.
    /// @return cumulative        Cumulative native-token spend in the current window.
    /// @return windowStart       Block timestamp at which the current window began.
    function getState(address delegationManager, bytes32 delegationHash)
        external
        view
        returns (uint256 cumulative, uint256 windowStart)
    {
        return (_cumulativeSpend[delegationManager][delegationHash], _windowStart[delegationManager][delegationHash]);
    }
}
