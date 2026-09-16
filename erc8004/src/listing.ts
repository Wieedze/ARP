import type {Erc8004Client} from "./client.js";
import {isTimeoutError} from "./http.js";
import type {TrustSource} from "./sources/source.js";
import type {
    AgentListOrder,
    AgentPage,
    ListAgentsOptions,
    ResolvedListAgentsOptions,
    SourceError,
} from "./types.js";

/**
 * Listing the cohort, as opposed to reading one agent out of it.
 *
 * Everything else in this package is keyed by an ERC-8004 identity. This is the
 * one read that answers "which agents are there at all", which is what a caller
 * needs before they have an identity to ask about.
 */

/** Page size when the caller does not pick one. */
export const DEFAULT_PAGE_SIZE = 25;

/**
 * The largest page a source will be asked for.
 *
 * Not a performance guard so much as an honesty one: the cohort is tens of
 * thousands of agents, and a caller that pulls all of them to sort them
 * client-side has replaced the source's order with its own while still
 * presenting it as the source's.
 */
export const MAX_PAGE_SIZE = 100;

export const DEFAULT_LIST_ORDER: AgentListOrder = "evidence-quantity";

/**
 * Raised when no configured source can enumerate agents at all.
 *
 * Distinct from an empty page, and the distinction is the point: an empty page
 * means the source looked and the cohort is empty, while this means nothing
 * here can look. A client built from `[erc8004RegistrySource()]` alone hits
 * this, because an ERC-8004 registry exposes no enumeration.
 */
export class NoListingSourceError extends Error {
    readonly sourcesConsulted: readonly string[];

    constructor(sourcesConsulted: readonly string[]) {
        super(
            sourcesConsulted.length === 0
                ? "the client has no sources"
                : `no configured source can list agents: ${sourcesConsulted.join(", ")}`,
        );
        this.name = "NoListingSourceError";
        this.sourcesConsulted = sourcesConsulted;
    }
}

/**
 * Raised when every source that can list agents failed.
 *
 * `timedOut` is on the value rather than left for a caller to recover from the
 * message, because the two cases call for different things. A deadline means
 * the read was probably going to succeed and is worth retrying — the same
 * cohort query has been measured returning in under a second and then timing
 * out minutes later, with no change to the query. Anything else means the
 * endpoint answered and said no, and retrying is just noise.
 */
export class ListAgentsFailedError extends Error {
    readonly errors: readonly SourceError[];
    /** Every source that failed did so on its deadline, not on an answer. */
    readonly timedOut: boolean;

    constructor(errors: readonly SourceError[], causes: readonly unknown[] = []) {
        super(
            `every listing source failed: ${errors
                .map((entry) => `${entry.sourceId}: ${entry.message}`)
                .join("; ")}`,
        );
        this.name = "ListAgentsFailedError";
        this.errors = errors;
        this.timedOut = causes.length > 0 && causes.every(isTimeoutError);
    }
}

/** The ids of sources that can enumerate agents at all. */
export function listingCapableSources(client: Erc8004Client): string[] {
    return client.sources
        .filter((source) => typeof source.listAgents === "function")
        .map((source) => source.id);
}

/**
 * Fill in the defaults and hold the page size to a sane range.
 *
 * A non-integer or out-of-range value is clamped rather than rejected: these
 * come from a URL or a control, not from a programmer, and a page of 25 is a
 * better answer to `?limit=banana` than a thrown error in a list view.
 */
export function resolveListOptions(options: ListAgentsOptions = {}): ResolvedListAgentsOptions {
    const requested = options.limit ?? DEFAULT_PAGE_SIZE;
    const limit = Number.isFinite(requested)
        ? Math.min(MAX_PAGE_SIZE, Math.max(1, Math.trunc(requested)))
        : DEFAULT_PAGE_SIZE;
    const requestedOffset = options.offset ?? 0;
    const offset = Number.isFinite(requestedOffset) ? Math.max(0, Math.trunc(requestedOffset)) : 0;
    return {order: options.order ?? DEFAULT_LIST_ORDER, limit, offset};
}

/**
 * One page of the agent cohort, from the first source that can produce one.
 *
 * Unlike the profile reads, pages from two sources are **not** merged. Merging
 * them would mean interleaving two independently ordered windows and calling
 * the result one order, and re-ranking the union client-side would make the
 * order a property of the page rather than of the cohort. So the first source
 * that answers owns the page, and `AgentPage.sourceId` says which one that was.
 */
export async function listAgents(
    client: Erc8004Client,
    options: ListAgentsOptions = {},
): Promise<AgentPage> {
    const resolved = resolveListOptions(options);
    const capable = client.sources.filter(
        (source): source is TrustSource & Required<Pick<TrustSource, "listAgents">> =>
            typeof source.listAgents === "function",
    );

    if (capable.length === 0) {
        throw new NoListingSourceError(client.sources.map((source) => source.id));
    }

    const errors: SourceError[] = [];
    const causes: unknown[] = [];
    for (const source of capable) {
        try {
            return await source.listAgents(resolved);
        } catch (error) {
            causes.push(error);
            errors.push({
                sourceId: source.id,
                step: "listAgents",
                message: error instanceof Error ? error.message : String(error),
            });
        }
    }
    throw new ListAgentsFailedError(errors, causes);
}
