import {readFileSync, readdirSync} from "node:fs";
import {join} from "node:path";

import {describe, expect, it} from "vitest";

import {readsMainnet} from "../mainnet-routes";

const PAGES_DIR = join(import.meta.dirname, "..", "..", "pages");
const APP_TSX = join(import.meta.dirname, "..", "..", "App.tsx");

/**
 * Does every page that says "real TRUST" live on a route the shell agrees is mainnet?
 *
 * ## Why this reads the source instead of a list
 *
 * The first version of this file wrote the routes out by hand and claimed that "adding a mainnet
 * route without adding it to `MAINNET_ROUTES` fails here". It did not. A developer who forgets the
 * list forgets both copies of it, the two agree, and the suite is green while `/foo` ships
 * "Running on Intuition Testnet — no real value at stake" over a real transaction. The list had
 * moved out of a component and into a test comment; it was still hand-maintained, which
 * `mainnet-routes.ts` identifies as the root cause of the two times it already broke.
 *
 * So the fact is derived. `MainnetNotice` in a page's source is the page asserting it is a mainnet
 * surface; `App.tsx` says which route renders that page; `readsMainnet` must agree. Nobody has to
 * remember anything, and a new page is covered the moment it renders the notice.
 *
 * Same device and same reason as `check-css-tokens.ts` (ADR `0050`): a string no type system can
 * see, checked by reading the source that contains it.
 */

/** Page modules whose source renders `MainnetNotice` — the page's own claim to be mainnet. */
function pagesClaimingMainnet(): string[] {
    return readdirSync(PAGES_DIR)
        .filter((name) => name.endsWith(".tsx"))
        .filter((name) => readFileSync(join(PAGES_DIR, name), "utf8").includes("<MainnetNotice"))
        .map((name) => name.replace(/\.tsx$/, ""));
}

/**
 * `component name → route path`, read off `App.tsx`.
 *
 * Split on `<Route` rather than matched as `<Route …/>`: the app renders both `element={<Page />}`
 * and a `Suspense` wrapper around a lazily-imported one, and a non-greedy match to the first `/>`
 * stops at the fallback's — which found every `path` and no component at all, making the
 * assertions below vacuous. That is why the first test here checks the readers found something.
 */
function routesByComponent(): Map<string, string[]> {
    const source = readFileSync(APP_TSX, "utf8");
    const routes = new Map<string, string[]>();
    // `/<Route\s/`, not `"<Route"`: `<RouteFallback` contains the latter, so splitting on the
    // string cut each element in half and left every chunk with either a path or a component but
    // never both — which is what the first test below is for.
    for (const block of source.split(/<Route\s/).slice(1)) {
        const path = /path="([^"]+)"/.exec(block)?.[1];
        if (path === undefined) continue;
        for (const component of block.matchAll(/<([A-Z][A-Za-z0-9]*)\s*\/>/g)) {
            const name = component[1];
            if (name === undefined || name === "RouteFallback") continue;
            routes.set(name, [...(routes.get(name) ?? []), path]);
        }
    }
    return routes;
}

/** A route pattern with its params filled in, so `readsMainnet` sees a real pathname. */
function concretise(pattern: string): string {
    return pattern.replace(/:[A-Za-z]+/g, "1");
}

describe("readsMainnet", () => {
    it("finds the pages and the routes it is about", () => {
        // Guards the two readers above: a rename that silently matches nothing would make every
        // assertion below vacuously true, which is the failure shape this file exists to avoid.
        const pages = pagesClaimingMainnet();
        expect(pages.length).toBeGreaterThanOrEqual(5);
        const routes = routesByComponent();
        expect(routes.size).toBeGreaterThanOrEqual(6);
        for (const page of pages) expect(routes.has(page)).toBe(true);
    });

    it("agrees with every page that renders MainnetNotice", () => {
        for (const page of pagesClaimingMainnet()) {
            for (const pattern of routesByComponent().get(page) ?? []) {
                const pathname = concretise(pattern);
                expect(
                    readsMainnet(pathname),
                    `${page} renders <MainnetNotice /> at ${pattern}, but readsMainnet(${pathname}) ` +
                        `is false — the shell would show the testnet strip and a faucet link above it. ` +
                        `Add it to MAINNET_ROUTES or MAINNET_ROUTE_PREFIXES.`,
                ).toBe(true);
            }
        }
    });

    it("does not claim a page that renders no notice reads mainnet", () => {
        // The converse, and `/agent` is the live instance: it mints into ARP's own registry on
        // testnet 13579 — the fixture ADR `0027` keeps — renders no notice, and the testnet strip
        // above it is correct. Claiming mainnet there would be the same error pointing the other way.
        const claiming = new Set(pagesClaimingMainnet());
        for (const [component, patterns] of routesByComponent()) {
            if (claiming.has(component)) continue;
            for (const pattern of patterns) {
                expect(
                    readsMainnet(concretise(pattern)),
                    `${component} at ${pattern} renders no <MainnetNotice />, so readsMainnet must ` +
                        `not claim it reads mainnet.`,
                ).toBe(false);
            }
        }
    });

    it("rejects a path it knows nothing about", () => {
        expect(readsMainnet("/nothing-here")).toBe(false);
    });
});
