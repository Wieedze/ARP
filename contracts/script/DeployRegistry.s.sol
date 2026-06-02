// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";

import {ModuleRegistry} from "../src/ModuleRegistry.sol";

/// @title  DeployRegistry
/// @notice Deploys `ModuleRegistry` to the configured RPC.
/// @dev    Run with:
///         forge script script/DeployRegistry.s.sol \
///             --rpc-url <rpc> --private-key $PRIVATE_KEY --broadcast
///         Omit `--broadcast` for a dry-run simulation.
///
///         Pragma is `^0.8.24` (matches the contract under deployment).
///         Sibling script `DeployEnforcers.s.sol` handles the 0.8.23-pinned
///         enforcers separately — the cross-pragma split is intentional and
///         enforces compile-time validation per script.
contract DeployRegistry is Script {
    function run() external returns (ModuleRegistry registry) {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        console2.log("Deployer:", deployer);
        console2.log("Balance: ", deployer.balance);
        console2.log("ChainId: ", block.chainid);

        vm.startBroadcast(deployerKey);
        registry = new ModuleRegistry();
        vm.stopBroadcast();

        console2.log("ModuleRegistry deployed:", address(registry));
    }
}
