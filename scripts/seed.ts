/**
 * Task 03 phase B — seed one ARP module + create its Intuition atom.
 *
 * Sequence (matches the architecture's off-chain Intuition coupling):
 *   1. Read deployments/13579.json for ModuleRegistry + MultiVault addresses.
 *   2. Pin a Thing via Intuition GraphQL (pinThing) to obtain an ipfs:// URI.
 *   3. Call ModuleRegistry.registerModule(name, domain, schemaURI, description)
 *      on Intuition Testnet — schemaURI is the URI from step 2.
 *   4. Call MultiVault.createAtoms([URI]) to mint the corresponding Intuition
 *      atom; atom data is stringToHex(URI), msg.value = atomCost.
 *   5. Write the resulting module id + atom id + tx hashes back into
 *      deployments/13579.json under arp.modules and arp.intuitionAtoms.
 *
 * Idempotent: re-running checks isTermCreated for the atom and the registry
 * for an existing same-domain entry. If the atom exists, reuses it. If the
 * module is already registered, skips and reports.
 *
 * Run from repo root:
 *   bun run scripts/seed.ts
 *
 * Required env (in .env at repo root):
 *   PRIVATE_KEY
 *   INTUITION_TESTNET_RPC_URL
 */

import {readFileSync, writeFileSync} from "node:fs";
import {join} from "node:path";

import {
    createPublicClient,
    createWalletClient,
    decodeEventLog,
    defineChain,
    http,
    parseAbi,
    stringToHex,
    type Address,
    type Hex,
} from "viem";
import {privateKeyToAccount} from "viem/accounts";

// ---------- Constants ----------

const REPO_ROOT = join(import.meta.dir, "..");
const DEPLOYMENTS_PATH = join(REPO_ROOT, "deployments", "13579.json");

const MODULE_NAME = "Solidity Audit";
const MODULE_DOMAIN = "solidity-audit";
const MODULE_DESCRIPTION =
    "Reputation domain for Solidity contract security attestations. " +
    "Attestations report critical/high/medium/low counts plus evidence URI per the v1 schema.";

const THING_NAME = "ARP Module — Solidity Audit";
const THING_DESCRIPTION =
    "Reputation domain for Solidity contract security attestations. " +
    "Part of the Agent Reputation Protocol (ARP). " +
    "Agents attest to a contract's security posture by reporting severity " +
    "counts and supporting evidence per the v1 attestation schema.";

// ---------- ABIs ----------

const moduleRegistryAbi = parseAbi([
    "function registerModule(string name, string domain, string schemaURI, string description) external returns (uint256 id)",
    "function getModulesByDomain(string domain) external view returns (uint256[])",
    "function getModule(uint256 id) external view returns ((uint256 id, string name, string domain, string schemaURI, string description, address creator, uint256 createdAt))",
    "event ModuleRegistered(uint256 indexed id, address indexed creator, string indexed domain, string name, string schemaURI)",
]);

const multiVaultAbi = parseAbi([
    "function getAtomCost() external view returns (uint256)",
    "function calculateAtomId(bytes atomData) external view returns (bytes32)",
    "function isTermCreated(bytes32 termId) external view returns (bool)",
    "function createAtoms(bytes[] atomDatas, uint256[] assets) external payable returns (bytes32[])",
    "event AtomCreated(address indexed creator, bytes32 indexed termId, bytes atomData)",
]);

// ---------- Helpers ----------

type Deployments = {
    chain: {chainId: number; rpcUrl: string; explorerUrl: string; graphqlUrl: string; nativeCurrency: {name: string; symbol: string; decimals: number}};
    intuition: {multiVault: Address};
    arp: {
        deployer: Address;
        moduleRegistry: Address;
        domainScopeEnforcer: Address;
        trustStakeCapEnforcer: Address;
        modules: Array<{
            id: string;
            name: string;
            domain: string;
            schemaURI: string;
            creator: Address;
            tx: Hex;
        }>;
        intuitionAtoms: Array<{
            atomId: Hex;
            uri: string;
            tx: Hex;
        }>;
        [k: string]: unknown;
    };
    [k: string]: unknown;
};

function loadDeployments(): Deployments {
    // Trusted: file is repo-controlled and is the canonical chain record we authored.
    return JSON.parse(readFileSync(DEPLOYMENTS_PATH, "utf-8")) as Deployments;
}

function saveDeployments(d: Deployments): void {
    writeFileSync(DEPLOYMENTS_PATH, JSON.stringify(d, null, 2) + "\n");
}

async function pinThing(graphqlUrl: string, args: {name: string; description: string; image: string; url: string}): Promise<string> {
    const mutation = `
        mutation pinThing($name: String!, $description: String!, $image: String!, $url: String!) {
            pinThing(thing: { name: $name, description: $description, image: $image, url: $url }) {
                uri
            }
        }
    `;
    const res = await fetch(graphqlUrl, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({query: mutation, variables: args}),
    });
    if (!res.ok) throw new Error(`pinThing HTTP ${res.status}: ${await res.text()}`);
    // GraphQL contract is fixed by the Intuition schema (skill reference/schemas.md);
    // shape is narrowed and validated below before access.
    const json = (await res.json()) as {data?: {pinThing: {uri: string}}; errors?: unknown};
    if (json.errors) throw new Error(`pinThing GraphQL: ${JSON.stringify(json.errors)}`);
    const uri = json.data?.pinThing.uri;
    if (!uri) throw new Error(`pinThing returned no uri: ${JSON.stringify(json)}`);
    return uri;
}

// ---------- Main ----------

