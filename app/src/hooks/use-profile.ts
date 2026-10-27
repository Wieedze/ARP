import {useQuery} from "@tanstack/react-query";

import {
    buildProfileView,
    intuitionProfileReader,
    type ProfileReader,
    type ProfileView,
} from "../services/account-profile";
import {useChainChoice} from "../lib/chain-choice";

/**
 * One account's own page.
 *
 * Keyed on the **connected address** and on the **chain**, so neither switching wallets nor
 * switching chains serves the other's figures from cache — the one cache mistake a page about
 * "your" money must not make.
 */
export function profileQueryKey(chainId: number, account: string | undefined, curveId: number) {
    return ["intuition", chainId, "profile", account ?? "none", curveId] as const;
}

export function profileQueryOptions(
    chain: {chainId: number; graphqlUrl: string},
    account: string | undefined,
    curveId: number,
    reader: ProfileReader = intuitionProfileReader(chain.graphqlUrl),
) {
    return {
        queryKey: profileQueryKey(chain.chainId, account, curveId),
        queryFn: async (): Promise<ProfileView> => {
            if (account === undefined) throw new Error("no account connected");
            return buildProfileView({account, curveId, reader});
        },
        enabled: account !== undefined,
        // Your own deposits are the one figure you expect to move when you act, so this is shorter
        // than the catalogue's two minutes.
        staleTime: 15_000,
        retry: 1,
    };
}

export function useProfile(account: string | undefined, curveId: number) {
    const chain = useChainChoice();
    return useQuery(profileQueryOptions(chain, account, curveId));
}
