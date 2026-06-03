import {useQuery} from "@tanstack/react-query";
import {useMemo} from "react";
import {parseAbiItem, stringToHex, type Address, type Hex} from "viem";
import {useReadContract, useReadContracts} from "wagmi";

import {multiVaultAbi} from "../lib/abi/multi-vault";
import {publicClient} from "../lib/clients";
import {deployments} from "../lib/deployments";
import {type Module} from "../lib/abi/module-registry";

const MULTI_VAULT = deployments.intuition.multiVault;

const DEPOSITED_EVENT = parseAbiItem(
    "event Deposited(address indexed sender, address indexed receiver, bytes32 indexed termId, uint256 curveId, uint256 assets, uint256 assetsAfterFees, uint256 shares, uint256 totalShares, uint8 vaultType)",
);

/**
 * Aggregated reputation metrics per module.
 *
 *   - `atomId`         The bytes32 id of the tool atom (from `calculateAtomId`).
 *   - `totalAssets`    Cumulative tTRUST staked on the atom (wei). Sums every
 *                      deposit by every staker — operators + agents + 3rd
 *                      parties — into the same vault.
 *   - `stakerCount`    Number of **distinct receivers** that have ever opened
 *                      a position on this atom (from `Deposited` event scan,
 *                      filtered by `termId`). Reflects "how many independent
 *                      agents back this tool" — the marketplace's social
 *                      signal, complementary to the TVL economic signal.
 *
 * `null` for an entry means the on-chain read for that index failed (the
 * RPC dropped it, or the atom hasn't been created yet). Callers should
 * filter or display "—".
 */
export type VaultMetric = {
    atomId: Hex;
    totalAssets: bigint;
    stakerCount: number;
} | null;

/**
 * Read vault state for every module in `modules`, in two batched
 * round-trips:
 *
 *   1. `calculateAtomId(stringToHex(schemaURI))` for each module — gives
 *      the tool atom id.
 *   2. `getVault(atomId, defaultCurveId)` for each atom — gives the
 *      cumulative TVL and shares.
 *
 * Both rounds use `useReadContracts` so the RPC sees a single multicall
 * each. The bonding curve config is read once and reused.
 *
 * Returns an array indexed by `modules` position (same length as input).
 * `isLoading` is true until both rounds resolve. `refetch` re-runs both.
 */
export function useVaultMetrics(modules: Module[]) {
    // --- 1. bonding curve config (single read, cached) ---
    const curveConfig = useReadContract({
        address: MULTI_VAULT,
        abi: multiVaultAbi,
        functionName: "getBondingCurveConfig",
    });

    // --- 2. atom IDs for every module (single multicall) ---
    const atomIds = useReadContracts({
        contracts: modules.map((m) => ({
            address: MULTI_VAULT,
            abi: multiVaultAbi,
            functionName: "calculateAtomId" as const,
            args: [stringToHex(m.schemaURI)] as const,
        })),
        query: {enabled: modules.length > 0},
    });

    const computedAtomIds = useMemo<(Hex | null)[]>(() => {
        if (!atomIds.data) return modules.map(() => null);
        return atomIds.data.map((entry) =>
            entry.status === "success" ? (entry.result as Hex) : null,
        );
    }, [atomIds.data, modules]);

    // --- 3. vault state for each atom (single multicall) ---
    const curveId = curveConfig.data?.defaultCurveId;
    const vaults = useReadContracts({
        contracts:
            curveId !== undefined
                ? computedAtomIds.map((atomId) => ({
                      address: MULTI_VAULT,
                      abi: multiVaultAbi,
                      functionName: "getVault" as const,
                      args: [atomId ?? (`0x${"00".repeat(32)}` as Hex), curveId] as const,
                  }))
                : [],
        query: {
            enabled:
                computedAtomIds.length > 0 &&
                curveId !== undefined &&
                computedAtomIds.some((a) => a !== null),
            // 15s — long enough that mass refresh doesn't hammer RPC, short
            // enough that watching a live agent loop is satisfying.
            refetchInterval: 15_000,
        },
    });

    // --- 4. distinct stakers per atom (one getLogs over Deposited events) ---
    //
    // `Deposited` indexes both `receiver` and `termId`, so the RPC node can
    // serve the whole history in one shot. We scan once for ALL atoms (no
    // termId filter) and bucket client-side — N modules cost one call, not
    // N. For a hackathon-scale chain (~10s of atoms, ~100s of events) the
    // payload is small.
    //
    // `receiver` is the position-holder per ADR (delegated stakes assign
    // shares to the runtime EOA), so dedup is on that field.
    const stakers = useQuery({
        queryKey: ["multiVault.depositedStakers"],
        queryFn: async () => {
            const logs = await publicClient.getLogs({
                address: MULTI_VAULT,
                event: DEPOSITED_EVENT,
                fromBlock: 0n,
                toBlock: "latest",
            });
            const byAtom = new Map<Hex, Set<Address>>();
            for (const log of logs) {
                const term = log.args.termId;
                const receiver = log.args.receiver;
                if (term === undefined || receiver === undefined) continue;
                let set = byAtom.get(term);
                if (!set) {
                    set = new Set<Address>();
                    byAtom.set(term, set);
                }
                set.add(receiver);
            }
            return byAtom;
        },
        staleTime: 15_000,
        refetchInterval: 15_000,
    });

    const metrics = useMemo<VaultMetric[]>(() => {
        if (!vaults.data || curveId === undefined)
            return computedAtomIds.map(() => null);
        const stakerMap = stakers.data;
        return computedAtomIds.map((atomId, i) => {
            if (atomId === null) return null;
            const entry = vaults.data[i];
            if (entry.status !== "success") return null;
            const [totalAssets] = entry.result as readonly [bigint, bigint];
            const stakerCount = stakerMap?.get(atomId)?.size ?? 0;
            return {atomId, totalAssets, stakerCount};
        });
    }, [vaults.data, computedAtomIds, curveId, stakers.data]);

    return {
        metrics,
        isLoading:
            curveConfig.isLoading ||
            atomIds.isLoading ||
            vaults.isLoading ||
            stakers.isLoading,
        error: curveConfig.error ?? atomIds.error ?? vaults.error ?? stakers.error,
        refetch: () => {
            curveConfig.refetch();
            atomIds.refetch();
            vaults.refetch();
            stakers.refetch();
        },
    };
}
