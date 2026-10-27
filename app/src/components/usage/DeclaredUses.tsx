import {useChainChoice} from "../../lib/chain-choice";
import {useToolUsage} from "../../hooks/use-tool-usage";
import {describeCounts, opensRun, type ToolUsageView} from "../../services/tool-usage-view";
import {truncateMiddle} from "../../services/trust-format";
import {UsageEdgeRow} from "../tool/UsageEdgeRow";

/**
 * The `uses` edges pointing **at** one atom: who declared using it, and what they put behind
 * saying so.
 *
 * ## Why this is not called `ToolUsage`
 *
 * It was the body of `/tool/atom/:atomId` and nothing else. `getToolUsage` knows nothing about
 * tools — it takes an atom and returns the `uses` edges whose **object** is that atom:
 *
 * | the atom is…    | the edges mean…                        |
 * | --------------- | -------------------------------------- |
 * | a tool's atom   | which agents declared using this tool  |
 * | an agent's atom | which agents declared using this agent |
 *
 * `CapabilitySearch` had already been linking agents into that route, with a comment admitting the
 * route's name was the leftover. Separated from the page so the aside and the list can be read
 * apart, and so the next consumer does not copy a page.
 *
 * **Only `uses`.** An atom is also the object of `has tag`, `has category`, `implements` and the
 * rest, and those edges are not read here — a tag's atom renders empty through this component,
 * correctly and uselessly. Reading every incoming predicate is a different component and a
 * different decision.
 *
 * ## It reads and does not write
 *
 * By decision (ADR `0056`), not omission. Each edge briefly carried a stake form. Measured on
 * mainnet 1155 the same day, 1 of 185 `uses` edges has ever been contradicted and 969 of 285,775
 * triples chain-wide — so the edge is not a two-sided market, and soliciting a deposit on one
 * invited the reader to look for a disagreement that is not there. What the edge cost to write is
 * the signal. A position somebody did take is still displayed.
 */

export function DeclaredUses({atomId}: {atomId: string}) {
    const chain = useChainChoice();
    const query = useToolUsage(atomId);

    if (query.isPending) {
        return (
            <p aria-live="polite" aria-busy className="text-[color:var(--color-steel)]">
                Reading the <span className="font-mono">uses</span> edges of{" "}
                <span className="font-mono">{truncateMiddle(atomId)}</span> on{" "}
                {chain.label.toLowerCase()}…
            </p>
        );
    }

    if (query.isError) {
        return (
            <div aria-live="polite">
                <h2 className="text-[length:var(--text-body)] font-medium">The read failed</h2>
                <p className="mt-3 max-w-[60ch] text-[color:var(--color-steel)]">
                    {query.error instanceof Error ? query.error.message : String(query.error)}
                </p>
            </div>
        );
    }

    return query.data.isEmpty ? <Empty atomId={atomId} /> : <Edges view={query.data} />;
}

function Edges({view}: {view: ToolUsageView}) {
    return (
        <>
            {/* Counted, not implied. `tierCounts` exists for this. */}
            <p className="mb-6 text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]">
                {describeCounts(view)}
            </p>
            {view.isEntirelyUnpriced ? (
                // Scoped, because the alternative reads as a claim about the subject itself: the
                // atom's own vault is a different market and this read does not touch it.
                <p className="mb-6 max-w-[70ch] border border-[color:var(--color-rule-strong)] px-4 py-3 text-[length:var(--text-body-sm)]">
                    Nothing stands behind the claims below. The atom&rsquo;s own market is separate.
                </p>
            ) : null}
            <ul>
                {view.edges.map((edge, index) => (
                    <UsageEdgeRow
                        key={edge.tripleId}
                        edge={edge}
                        // `opensRun` lives in the service because this predicate was wrong here: it
                        // keyed on the tier while the row renders from the tier AND `isOffCurve`,
                        // which suppressed the caption on the first free row after an off-curve one.
                        isFirstOfTier={opensRun(view.edges, index)}
                    />
                ))}
            </ul>
        </>
    );
}

/**
 * The empty state, for the overwhelming majority of atoms, which nobody has declared using.
 *
 * Says what would be here, per `rules/ui.md`, and does not pretend the absence is informative:
 * nobody declaring a subject is not evidence against it.
 *
 * **No measured figure in the copy.** A first draft said "84 of the atoms on mainnet are the object
 * of a `uses` edge" — true on 2026-10-19 (`scripts/measure/tool-atom-shape.ts`) and guaranteed to
 * rot on screen, where nobody can re-run it. The shape of the claim survives without the number.
 */
function Empty({atomId}: {atomId: string}) {
    return (
        <div>
            <h2 className="text-[length:var(--text-body)] font-medium">No declared uses</h2>
            <p className="mt-3 max-w-[70ch] text-[color:var(--color-steel)]">
                Nothing declares using <span className="font-mono">{truncateMiddle(atomId)}</span>{" "}
                yet. A row appears when an agent writes a <span className="font-mono">uses</span>{" "}
                edge onto it.
            </p>
        </div>
    );
}
