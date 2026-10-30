// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Script, console2} from "forge-std/Script.sol";

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
///         `ModuleRegistry` and `DomainScopeEnforcer` were deployed here too and are gone
///         (ADR `0051`, and the domain scope with it). One enforcer is left, deliberately:
///         a cumulative cap over a rolling period is the thing MetaMask's stock `valueLte`
///         does not give, since that bounds one redemption rather than a budget.
contract DeployEnforcers is Script {
    function run()
        external
        returns (TrustStakeCapEnforcer trustStakeCapEnforcer)
    {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        console2.log("Deployer:", deployer);
        console2.log("Balance: ", deployer.balance);
        console2.log("ChainId: ", block.chainid);

        vm.startBroadcast(deployerKey);
        trustStakeCapEnforcer = new TrustStakeCapEnforcer();
        vm.stopBroadcast();
        console2.log("TrustStakeCapEnforcer deployed: ", address(trustStakeCapEnforcer));
    }
}
