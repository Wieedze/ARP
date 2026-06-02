// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {ExecutionLib} from "@erc7579/lib/ExecutionLib.sol";

import {CaveatEnforcer} from "delegation-framework/enforcers/CaveatEnforcer.sol";
import {ModeCode} from "delegation-framework/utils/Types.sol";

/// @dev Minimal local re-declaration of `ModuleRegistry.registerModule`, used
///      solely to extract its function selector. We do not import the real
///      contract because `ModuleRegistry` is compiled under `^0.8.24` while
///      this enforcer is pinned to `0.8.23` to match the vendored
///      delegation-framework.
interface IModuleRegistry {
    function registerModule(
        string calldata name,
        string calldata domain,
        string calldata schemaURI,
        string calldata description
    )
        external
        returns (uint256 id);
}

/// @title  DomainScopeEnforcer
/// @author ARP — Agent Reputation Protocol (MetaMask Dev Cook-Off 2026)
/// @notice Restricts an agent's delegated authority to module registrations
///         whose `domain` argument is in a user-pre-approved hash list.
/// @dev    Single-responsibility caveat enforcer. Validates that:
///         (1) the execution is a single-call, default-mode action;
///         (2) the function selector matches `ModuleRegistry.registerModule`;
///         (3) the decoded `domain` argument's keccak256 hash is in the
///             allowed list encoded in `_terms`.
///
///         Composition is the framework's discipline: this enforcer does NOT
///         restrict the target address (compose with `AllowedTargetsEnforcer`
///         to pin the target to the deployed `ModuleRegistry`) and does NOT
///         restrict the spend value (compose with `TrustStakeCapEnforcer` for
///         that axis).
///
///         Threat model:
///         - `beforeHook` is called by the MetaMask `DelegationManager` during
///           `redeemDelegations`. We do not enforce `msg.sender ==
///           DELEGATION_MANAGER` for the MVP — see ADR if added later.
///         - `_terms` is set at delegation-signing time by the delegator and
///           is part of the signed payload; tampering invalidates the
///           signature and the redemption reverts upstream.
///         - `_executionCallData` is provided by the redeemer (agent) at
///           redemption time; this enforcer validates its shape and content.
contract DomainScopeEnforcer is CaveatEnforcer {
    /*//////////////////////////////////////////////////////////////
                              CUSTOM ERRORS
    //////////////////////////////////////////////////////////////*/

    /// @notice Thrown when the call's function selector is not
    ///         `ModuleRegistry.registerModule`.
    /// @param  selector The unexpected selector observed in the call.
    error UnsupportedSelector(bytes4 selector);

    /// @notice Thrown when the decoded `domain` is not in the user's allowed
    ///         hash list.
    /// @param  domainHash The keccak256 of the rejected domain.
    error DomainNotAllowed(bytes32 domainHash);

    /// @notice Thrown when `_terms` decodes to an empty allowed-hash list —
    ///         no domain could possibly satisfy the delegation.
    error EmptyAllowedList();

    /*//////////////////////////////////////////////////////////////
                                  EVENTS
    //////////////////////////////////////////////////////////////*/

    /// @notice Emitted on every successful `beforeHook` pass.
    /// @param  delegationHash The hash of the delegation being redeemed.
    /// @param  domainHash     The keccak256 of the matched domain.
    event DomainScopeChecked(bytes32 indexed delegationHash, bytes32 domainHash);

    /*//////////////////////////////////////////////////////////////
                                CONSTANTS
    //////////////////////////////////////////////////////////////*/

    bytes4 internal constant REGISTER_MODULE_SELECTOR = IModuleRegistry.registerModule.selector;

    /*//////////////////////////////////////////////////////////////
                            EXTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Validates an attempted module registration against the
    ///         user's pre-approved domain list. MUST be called by the
    ///         DelegationManager during redemption — reverting on any
    ///         failure aborts the redemption atomically.
    /// @param  _terms            ABI-encoded `bytes32[] allowedDomainHashes`.
    /// @param  _mode             Execution mode (must be single-call, default).
    /// @param  _executionCallData The single-call execution payload
    ///                            (target ++ value ++ callData).
    /// @param  _delegationHash   The delegation being redeemed.
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
        bytes32 domainHash = _extractDomainHash(_executionCallData);
        _enforceAllowed(_terms, domainHash);
        emit DomainScopeChecked(_delegationHash, domainHash);
    }

    /*//////////////////////////////////////////////////////////////
                            INTERNAL HELPERS
    //////////////////////////////////////////////////////////////*/

    /// @dev Decode the single-call execution payload, verify the selector,
    ///      and return `keccak256(bytes(domain))` extracted from the
    ///      `registerModule` arguments. Reverts on selector mismatch.
    function _extractDomainHash(bytes calldata _executionCallData) private pure returns (bytes32) {
        (,, bytes calldata callData) = ExecutionLib.decodeSingle(_executionCallData);
        if (callData.length < 4) revert UnsupportedSelector(bytes4(0));
        bytes4 selector = bytes4(callData[0:4]);
        if (selector != REGISTER_MODULE_SELECTOR) revert UnsupportedSelector(selector);

        // `callData[4:]` is a calldata slice; abi.decode consumes it directly.
        (, string memory domain,,) = abi.decode(callData[4:], (string, string, string, string));
        return keccak256(bytes(domain));
    }

    /// @dev Linear membership scan against the user's allowed-domain list.
    ///      Reverts on empty list or missing match.
    function _enforceAllowed(bytes calldata _terms, bytes32 domainHash) private pure {
        bytes32[] memory allowed = abi.decode(_terms, (bytes32[]));
        uint256 len = allowed.length;
        if (len == 0) revert EmptyAllowedList();
        for (uint256 i = 0; i < len; ++i) {
            if (allowed[i] == domainHash) return;
        }
        revert DomainNotAllowed(domainHash);
    }

    /// @notice Decode the `_terms` payload for off-chain inspection.
    /// @param  _terms ABI-encoded `bytes32[] allowedDomainHashes`.
    /// @return The decoded allowed-domain-hash list.
    function getTermsInfo(bytes calldata _terms) external pure returns (bytes32[] memory) {
        return abi.decode(_terms, (bytes32[]));
    }
}
