// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Reentrant — classic checks-effects-interactions violation.
/// @notice Intentionally vulnerable. Used as input for the ARP demo agent.
contract Reentrant {
    mapping(address => uint256) public balances;

    function deposit() external payable {
        balances[msg.sender] += msg.value;
    }

    /// @notice Vulnerable: state mutation happens AFTER the external call,
    ///         so a reentrant call into `withdraw` reads a stale balance.
    function withdraw(uint256 amount) external {
        require(balances[msg.sender] >= amount, "insufficient");

        // External call BEFORE updating state — reentrancy entry point.
        (bool ok,) = msg.sender.call{value: amount}("");
        require(ok, "transfer failed");

        balances[msg.sender] -= amount;
    }

    receive() external payable {}
}
