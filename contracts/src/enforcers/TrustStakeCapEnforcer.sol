// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {ExecutionLib} from "@erc7579/lib/ExecutionLib.sol";

import {CaveatEnforcer} from "delegation-framework/enforcers/CaveatEnforcer.sol";
import {ModeCode} from "delegation-framework/utils/Types.sol";

/// @title  TrustStakeCapEnforcer
/// @author ARP — Agent Reputation Protocol (MetaMask Dev Cook-Off 2026)
/// @notice Caps cumulative native-token (tTRUST on Intuition) spend per
///         delegation across a rolling time window. The agent can stake up
///         to `cap` over each rolling `periodSeconds` window; subsequent
///         stakes within the same window must not exceed the cap, and the
///         counter resets when the window expires.
/// @dev    Stateful single-purpose caveat enforcer. State is scoped per
///         `delegationHash`, so different delegations from the same delegator
///         (or different delegators sharing the same agent) do not interfere.
///         Target and calldata semantics are ignored — only the `value`
///         field of the execution matters. Compose with other enforcers
///         (`AllowedTargetsEnforcer`, `DomainScopeEnforcer`, etc.) to bound
///         the action's shape.
///
///         `block.timestamp` is the rolling-window clock. Miner manipulation
///         tolerance (~15 s) is irrelevant at period scales of hours or days.
///
///         Threat model:
///         - `beforeHook` is called by the MetaMask `DelegationManager` during
///           `redeemDelegations`. State mutations on success are intentional.
///         - The MVP does not gate `msg.sender == DELEGATION_MANAGER`. A
///           caller invoking `beforeHook` directly (outside a real redemption)
///           could pollute state for a specific `_delegationHash`, but only
///           for a hash they know — they cannot grief another delegation.
///           Future ADR may revisit this; Bear Trap's audit recommends the
///           guard. See `.claude/rules/metamask-delegation.md`.
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
    /// @param  delegationHash The delegation under which the action runs.
    /// @param  newCumulative  The updated cumulative spend for this window.
    /// @param  cap            The configured per-window cap.
    event StakeCapChecked(bytes32 indexed delegationHash, uint256 newCumulative, uint256 cap);

    /*//////////////////////////////////////////////////////////////
                                 STORAGE
    //////////////////////////////////////////////////////////////*/

    /// @dev Cumulative native-token spend within the current rolling window,
    ///      keyed by delegation hash.
    mapping(bytes32 delegationHash => uint256 cumulative) private _cumulativeSpend;

    /// @dev Block timestamp at which the current rolling window started,
    ///      keyed by delegation hash. Zero on first use.
    mapping(bytes32 delegationHash => uint256 windowStart) private _windowStart;

    /*//////////////////////////////////////////////////////////////
                            EXTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Validates an attempted staking action against the per-window
    ///         cap encoded in `_terms`. MUST be called by the DelegationManager
    ///         during redemption — reverting aborts the redemption atomically.
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
    )
        public
        override
        onlySingleCallTypeMode(_mode)
        onlyDefaultExecutionMode(_mode)
    {
        (uint256 cap, uint256 period) = abi.decode(_terms, (uint256, uint256));
        if (period == 0) revert InvalidPeriod();

        (, uint256 value,) = ExecutionLib.decodeSingle(_executionCallData);

        uint256 currentStart = _windowStart[_delegationHash];
        uint256 currentCumulative = _cumulativeSpend[_delegationHash];

        // Reset the window if it expired (or if this is the first use).
        if (block.timestamp - currentStart >= period) {
            currentStart = block.timestamp;
            currentCumulative = 0;
            _windowStart[_delegationHash] = currentStart;
        }

        uint256 proposed = currentCumulative + value;
        if (proposed > cap) revert CapExceeded(proposed, cap);

        _cumulativeSpend[_delegationHash] = proposed;
        emit StakeCapChecked(_delegationHash, proposed, cap);
    }

    /// @notice Decode the `_terms` payload for off-chain inspection.
    /// @param  _terms ABI-encoded `(uint256 cap, uint256 periodSeconds)`.
    /// @return cap           The per-window cap.
    /// @return periodSeconds The rolling-window length.
    function getTermsInfo(bytes calldata _terms)
        external
        pure
        returns (uint256 cap, uint256 periodSeconds)
    {
        return abi.decode(_terms, (uint256, uint256));
    }

    /// @notice Return the current cumulative spend and window start for a
    ///         given delegation. Both are zero before the first call.
    /// @param  delegationHash The delegation to query.
    /// @return cumulative     Cumulative native-token spend in the current window.
    /// @return windowStart    Block timestamp at which the current window began.
    function getState(bytes32 delegationHash)
        external
        view
        returns (uint256 cumulative, uint256 windowStart)
    {
        return (_cumulativeSpend[delegationHash], _windowStart[delegationHash]);
    }
}
