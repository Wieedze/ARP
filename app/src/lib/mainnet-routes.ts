/**
 * Which routes read or write **Intuition mainnet 1155**, in one place.
 *
 * `Layout` shows a testnet strip and a faucet link on every other route. Getting this list wrong is,
 * in `Layout`'s own words, the single most expensive sentence in the app: "no real value at stake"
 * above a page that spends real TRUST. ADR `0017`'s Consequences section names the two-network
 * ambiguity as the sharpest failure mode this app has.
 *
 * **It went wrong twice in one day**, both times because the list was hand-maintained inside
 * `Layout` and a new route did not reach it: `/` the moment it became the tool catalogue, and
 * `/register` the moment it was added — a page that sends a real `createAtoms`. Each showed the
 * testnet strip and a "Get tTRUST" link above `MainnetNotice` saying the opposite. `claims.md`
 * check 5: fix the predicate, not the route you happened to notice.
 *
 * So the list lives here, beside a test that locks it, and the rule is one line: **a route that
 * renders `MainnetNotice` belongs in it.**
 */
export const MAINNET_ROUTES: readonly string[] = [
    "/", // the tool catalogue
    "/agents",
    "/tools",
    "/register",
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
