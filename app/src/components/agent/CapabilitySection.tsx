import type {CapabilityGroup} from "../../services/agent-trust";

/**
 * What the graph says this agent is for.
 *
 * Almost always nothing: 194 `use` triples exist across the whole Intuition
 * mainnet graph. The empty state says that plainly instead of padding the
 * section — an agent with no declared capability is the normal case and the
 * point of Phase 2, not an error to apologise for.
 */
export function CapabilitySection({groups, count}: {groups: CapabilityGroup[]; count: number}) {
    if (count === 0) {
        return (
            <p className="text-[length:var(--text-body-sm)] text-[color:var(--color-fg-60)] max-w-[60ch]">
                No capability triples. Every agent in this cohort carries a trust score; almost none
                carries a statement of what it is for — 194 <span className="font-mono">use</span>{" "}
                triples exist across the entire graph. Indexing that layer is the next phase of this
                work, not something this panel can infer.
            </p>
        );
    }

    return (
        <dl className="flex flex-col gap-4">
            {groups.map((group) => (
                <div
                    key={group.relation}
                    className="grid sm:grid-cols-[8rem_1fr] gap-x-6 gap-y-1 border-t border-[color:var(--color-border)] pt-3"
                >
                    <dt className="font-mono uppercase tracking-wider text-[length:var(--text-label)] text-[color:var(--color-fg-60)]">
                        {group.label}
                    </dt>
                    <dd className="flex flex-wrap gap-x-4 gap-y-1 text-[length:var(--text-body-sm)]">
                        {group.entries.map((entry, index) => {
                            const label = entry.name ?? entry.label ?? "unnamed";
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
