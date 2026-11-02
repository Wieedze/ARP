// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Script, console2} from "forge-std/Script.sol";

import {TrustStakeCapEnforcer} from "../src/enforcers/TrustStakeCapEnforcer.sol";

/// @title  DeployEnforcers
/// @notice Deploys ARP's one deployed caveat enforcer, `TrustStakeCapEnforcer`.
/// @dev    Run it through `scripts/deploy/deploy.sh`, which checks the chain, skips a deploy whose
///         recorded address already has code, and writes the result to
///         `data/deployments/<chainId>.json`. Directly:
///         forge script script/DeployEnforcers.s.sol --rpc-url <rpc> --private-key $PRIVATE_KEY
///         and add `--broadcast` to send.
///
///         Testnet 13579 only, unless `ARP_MAINNET_CONFIRMED=true` is set — which `deploy.sh` does
///         for 1155 only under `--mainnet-i-confirmed`, the user's per-session confirmation
///         (`CLAUDE.md`). Every other chain is refused.
///
///         `DomainScopeEnforcer` used to be deployed here and was removed with `ModuleRegistry` in
///         `59ac83a` (ADR `0055`). `ReceiptEnforcer` is not deployed (task 43). One enforcer is left
///         because a cumulative cap over a fixed period is what MetaMask's stock `valueLte` does
///         not give: that bounds one redemption, not a budget.
contract DeployEnforcers is Script {
    /// @notice The chain is neither testnet 13579 nor a confirmed mainnet 1155.
    error WrongChain(uint256 chainId);

    uint256 internal constant TESTNET = 13_579;
    uint256 internal constant MAINNET = 1155;

    /// @notice Deploy `TrustStakeCapEnforcer` from `PRIVATE_KEY`.
    /// @return trustStakeCapEnforcer The new deployment.
    function run() external returns (TrustStakeCapEnforcer trustStakeCapEnforcer) {
        bool mainnetConfirmed = vm.envOr("ARP_MAINNET_CONFIRMED", false);
        if (block.chainid != TESTNET && !(block.chainid == MAINNET && mainnetConfirmed)) {
            revert WrongChain(block.chainid);
        }

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