async function main() {
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) throw new Error("PRIVATE_KEY env var required");
    // PRIVATE_KEY is validated by privateKeyToAccount (throws on bad format);
    // the cast is only to satisfy the `0x${string}` template-literal type.
    const account = privateKeyToAccount(privateKey as Hex);

    const deployments = loadDeployments();
    const moduleRegistry = deployments.arp.moduleRegistry;
    const multiVault = deployments.intuition.multiVault;
    const rpcUrl = process.env.INTUITION_TESTNET_RPC_URL ?? deployments.chain.rpcUrl;
    const graphqlUrl = deployments.chain.graphqlUrl;

    const intuitionTestnet = defineChain({
        id: deployments.chain.chainId,
        name: "Intuition Testnet",
        nativeCurrency: deployments.chain.nativeCurrency,
        rpcUrls: {default: {http: [rpcUrl]}},
    });

    const publicClient = createPublicClient({chain: intuitionTestnet, transport: http(rpcUrl)});
    const walletClient = createWalletClient({account, chain: intuitionTestnet, transport: http(rpcUrl)});

    console.log("Deployer:        ", account.address);
    console.log("ModuleRegistry:  ", moduleRegistry);
    console.log("Intuition vault: ", multiVault);

    // -------- 1. Pin the Thing via Intuition GraphQL --------

    console.log("\n[1/3] Pinning Thing on Intuition…");
    const uri = await pinThing(graphqlUrl, {
        name: THING_NAME,
        description: THING_DESCRIPTION,
        image: "",
        url: "",
    });
    console.log("  uri:           ", uri);

    // -------- 2. Register the module on-chain --------

    console.log("\n[2/3] Registering module on ModuleRegistry…");
    const existing = await publicClient.readContract({
        address: moduleRegistry,
        abi: moduleRegistryAbi,
        functionName: "getModulesByDomain",
        args: [MODULE_DOMAIN],
    });
    let moduleId: bigint;
    let moduleTx: Hex;
    if (existing.length > 0) {
        moduleId = existing[0];
        const mod = await publicClient.readContract({
            address: moduleRegistry,
            abi: moduleRegistryAbi,
            functionName: "getModule",
            args: [moduleId],
        });
        // Fallback "0x0" is a known-sentinel Hex literal; tx field is typed as Hex.
        moduleTx = (deployments.arp.modules.find((m) => m.id === moduleId.toString())?.tx ?? "0x0") as Hex;
        console.log(`  domain '${MODULE_DOMAIN}' already has id ${moduleId} (creator ${mod.creator}); skipping registration`);
    } else {
        const {request, result} = await publicClient.simulateContract({
            account,
            address: moduleRegistry,
            abi: moduleRegistryAbi,
            functionName: "registerModule",
            args: [MODULE_NAME, MODULE_DOMAIN, uri, MODULE_DESCRIPTION],
        });
        moduleId = result;
        moduleTx = await walletClient.writeContract(request);
        const receipt = await publicClient.waitForTransactionReceipt({hash: moduleTx});
        console.log(`  tx:            ${moduleTx} (block ${receipt.blockNumber})`);
        console.log(`  id:            ${moduleId}`);
    }

    // -------- 3. Create the Intuition atom --------

    console.log("\n[3/3] Creating Intuition atom for the module…");
    const atomData = stringToHex(uri);
    const atomCost = await publicClient.readContract({
        address: multiVault,
        abi: multiVaultAbi,
        functionName: "getAtomCost",
    });
    const computedAtomId = await publicClient.readContract({
        address: multiVault,
        abi: multiVaultAbi,
        functionName: "calculateAtomId",
        args: [atomData],
    });
    const exists = await publicClient.readContract({
        address: multiVault,
        abi: multiVaultAbi,
        functionName: "isTermCreated",
        args: [computedAtomId],
    });

    let atomTx: Hex;
    if (exists) {
        // Same sentinel-Hex pattern as moduleTx fallback above.
        atomTx = (deployments.arp.intuitionAtoms.find((a) => a.atomId === computedAtomId)?.tx ?? "0x0") as Hex;
        console.log(`  atom already exists (id ${computedAtomId}); skipping createAtoms`);
    } else {
        const {request} = await publicClient.simulateContract({
            account,
            address: multiVault,
            abi: multiVaultAbi,
            functionName: "createAtoms",
            args: [[atomData], [atomCost]],
            value: atomCost,
        });
        atomTx = await walletClient.writeContract(request);
        const receipt = await publicClient.waitForTransactionReceipt({hash: atomTx});
        console.log(`  tx:            ${atomTx} (block ${receipt.blockNumber})`);
        console.log(`  atom cost:     ${atomCost} wei (${Number(atomCost) / 1e18} tTRUST)`);
        console.log(`  atom id:       ${computedAtomId}`);
    }

    // -------- 4. Persist to deployments/13579.json --------

    const moduleRecord = {
        id: moduleId.toString(),
        name: MODULE_NAME,
        domain: MODULE_DOMAIN,
        schemaURI: uri,
        // account.address is typed as `0x${string}`; narrowing to viem's Address alias is structural.
        creator: account.address as Address,
        tx: moduleTx,
    };
    const atomRecord = {
        atomId: computedAtomId,
        uri,
        tx: atomTx,
    };

    if (!deployments.arp.modules.some((m) => m.id === moduleRecord.id)) {
        deployments.arp.modules.push(moduleRecord);
    }
    if (!deployments.arp.intuitionAtoms.some((a) => a.atomId === atomRecord.atomId)) {
        deployments.arp.intuitionAtoms.push(atomRecord);
    }
    saveDeployments(deployments);
    console.log("\nDeployments updated:", DEPLOYMENTS_PATH);
}

main().catch((err) => {
    console.error("\nSeeding failed:", err);
    process.exit(1);
});
