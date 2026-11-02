// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Test} from "forge-std/Test.sol";

import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IdentityRegistry} from "../../src/erc8004/IdentityRegistry.sol";
import {IIdentityRegistry} from "../../src/erc8004/interfaces/IIdentityRegistry.sol";

/// @dev An ERC-1271 wallet that accepts exactly one digest.
contract Wallet1271 {
    bytes32 public accepted;

    function accept(bytes32 digest) external {
        accepted = digest;
    }

    function isValidSignature(bytes32 digest, bytes calldata) external view returns (bytes4) {
        return digest == accepted ? bytes4(0x1626ba7e) : bytes4(0xffffffff);
    }
}

/// @dev Re-enters `register()` from the safe-mint callback.
contract ReentrantReceiver is IERC721Receiver {
    IdentityRegistry internal immutable REGISTRY;

    constructor(IdentityRegistry registry) {
        REGISTRY = registry;
    }

    function go() external {
        REGISTRY.register();
    }

    function onERC721Received(address, address, uint256, bytes calldata) external returns (bytes4) {
        REGISTRY.register();
        return IERC721Receiver.onERC721Received.selector;
    }
}

/// @notice ARP's testnet deployment of the ERC-8004 reference registry. These tests pin its
///         behaviour as shipped, including the two deviations recorded in `SECURITY_REVIEW.md`:
///         `setAgentWallet` carries no nonce, and the contract reverts with strings.
contract IdentityRegistryTest is Test {
    IdentityRegistry internal registry;

    address internal owner = makeAddr("owner");
    address internal stranger = makeAddr("stranger");
    address internal operator = makeAddr("operator");
    address internal buyer = makeAddr("buyer");
    address internal wallet;
    uint256 internal walletKey;

    bytes32 internal constant TYPE_HASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 internal constant SET_AGENT_WALLET_TYPEHASH =
        keccak256("SetAgentWallet(uint256 agentId,address newWallet,uint256 deadline)");

    event Registered(uint256 indexed agentId, string agentURI, address indexed owner);
    event MetadataSet(
        uint256 indexed agentId, string indexed indexedMetadataKey, string metadataKey, bytes metadataValue
    );
    event URIUpdated(uint256 indexed agentId, string newURI, address indexed updatedBy);
    event AgentWalletSet(uint256 indexed agentId, address indexed newWallet, address indexed setBy);

    function setUp() public {
        registry = new IdentityRegistry();
        (wallet, walletKey) = makeAddrAndKey("wallet");
        vm.warp(1_700_000_000);
    }

    /*//////////////////////////////////////////////////////////////
                               REGISTER
    //////////////////////////////////////////////////////////////*/

    function test_register_bare_startsAtOneAndHasNoURI() public {
        vm.prank(owner);
        uint256 id = registry.register();
        assertEq(id, 1);
        assertEq(registry.ownerOf(1), owner);
        assertEq(registry.tokenURI(1), "");
        assertEq(registry.totalAgents(), 1);
        assertTrue(registry.agentExists(1));
        assertFalse(registry.agentExists(2));
    }

    function test_register_withURI_setsURIAndWalletAndEmits() public {
        vm.expectEmit(true, true, false, true, address(registry));
        emit Registered(1, "ipfs://a", owner);
        vm.prank(owner);
        uint256 id = registry.register("ipfs://a");
        assertEq(registry.tokenURI(id), "ipfs://a");
        assertEq(registry.getAgentWallet(id), owner);
    }

    function test_register_withMetadata_storesEachEntry() public {
        IIdentityRegistry.MetadataEntry[] memory entries = new IIdentityRegistry.MetadataEntry[](2);
        entries[0] = IIdentityRegistry.MetadataEntry("name", bytes("rig"));
        entries[1] = IIdentityRegistry.MetadataEntry("kind", hex"01");
        vm.expectEmit(true, true, false, true, address(registry));
        emit MetadataSet(1, "name", "name", bytes("rig"));
        vm.prank(owner);
        uint256 id = registry.register("ipfs://a", entries);
        assertEq(registry.getMetadata(id, "name"), bytes("rig"));
        assertEq(registry.getMetadata(id, "kind"), hex"01");
    }

    function test_register_withEmptyMetadataArray() public {
        IIdentityRegistry.MetadataEntry[] memory none = new IIdentityRegistry.MetadataEntry[](0);
        vm.prank(owner);
        uint256 id = registry.register("ipfs://a", none);
        assertEq(registry.getMetadata(id, "name"), "");
    }

    function test_register_metadata_revertsOnEmptyKey() public {
        IIdentityRegistry.MetadataEntry[] memory entries = new IIdentityRegistry.MetadataEntry[](1);
        entries[0] = IIdentityRegistry.MetadataEntry("", hex"01");
        vm.expectRevert(bytes("Empty key"));
        vm.prank(owner);
        registry.register("ipfs://a", entries);
    }

    function test_register_metadata_revertsOnAgentWalletKey() public {
        IIdentityRegistry.MetadataEntry[] memory entries = new IIdentityRegistry.MetadataEntry[](1);
        entries[0] = IIdentityRegistry.MetadataEntry("agentWallet", abi.encode(stranger));
        vm.expectRevert(bytes("Cannot set agentWallet via metadata"));
        vm.prank(owner);
        registry.register("ipfs://a", entries);
    }

    function test_register_idsAreSequential() public {
        vm.startPrank(owner);
        assertEq(registry.register(), 1);
        assertEq(registry.register("x"), 2);
        assertEq(registry.register(), 3);
        vm.stopPrank();
        assertEq(registry.totalAgents(), 3);
    }

    function test_register_reentryFromReceiverReverts() public {
        ReentrantReceiver receiver = new ReentrantReceiver(registry);
        vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        receiver.go();
    }

    /*//////////////////////////////////////////////////////////////
                               METADATA
    //////////////////////////////////////////////////////////////*/

    function test_setMetadata_byOwner() public {
        uint256 id = _mint(owner);
        vm.expectEmit(true, true, false, true, address(registry));
        emit MetadataSet(id, "k", "k", hex"aa");
        vm.prank(owner);
        registry.setMetadata(id, "k", hex"aa");
        assertEq(registry.getMetadata(id, "k"), hex"aa");
    }

    function test_setMetadata_byApprovedOperator() public {
        uint256 id = _mint(owner);
        vm.prank(owner);
        registry.setApprovalForAll(operator, true);
        vm.prank(operator);
        registry.setMetadata(id, "k", hex"bb");
        assertEq(registry.getMetadata(id, "k"), hex"bb");
    }

    function test_setMetadata_revertsForStranger() public {
        uint256 id = _mint(owner);
        vm.expectRevert(bytes("Not authorized"));
        vm.prank(stranger);
        registry.setMetadata(id, "k", hex"aa");
    }

    function test_setMetadata_revertsForMissingAgent() public {
        vm.expectRevert(bytes("Not authorized"));
        vm.prank(owner);
        registry.setMetadata(99, "k", hex"aa");
    }

    function test_setMetadata_revertsOnEmptyKey() public {
        uint256 id = _mint(owner);
        vm.expectRevert(bytes("Empty key"));
        vm.prank(owner);
        registry.setMetadata(id, "", hex"aa");
    }

    function test_setMetadata_revertsOnAgentWalletKey() public {
        uint256 id = _mint(owner);
        vm.expectRevert(bytes("Cannot set agentWallet via setMetadata"));
        vm.prank(owner);
        registry.setMetadata(id, "agentWallet", abi.encode(stranger));
    }

    function test_getMetadata_agentWalletKeyReturnsEncodedWallet() public {
        uint256 id = _mint(owner);
        assertEq(registry.getMetadata(id, "agentWallet"), abi.encode(owner));
    }

    function test_getMetadata_revertsForMissingAgent() public {
        vm.expectRevert(bytes("Agent does not exist"));
        registry.getMetadata(1, "k");
    }

    /*//////////////////////////////////////////////////////////////
                                  URI
    //////////////////////////////////////////////////////////////*/

    function test_setAgentURI_byOwner() public {
        uint256 id = _mint(owner);
        vm.expectEmit(true, true, false, true, address(registry));
        emit URIUpdated(id, "ipfs://b", owner);
        vm.prank(owner);
        registry.setAgentURI(id, "ipfs://b");
        assertEq(registry.tokenURI(id), "ipfs://b");
    }

    function test_setAgentURI_byApprovedAddress() public {
        uint256 id = _mint(owner);
        vm.prank(owner);
        registry.approve(operator, id);
        vm.prank(operator);
        registry.setAgentURI(id, "ipfs://c");
        assertEq(registry.tokenURI(id), "ipfs://c");
    }

    function test_setAgentURI_revertsForStranger() public {
        uint256 id = _mint(owner);
        vm.expectRevert(bytes("Not authorized"));
        vm.prank(stranger);
        registry.setAgentURI(id, "ipfs://b");
    }

    function test_setAgentURI_revertsOnEmpty() public {
        uint256 id = _mint(owner);
        vm.expectRevert(bytes("Empty URI"));
        vm.prank(owner);
        registry.setAgentURI(id, "");
    }

    /*//////////////////////////////////////////////////////////////
                             AGENT WALLET
    //////////////////////////////////////////////////////////////*/

    function test_setAgentWallet_validEOASignature() public {
        uint256 id = _mint(owner);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signWallet(walletKey, id, wallet, deadline);
        vm.expectEmit(true, true, true, false, address(registry));
        emit AgentWalletSet(id, wallet, owner);
        vm.prank(owner);
        registry.setAgentWallet(id, wallet, deadline, sig);
        assertEq(registry.getAgentWallet(id), wallet);
        assertEq(registry.getMetadata(id, "agentWallet"), abi.encode(wallet));
    }

    function test_setAgentWallet_acceptsAtExactlyDeadline() public {
        uint256 id = _mint(owner);
        uint256 deadline = block.timestamp;
        bytes memory sig = _signWallet(walletKey, id, wallet, deadline);
        vm.prank(owner);
        registry.setAgentWallet(id, wallet, deadline, sig);
        assertEq(registry.getAgentWallet(id), wallet);
    }

    function test_setAgentWallet_revertsWhenExpired() public {
        uint256 id = _mint(owner);
        uint256 deadline = block.timestamp - 1;
        bytes memory sig = _signWallet(walletKey, id, wallet, deadline);
        vm.expectRevert(bytes("Signature expired"));
        vm.prank(owner);
        registry.setAgentWallet(id, wallet, deadline, sig);
    }

    function test_setAgentWallet_revertsOnWrongSigner() public {
        uint256 id = _mint(owner);
        (, uint256 otherKey) = makeAddrAndKey("other");
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signWallet(otherKey, id, wallet, deadline);
        vm.expectRevert(bytes("Invalid signature"));
        vm.prank(owner);
        registry.setAgentWallet(id, wallet, deadline, sig);
    }

    function test_setAgentWallet_revertsOnMalformedSignature() public {
        uint256 id = _mint(owner);
        vm.expectRevert(bytes("Invalid signature"));
        vm.prank(owner);
        registry.setAgentWallet(id, wallet, block.timestamp + 1, hex"1234");
    }

    function test_setAgentWallet_revertsOnSignatureForAnotherAgent() public {
        uint256 id = _mint(owner);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signWallet(walletKey, id + 1, wallet, deadline);
        vm.expectRevert(bytes("Invalid signature"));
        vm.prank(owner);
        registry.setAgentWallet(id, wallet, deadline, sig);
    }

    function test_setAgentWallet_revertsForStranger() public {
        uint256 id = _mint(owner);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signWallet(walletKey, id, wallet, deadline);
        vm.expectRevert(bytes("Not authorized"));
        vm.prank(stranger);
        registry.setAgentWallet(id, wallet, deadline, sig);
    }

    function test_setAgentWallet_revertsOnZeroWallet() public {
        uint256 id = _mint(owner);
        vm.expectRevert(bytes("Invalid wallet address"));
        vm.prank(owner);
        registry.setAgentWallet(id, address(0), block.timestamp + 1, "");
    }

    function test_setAgentWallet_erc1271Wallet() public {
        uint256 id = _mint(owner);
        Wallet1271 contractWallet = new Wallet1271();
        uint256 deadline = block.timestamp + 1 hours;
        contractWallet.accept(_digest(id, address(contractWallet), deadline));
        vm.prank(owner);
        registry.setAgentWallet(id, address(contractWallet), deadline, hex"00");
        assertEq(registry.getAgentWallet(id), address(contractWallet));
    }

    function test_setAgentWallet_erc1271WalletRefuses() public {
        uint256 id = _mint(owner);
        Wallet1271 contractWallet = new Wallet1271();
        vm.expectRevert(bytes("Invalid signature"));
        vm.prank(owner);
        registry.setAgentWallet(id, address(contractWallet), block.timestamp + 1 hours, hex"00");
    }

    /// The accepted deviation: the signed struct has no nonce, so one signature can be replayed
    /// by the agent's owner until its deadline — here, to restore a wallet after `unsetAgentWallet`.
    function test_setAgentWallet_signatureReplaysUntilDeadline() public {
        uint256 id = _mint(owner);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signWallet(walletKey, id, wallet, deadline);
        vm.startPrank(owner);
        registry.setAgentWallet(id, wallet, deadline, sig);
        registry.unsetAgentWallet(id);
        registry.setAgentWallet(id, wallet, deadline, sig);
        vm.stopPrank();
        assertEq(registry.getAgentWallet(id), wallet);
    }

    function test_domainSeparator_isFixedAtDeployment() public {
        uint256 id = _mint(owner);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signWallet(walletKey, id, wallet, deadline);
        vm.chainId(1);
        // The separator is immutable, fixed at deployment: a later chain id does not change it.
        vm.prank(owner);
        registry.setAgentWallet(id, wallet, deadline, sig);
        assertEq(registry.getAgentWallet(id), wallet);
    }

    function test_unsetAgentWallet_clearsAndEmits() public {
        uint256 id = _mint(owner);
        vm.expectEmit(true, true, true, false, address(registry));
        emit AgentWalletSet(id, address(0), owner);
        vm.prank(owner);
        registry.unsetAgentWallet(id);
        assertEq(registry.getAgentWallet(id), address(0));
    }

    function test_unsetAgentWallet_revertsForStranger() public {
        uint256 id = _mint(owner);
        vm.expectRevert(bytes("Not authorized"));
        vm.prank(stranger);
        registry.unsetAgentWallet(id);
    }

    function test_getAgentWallet_revertsForMissingAgent() public {
        vm.expectRevert(bytes("Agent does not exist"));
        registry.getAgentWallet(1);
    }

    /*//////////////////////////////////////////////////////////////
                               TRANSFER
    //////////////////////////////////////////////////////////////*/

    function test_transfer_resetsAgentWallet() public {
        uint256 id = _mint(owner);
        assertEq(registry.getAgentWallet(id), owner);
        vm.prank(owner);
        registry.transferFrom(owner, buyer, id);
        assertEq(registry.ownerOf(id), buyer);
        assertEq(registry.getAgentWallet(id), address(0));
    }

    function test_transfer_resetsAVerifiedWallet() public {
        uint256 id = _mint(owner);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signWallet(walletKey, id, wallet, deadline);
        vm.startPrank(owner);
        registry.setAgentWallet(id, wallet, deadline, sig);
        registry.safeTransferFrom(owner, buyer, id);
        vm.stopPrank();
        assertEq(registry.getAgentWallet(id), address(0));
        // The previous owner lost control with the token.
        vm.expectRevert(bytes("Not authorized"));
        vm.prank(owner);
        registry.setAgentURI(id, "ipfs://x");
    }

    function test_transfer_metadataAndURISurvive() public {
        uint256 id = _mint(owner);
        vm.startPrank(owner);
        registry.setMetadata(id, "k", hex"aa");
        registry.transferFrom(owner, buyer, id);
        vm.stopPrank();
        assertEq(registry.getMetadata(id, "k"), hex"aa");
        assertEq(registry.tokenURI(id), "ipfs://a");
    }

    /*//////////////////////////////////////////////////////////////
                                 FUZZ
    //////////////////////////////////////////////////////////////*/

    function testFuzz_setAgentURI_anyNonEmpty(string calldata uri) public {
        vm.assume(bytes(uri).length > 0);
        uint256 id = _mint(owner);
        vm.prank(owner);
        registry.setAgentURI(id, uri);
        assertEq(registry.tokenURI(id), uri);
    }

    function testFuzz_setAgentWallet_onlyTheNamedWalletsKey(uint256 key) public {
        key = bound(key, 1, 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364140);
        vm.assume(key != walletKey);
        uint256 id = _mint(owner);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signWallet(key, id, wallet, deadline);
        vm.expectRevert(bytes("Invalid signature"));
        vm.prank(owner);
        registry.setAgentWallet(id, wallet, deadline, sig);
    }

    /*//////////////////////////////////////////////////////////////
                                HELPERS
    //////////////////////////////////////////////////////////////*/

    function _mint(address to) internal returns (uint256 id) {
        vm.prank(to);
        id = registry.register("ipfs://a");
    }

    function _digest(uint256 agentId, address newWallet, uint256 deadline) internal view returns (bytes32) {
        bytes32 domain = keccak256(
            abi.encode(
                TYPE_HASH,
                keccak256(bytes("ERC-8004 IdentityRegistry")),
                keccak256(bytes("1.1")),
                block.chainid,
                address(registry)
            )
        );
        bytes32 structHash = keccak256(abi.encode(SET_AGENT_WALLET_TYPEHASH, agentId, newWallet, deadline));
        return keccak256(abi.encodePacked("\x19\x01", domain, structHash));
    }

    function _signWallet(uint256 key, uint256 agentId, address newWallet, uint256 deadline)
        internal
        view
        returns (bytes memory)
    {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, _digest(agentId, newWallet, deadline));
        return abi.encodePacked(r, s, v);
    }
}
