import {useQuery} from "@tanstack/react-query";

import {deployments} from "../lib/deployments";
import {loadPulse, type PulseView} from "../services/pulse";

export type PulseRead = {status: "pending"} | {status: "failed"} | {status: "ok"; view: PulseView};

/** Testnet 13579, like the rest of ARP's own reads (`rules/portability.md`). Cached: GitHub allows 60 an hour. */
export function usePulse(source: string, skill: string): PulseRead {
    const query = useQuery({
        queryKey: ["pulse", source, skill],
        queryFn: () =>
            loadPulse(source, skill, {
                chainId: deployments.chain.chainId,
                multiVault: deployments.intuition.multiVault,
                rpcUrl: deployments.chain.rpcUrl,
                graphqlUrl: deployments.chain.graphqlUrl,
                inContextOf: deployments.arp.endpointBinding.inContextOf,
                linePayers: [deployments.arp.deployer],
            }),
        staleTime: 15 * 60 * 1000,
        retry: 1,
    });
    if (query.data !== undefined) return {status: "ok", view: query.data};
    return query.isError ? {status: "failed"} : {status: "pending"};
}
