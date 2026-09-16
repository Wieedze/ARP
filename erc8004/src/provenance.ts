import type {Provenance} from "./types.js";

/**
 * Build a `Provenance` for one source.
 *
 * Every source stamps the same three fields, so the helper lives here rather
 * than being re-declared per source — the shape of a provenance record is a
 * property of the package, not of any one source.
 */
export function provenanceFor(sourceId: string) {
    return (kind: Provenance["kind"], origin: string | null, note?: string): Provenance =>
        note === undefined ? {sourceId, kind, origin} : {sourceId, kind, origin, note};
}
