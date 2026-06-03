// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";

import {IdentityRegistry} from "../src/erc8004/IdentityRegistry.sol";

/// @title  DeployIdentityRegistry
/// @notice Deploys the ARP-vendored ERC-8004 `IdentityRegistry` to the
///         configured RPC. The vendored source is a port of
///         ChaosChain/trustless-agents-erc-ri to OpenZeppelin v5 — see
///         ADR `0010-scope-reanchor-...` for the rationale (no canonical
///         deployment exists on Intuition Testnet).
/// @dev    Run with:
///         forge script script/DeployIdentityRegistry.s.sol \
///             --rpc-url $INTUITION_TESTNET_RPC_URL \
///             --private-key $PRIVATE_KEY --broadcast
///         Omit `--broadcast` for a dry-run simulation.
///
///         Pragma `^0.8.20` matches the vendored IdentityRegistry. The
///         repo's other deploy scripts (`DeployRegistry.s.sol` at ^0.8.24
///         and `DeployEnforcers.s.sol` at 0.8.23 strict) cover the other
///         pragma islands; `auto_detect_solc = true` in foundry.toml
///         resolves the multi-version graph at compile time.
contract DeployIdentityRegistry is Script {
    function run() external returns (IdentityRegistry registry) {
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
