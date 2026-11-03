// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";

import {IdentityRegistry} from "../src/erc8004/IdentityRegistry.sol";

/// @title  DeployIdentityRegistry
/// @notice Deploys the ARP-vendored ERC-8004 `IdentityRegistry`. The vendored source is a port of
///         ChaosChain/trustless-agents-erc-ri to OpenZeppelin v5 — see ADR `0010` for the rationale
///         (no canonical deployment exists on Intuition Testnet).
/// @dev    Run it through `scripts/deploy/deploy.sh --identity-registry`. Directly:
///         forge script script/DeployIdentityRegistry.s.sol --rpc-url <rpc> --private-key $PRIVATE_KEY
///         and add `--broadcast` to send.
///
///         **Testnet 13579 only, with no override.** No ARP registry is on mainnet and none is
///         planned (ADR `0025`); on mainnet the identity is the canonical ERC-8004 registry.
///
///         Pragma `^0.8.20` matches the vendored IdentityRegistry; `DeployEnforcers.s.sol` is
///         `0.8.23` strict, and `auto_detect_solc = true` in foundry.toml compiles both.
contract DeployIdentityRegistry is Script {
    /// @notice The chain is not testnet 13579.
    error WrongChain(uint256 chainId);

    uint256 internal constant TESTNET = 13_579;

    /// @notice Deploy `IdentityRegistry` from `PRIVATE_KEY`.
    /// @return registry The new deployment.
    function run() external returns (IdentityRegistry registry) {
        if (block.chainid != TESTNET) revert WrongChain(block.chainid);

        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        console2.log("Deployer:", deployer);
        console2.log("Balance: ", deployer.balance);
        console2.log("ChainId: ", block.chainid);

        vm.startBroadcast(deployerKey);
        registry = new IdentityRegistry();
        vm.stopBroadcast();

        console2.log("IdentityRegistry (ERC-8004) deployed:", address(registry));
    }
}
