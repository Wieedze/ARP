// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Clean — a deliberately well-written reference contract.
/// @notice Used as the "no critical findings" path for the ARP demo agent.
///         Demonstrates checks-effects-interactions, explicit access control,
///         custom errors, NatSpec on every external function, and event
///         emission on every state change.
contract Clean {
    error NotOwner();
    error InvalidAmount();
    error InsufficientBalance();
    error TransferFailed();

    event Deposited(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    address public immutable initialOwner;
    address public owner;
    mapping(address => uint256) public balances;

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor() {
        owner = msg.sender;
        initialOwner = msg.sender;
    }

    /// @notice Deposit ETH into the user's balance.
    function deposit() external payable {
        if (msg.value == 0) revert InvalidAmount();
        balances[msg.sender] += msg.value;
        emit Deposited(msg.sender, msg.value);
    }

    /// @notice Withdraw `amount` ETH from the user's balance.
    /// @dev    Checks-effects-interactions: balance is debited before the
    ///         external call so a reentrant call sees the updated state.
    function withdraw(uint256 amount) external {
        uint256 bal = balances[msg.sender];
        if (amount == 0) revert InvalidAmount();
        if (amount > bal) revert InsufficientBalance();

        balances[msg.sender] = bal - amount;

        (bool ok,) = msg.sender.call{value: amount}("");
        if (!ok) revert TransferFailed();

        emit Withdrawn(msg.sender, amount);
    }

    /// @notice Transfer ownership of the contract. Owner-restricted.
    function transferOwnership(address newOwner) external onlyOwner {
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }
}
