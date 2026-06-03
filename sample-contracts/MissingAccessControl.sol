// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title MissingAccessControl — privileged actions exposed to anyone.
/// @notice Intentionally vulnerable. Used as input for the ARP demo agent.
contract MissingAccessControl {
    address public owner;
    uint256 public reserveFee;
    address public treasury;

    constructor() {
        owner = msg.sender;
        treasury = msg.sender;
        reserveFee = 100; // basis points
    }

    /// @notice Vulnerable: no access control — anyone can drain the treasury
    ///         address pointer.
    function setTreasury(address newTreasury) external {
        treasury = newTreasury;
    }

    /// @notice Vulnerable: no access control — anyone can raise fees to 100%.
    function setReserveFee(uint256 newFee) external {
        reserveFee = newFee;
    }

    /// @notice Vulnerable: no access control — anyone can transfer ownership.
    function transferOwnership(address newOwner) external {
        owner = newOwner;
    }

    receive() external payable {}
}
