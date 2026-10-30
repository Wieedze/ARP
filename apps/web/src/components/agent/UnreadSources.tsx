import type {TrustPanelView} from "../../services/agent-trust";

/**
 * The reads that did not land, and the answers that disagreed.
 *
 * Kept as a list of plain sentences rather than a status widget: a source that
 * failed at a named step is a fact about this agent's record, not an error the
 * page is apologising for. Both sides of a conflict are printed — the panel has
 * no basis for picking one, and picking silently would be the worse failure.
 */
export function UnreadSources({view}: {view: TrustPanelView}) {
    return (
        <ul className="flex flex-col gap-2 text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]">
            {view.sourceErrors.map((error, index) => (
                <li key={`${error.sourceId}-${index}`}>
                    <span className="font-mono">{error.sourceId}</span> failed at{" "}
                    <span className="font-mono">{error.step}</span>: {error.message}
                </li>
            ))}
            {view.conflicts.map((conflict, index) => (
                <li key={`${conflict.field}-${index}`}>
                    Sources disagree on <span className="font-mono">{conflict.field}</span>:{" "}
                    {conflict.entries
                        .map((entry) => `${entry.sourceId} says ${entry.value ?? "nothing"}`)
                        .join("; ")}
                    . Both answers kept.
                </li>
            ))}
        </ul>
    );
}
