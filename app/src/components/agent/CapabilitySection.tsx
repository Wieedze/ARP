import {Link} from "react-router-dom";

import {linkClass} from "../../lib/control-class";
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
 *
 * ## Every object is a link now, not just a tool
 *
 * Only `uses-tool` objects were linked, so a tool was clickable and a tag, a category, a protocol
 * and a type were dead text — which the user noticed by walking the graph and finding every link
 * led back to an agent (2026-10-27). They are all atoms with their own vaults, and `/atom/:id` is
 * predicate-agnostic, so each one goes to its own page. The internal link wins over the object's
 * own external url, because the standing of a thing is what this panel cannot otherwise show; the
 * url is still reachable from the atom's page.
 */
export function CapabilitySection({groups, count}: {groups: CapabilityGroup[]; count: number}) {
    if (count === 0) {
        return (
            <p className="text-[length:var(--text-body-sm)] text-[color:var(--color-steel)] max-w-[60ch]">
                No capability triples.
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
                            // Gated on having an atom id, not on the relation. `sourceHandle` is
                            // the object's term id and it is the only thing the link needs.
                            if (entry.sourceHandle !== null) {
                                return (
                                    <Link
                                        key={`${label}-${index}`}
                                        to={`/atom/${entry.sourceHandle}`}
                                        className={`font-mono ${linkClass}`}
                                    >
                                        {label}
                                    </Link>
                                );
                            }
                            // No term id means the edge's object was not resolvable, so there is
                            // nowhere to go. The external url is the fallback, then plain text.
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
