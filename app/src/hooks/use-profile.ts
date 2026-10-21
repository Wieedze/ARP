import {useQuery} from "@tanstack/react-query";

import {
    buildProfileView,
    intuitionProfileReader,
    type ProfileReader,
    type ProfileView,
} from "../services/account-profile";
import {ERC8004_GRAPHQL_URL} from "../services/erc8004-connector";

/**
 * One account's own page.
 *
 * Reads Intuition mainnet, like every other market surface here. It is keyed on the **connected
 * address**, so switching wallets re-keys the query rather than serving another account's figures
 * from cache — which is the one cache mistake a page about "your" money must not make.
 */
export function profileQueryKey(account: string | undefined, curveId: number) {
    return ["intuition", "profile", account ?? "none", curveId] as const;
}

export function profileQueryOptions(
    account: string | undefined,
    curveId: number,
    reader: ProfileReader = intuitionProfileReader(ERC8004_GRAPHQL_URL),
) {
    return {
        queryKey: profileQueryKey(account, curveId),
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
    return useQuery(profileQueryOptions(account, curveId));
}
