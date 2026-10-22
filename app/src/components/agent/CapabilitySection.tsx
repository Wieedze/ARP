import {Link} from "react-router-dom";

import type {CapabilityGroup} from "../../services/agent-trust";

/**
 * What the graph says this agent is for.
 *
 * Almost always nothing, and the empty state says so plainly instead of padding the section — an
 * agent with no declared capability is the normal case, not an error to apologise for.
 *
 * The copy used to carry "194 `use` triples exist across the entire graph". Two problems: a measured
 * figure on screen rots where nobody can re-run it, and `use` is the wrong predicate for this claim
 * anyway — ADR `0030` found that `use` means "supports this protocol" while `uses` means "uses this
 * tool", so the number was answering a different question than the sentence asked.
 */
export function CapabilitySection({groups, count}: {groups: CapabilityGroup[]; count: number}) {
    if (count === 0) {
        return (
            <p className="text-[length:var(--text-body-sm)] text-[color:var(--color-steel)] max-w-[60ch]">
                No capability triples. Every agent in this cohort carries a trust score; almost none
                carries a statement of what it is for. Indexing that layer is the next phase of this
                work, not something this panel can infer.
            </p>
        );
    }

    return (
        <dl className="flex flex-col gap-4">
            {groups.map((group) => (
                <div
                    key={group.relation}
                    className="grid sm:grid-cols-[8rem_1fr] gap-x-6 gap-y-1 border-t border-[color:var(--color-rule)] pt-3"
                >
                    <dt className="font-mono uppercase tracking-wider text-[length:var(--text-label)] text-[color:var(--color-steel)]">
                        {group.label}
                    </dt>
                    <dd className="flex flex-wrap gap-x-4 gap-y-1 text-[length:var(--text-body-sm)]">
                        {group.entries.map((entry, index) => {
                            const label = entry.name ?? entry.label ?? "unnamed";
                            // A `uses-tool` object is a tool, and a tool has a page: who else
                            // declared using it and what they put behind saying so. `tasks/20` made
                            // this edge render; until now it went nowhere. The internal link wins
                            // over the object's own external url, because the standing of the tool
                            // is what this panel cannot otherwise show.
                            if (group.relation === "uses-tool" && entry.sourceHandle !== null) {
                                return (
                                    <Link
                                        key={`${label}-${index}`}
                                        to={`/tool/atom/${entry.sourceHandle}`}
                                        className="font-mono text-[color:var(--color-accent)]"
                                    >
                                        {label}
                                    </Link>
                                );
                            }
                            return entry.url !== null ? (
                                <a
                                    key={`${label}-${index}`}
                                    href={entry.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="font-mono"
                                >
                                    {label}
                                </a>
                            ) : (
                                <span key={`${label}-${index}`} className="font-mono">
                                    {label}
                                </span>
                            );
                        })}
                    </dd>
                </div>
            ))}
        </dl>
    );
}
