/**
 * Which routes read or write **Intuition mainnet 1155**, in one place.
 *
 * **Its reason for existing is gone and it is kept for one small job.** It used to drive the
 * shell's testnet strip, and getting it wrong printed "no real value at stake" above a page that
 * spends real TRUST — which happened twice in one day, for `/` and for `/register`. ADR `0058`
 * removed both network banners at the user's request, so the only consumer left is the footer's
 * network label. Being wrong there is cosmetic.
 *
 * The test that kept it honest went with the banner: it derived the answer from `MainnetNotice` in
 * a page's source, and that component no longer exists. So **this list is hand-maintained again**,
 * and nothing checks it. That is acceptable for a footer label and would not be for a warning —
 * if anything safety-bearing ever reads it again, the check has to come back with it.
 *
 * The warning that matters now lives where a wallet is about to open: `StakeControl` and
 * `WithdrawControl` both name the network and the real TRUST in their confirmation step, which is
 * where ADR `0029` said it belonged.
 */
export const MAINNET_ROUTES: readonly string[] = [
    "/", // the tool catalogue
    "/agents",
    "/tools",
    "/register",
    "/profile",
    // `/me` only redirects to `/profile`, but it is in the list anyway: the redirect renders for a
    // frame, and a frame of "no real value at stake" above a mainnet page is the sentence this
    // file exists to prevent.
    "/me",
];

/** Route prefixes whose children are all mainnet. */
export const MAINNET_ROUTE_PREFIXES: readonly string[] = [
    "/agent/", // the trust panel and the import flow
    "/tool/atom/",
];

export function readsMainnet(pathname: string): boolean {
    return (
        MAINNET_ROUTES.includes(pathname) ||
        MAINNET_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix))
    );
}
