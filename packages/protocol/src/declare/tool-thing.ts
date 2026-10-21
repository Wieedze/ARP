import {thingDocument, thingUri, type AgentThing} from "./agent-atom.js";

/**
 * A tool's atom, derived from its URL and nothing else.
 *
 * ## The problem this solves
 *
 * An atom's id is the hash of its data, so two atoms are the same atom only if their bytes match
 * exactly. Measured on mainnet 1155 on 2026-10-19 with `scripts/measure/tool-atom-shape.ts` and the
 * `ToolAtomByUrl` query: `https://github.com` already resolves **five** distinct `Thing` atoms —
 * two labelled `GitHub`, three `github.com`. One URL, five markets, none of which can be merged
 * because Intuition has no deletion.
 *
 * The cause is that the Thing's `name` is whatever the person registering typed. A free-text field
 * inside a hashed document is a duplicate generator.
 *
 * ## The fix
 *
 * Every field of a tool's Thing is a **pure function of the normalised URL**. Nobody picks a name,
 * so nobody can pick a different one. Same URL in, same document out, same CID, same atom id — on
 * any machine, with no credential and no network.
 *
 * That is the same property `canonicalAgentThing` has for agents, for the same reason, and it
 * is why the agent recipe's fallbacks are frozen rather than improved.
 *
 * ## What is given up
 *
 * A human-chosen label. A reader sees `github.com/crytic/slither`, not `Slither`. That is the trade
 * and it is deliberate: a name is recoverable later (a `has alias` edge, a UI-side display map),
 * a fragmented market is not.
 */

/** A URL that cannot be normalised, so no atom can be derived from it. */
export class InvalidToolUrlError extends Error {
    readonly input: string;

    constructor(input: string, why: string) {
        super(`${JSON.stringify(input)} is not a usable tool URL: ${why}`);
        this.name = "InvalidToolUrlError";
        this.input = input;
    }
}

/** The one description every tool atom carries. Fixed, so it contributes nothing to the hash. */
export const TOOL_THING_DESCRIPTION =
    "A tool identified by its URL, so every declaration of its use lands on one atom.";

/**
 * Canonical form of a tool's URL. Deterministic, and the only input to its atom id.
 *
 * Each rule merges two spellings of one tool. Each is also a **false-merge risk**, taken knowingly,
 * because a false merge of two spellings of one URL is harmless and a missed merge is permanent:
 *
 * | rule | merges | the risk accepted |
 * | --- | --- | --- |
 * | a bare host gets `https://` | `github.com/x` with `https://github.com/x` | none — a schemeless paste means the web |
 * | the scheme becomes `https` | `http://…` with `https://…` | an http-only host's `url` field stops resolving |
 * | `www.` is dropped | `www.github.com` with `github.com` | a host where the two genuinely differ |
 * | a default port is dropped | `:443` with none | none — `URL` already does it |
 * | the fragment is dropped | `#readme` with none | none — a fragment is a scroll position |
 * | a trailing `/` is dropped | `/x/` with `/x` | a server that distinguishes them |
 * | query keys are sorted | `?b=2&a=1` with `?a=1&b=2` | a server where order is meaningful |
 *
 * The path's **case is kept**. Most servers are case-sensitive there, and `github.com/Crytic` vs
 * `github.com/crytic` are the same page only because GitHub chooses to be lenient — not a rule to
 * generalise from.
 */
export function normaliseToolUrl(input: string): string {
    const trimmed = input.trim();
    if (trimmed.length === 0) throw new InvalidToolUrlError(input, "empty");

    const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;

    let url: URL;
    try {
        url = new URL(withScheme);
    } catch {
        throw new InvalidToolUrlError(input, "not parseable as a URL");
    }

    if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new InvalidToolUrlError(input, `scheme ${url.protocol} is not http or https`);
    }
    if (url.hostname.length === 0) throw new InvalidToolUrlError(input, "no host");

    const host = url.hostname.replace(/^www\./, "");
    const path = url.pathname === "/" ? "" : url.pathname.replace(/\/+$/, "");

    const params = [...new URLSearchParams(url.search).entries()].sort(([a], [b]) =>
        a < b ? -1 : a > b ? 1 : 0,
    );
    const query = params.length === 0 ? "" : `?${new URLSearchParams(params).toString()}`;

    // The port survives only when it is not the scheme's default, which `URL` has already decided:
    // `url.port` is `""` for 443 on https. The scheme is forced to https above, so a surviving
    // `:80` from an `http://host:80` input would be wrong — drop it with the scheme it belonged to.
    const port = url.port === "" || url.port === "80" ? "" : `:${url.port}`;

    return `https://${host}${port}${path}${query}`;
}

/**
 * The Thing for a tool URL. Every field derives from {@link normaliseToolUrl}'s output.
 *
 * `name` is the normalised URL without its scheme — the shortest form that is still unambiguous,
 * and what a reader of the graph sees as the atom's label.
 */
export function toolThing(url: string): AgentThing {
    const normalised = normaliseToolUrl(url);
    return {
        name: normalised.slice("https://".length),
        description: TOOL_THING_DESCRIPTION,
        image: "",
        url: normalised,
    };
}

/**
 * `ipfs://<cid>` of a tool's Thing — the atom's `data`, computable before anything is pinned.
 *
 * Pinning the document makes it **readable** (Intuition's indexer resolves `value.thing` from the
 * CID); it is not needed to know the id, to plan, or to create the atom. Same split as
 * {@link thingUri}'s note for agents.
 */
export function toolAtomUri(url: string): string {
    return thingUri(toolThing(url));
}

/** The exact bytes to pin for a tool's atom to be readable. */
export function toolThingDocument(url: string): string {
    return thingDocument(toolThing(url));
}

/** Whether {@link normaliseToolUrl} can handle this URI, so a caller can branch without catching. */
export function isToolUrl(uri: string): boolean {
    try {
        normaliseToolUrl(uri);
        return true;
    } catch {
        return false;
    }
}
