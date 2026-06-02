// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Script, console2} from "forge-std/Script.sol";

import {DomainScopeEnforcer} from "../src/enforcers/DomainScopeEnforcer.sol";
import {TrustStakeCapEnforcer} from "../src/enforcers/TrustStakeCapEnforcer.sol";

/// @title  DeployEnforcers
/// @notice Deploys the two ARP caveat enforcers to the configured RPC.
/// @dev    Run with:
///         forge script script/DeployEnforcers.s.sol \
///             --rpc-url <rpc> --private-key $PRIVATE_KEY --broadcast
///         Omit `--broadcast` for a dry-run simulation.
///
///         Pragma is `0.8.23` strict (matches the enforcers + vendored
///         delegation-framework). Sibling script `DeployRegistry.s.sol`
///         handles `ModuleRegistry` separately under its own `^0.8.24`.
contract DeployEnforcers is Script {
    function run()
        external
        returns (DomainScopeEnforcer domainScopeEnforcer, TrustStakeCapEnforcer trustStakeCapEnforcer)
    {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        console2.log("Deployer:", deployer);
        console2.log("Balance: ", deployer.balance);
        console2.log("ChainId: ", block.chainid);

        vm.startBroadcast(deployerKey);
        domainScopeEnforcer = new DomainScopeEnforcer();
        trustStakeCapEnforcer = new TrustStakeCapEnforcer();
        vm.stopBroadcast();

        console2.log("DomainScopeEnforcer deployed:   ", address(domainScopeEnforcer));
        console2.log("TrustStakeCapEnforcer deployed: ", address(trustStakeCapEnforcer));
    }
}
