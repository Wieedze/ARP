/**
 * What the indexer calls each term: an atom's label, or a triple's three labels.
 *
 * Used to say who did what in a stream of raw ids. The identity atom an agent declares from reads
 * `Agent 13579:8`; a deposit's term reads `Agent 13579:8 · uses · github.com/…?skill=brainstorming`.
 * Nothing is composed here: a term the indexer does not know is simply absent from the map, and
 * the caller shows the id.
 */
import {
    ATOM_LABELS_QUERY,
    createGraphqlTransport,
    DEFAULT_TIMEOUT_MS,
    defaultFetch,
    type FetchLike,
    type GraphqlTransport,
    isRecord,
    readRecord,
    readString,
} from "@arp-protocol/graphql";

export type TermLabel =
    | {kind: "atom"; label: string}
    | {kind: "triple"; subject: string; predicate: string; object: string};

export type TermLabelsConfig = {
    /** Required: a label is a fact about one chain's indexer, and a default would pick a chain. */
    graphqlUrl: string;
    fetch?: FetchLike;
    timeoutMs?: number;
    transport?: GraphqlTransport;
};

/** Keys are lower-cased term ids. Unknown ids are left out. */
export async function getTermLabels(
    ids: readonly string[],
    config: TermLabelsConfig,
): Promise<Map<string, TermLabel>> {
    const out = new Map<string, TermLabel>();
    const unique = [...new Set(ids.map((id) => id.toLowerCase()))];
    if (unique.length === 0) return out;
    const transport =
        config.transport ??
        createGraphqlTransport({
            url: config.graphqlUrl,
            fetch: config.fetch ?? defaultFetch(),
            timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        });
    const data = await transport.request(ATOM_LABELS_QUERY, {ids: unique});
    const rows = Array.isArray(data["terms"]) ? data["terms"] : [];
    for (const row of rows) {
        if (!isRecord(row)) continue;
        const id = readString(row, "id");
        if (id === null) continue;
        const atom = readRecord(row, "atom");
        const atomLabel = atom === null ? null : readString(atom, "label");
        if (atomLabel !== null) {
            out.set(id.toLowerCase(), {kind: "atom", label: atomLabel.trim()});
            continue;
        }
        const triple = readRecord(row, "triple");
        if (triple === null) continue;
        const part = (key: string) => {
            const node = readRecord(triple, key);
            return node === null ? null : readString(node, "label");
        };
        const subject = part("subject");
        const predicate = part("predicate");
        const object = part("object");
        if (subject === null || predicate === null || object === null) continue;
        out.set(id.toLowerCase(), {
            kind: "triple",
            subject: subject.trim(),
            predicate: predicate.trim(),
            object: object.trim(),
        });
    }
    return out;
}
