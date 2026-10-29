import {Link} from "react-router-dom";

import {linkClass} from "../../lib/control-class";

import type {GroupView} from "../../services/atom-standing-view";
import {truncateMiddle} from "../../services/trust-format";
import {StakerCount} from "../agent/StakerCount";
import {Sigil} from "../brand/Sigil";

/**
 * The claims about one atom, as a list — the other half of `ClaimField`.
 *
 * **Shared, because both pages ask the same question of the same data.** It lived inside
 * `AtomPanel` while `/agent/:chainId/:tokenId` had its own narrower `DeclaredUses`, so a tool's
 * page and an agent's page rendered the same `uses` edges two different ways. The user's
 * instruction: _« je veux les mêmes choses et même front end pour la page agent »_ — so there is
 * one component and two callers rather than a copy.
 *
 * It takes a view, not an atom id: the page that owns the read also owns its loading and error
 * states, and a component that fetched for itself would give each page a different one.
 */
/**
 * A staked figure: the person mark with its count, then the amount.
 *
 * `StakerCount` was already exactly what the user asked for — _« juste un svg avec une personne et
 * un chiffre ainsi que la somme totale »_ — and this page was spelling it out in words instead
 * (`1 distinct staker`). The mark says "accounts" without the noun, the digit says how many, and
 * the amount follows.
 *
 * The count is never dropped. ADR `0023`: every vault on this surface holds one or two positions,
 * so an amount on its own suggests a depth of opinion that is not there, and the count is the part
 * that stops it reading as a market. `StakerCount` carries the announced label, so a screen reader
 * still hears "1 distinct staker" where the screen shows a glyph and a digit.
 */
export function Backing({amount, positions}: {amount: string; positions: number}) {
    return (
        <span className="flex shrink-0 items-center gap-3 font-mono text-[length:var(--text-body-sm)] tabular-nums">
            <span className="text-[color:var(--color-steel)]">
                <StakerCount count={positions} />
            </span>
            <span>{amount}</span>
        </span>
    );
}

/**
 * One predicate's edges.
 *
 * The predicate is the heading because it is what the claims say. A reader scanning this page is
 * asking "what is said about this thing", and the answer is a list of verbs with subjects under
 * them.
 */
export function Group({
    group,
    subject,
    modules,
}: {
    group: GroupView;
    subject: string;
    /** Each claimant's declared tool ids, keyed by its atom id. Empty while the read is in flight. */
    modules: Record<string, string[]>;
}) {
    return (
        <section className="mb-12">
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-[color:var(--color-rule-strong)] pb-2">
                <h2
                    className={`font-medium ${group.labelIsId ? "font-mono text-[length:var(--text-body-sm)]" : ""}`}
                >
                    {group.label}
                </h2>
                {group.backing === null ? null : (
                    <Backing amount={group.backing} positions={group.positions} />
                )}
            </div>
            <ul>
                {group.rows.map((row) => (
                    <li
                        key={row.tripleId}
                        className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-[color:var(--color-rule)] py-3"
                    >
                        {/* The **whole sentence**, not just its subject. A row used to read
                            "Agent 13579:3" under a heading "uses", leaving the reader to assemble
                            `Agent 13579:3 — uses — this atom` themselves (user, 2026-10-27, with a
                            screenshot). A triple is a statement and reads as one.

                            Weighted so the new information leads: the subject is the only part
                            that changes down the list, so it carries the colour and the link. The
                            predicate is steel and the object is the page you are already on, so it
                            is dimmest — present for the grammar, not for the eye. Every subject is
                            an atom, so every subject links to its own page: the graph is walkable
                            in both directions. */}
                        <p className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                            {/* **The claimant's own sigil**, where it has one. A glyph generated
                                from what that agent declared using — `ui.md`'s "agent identity is a
                                Sigil, generated from chain data and never drawn by hand".

                                It falls back to the claim-state dot when the agent declared nothing
                                this read reached, and that is deliberate rather than a gap:
                                `agent-sigil.ts` refuses a glyph of nothing but its core, because
                                that is the same glyph for every such agent and would stop being an
                                identity. The dot still carries the state the constellation shows —
                                filled is `positions > 0`, ADR `0042`, the count and never the
                                amount. */}
                            {(modules[row.subjectAtomId]?.length ?? 0) > 0 ? (
                                <Sigil
                                    // No `title`, which is how `Sigil` knows to mark itself
                                    // `aria-hidden`: the agent's name is the next element, and a
                                    // second announcement of the same identity is noise. Its own
                                    // docstring says so.
                                    agentId={row.subjectAtomId}
                                    size={28}
                                    modules={(modules[row.subjectAtomId] ?? []).map((name) => ({
                                        name,
                                        // Always `declared`: `proven` needs a third party's
                                        // receipt and nothing in this app reads one. The whole
                                        // glyph renders hollow, which is the state of the graph
                                        // drawn rather than a placeholder (`agent-sigil.ts`).
                                        state: "declared" as const,
                                    }))}
                                />
                            ) : (
                                <span
                                    aria-hidden="true"
                                    className={`mr-1 inline-block h-[8px] w-[8px] shrink-0 rounded-full border ${
                                        row.positions > 0
                                            ? "border-[color:var(--color-fg)] bg-[color:var(--color-fg)]"
                                            : "border-[color:var(--color-steel)]"
                                    }`}
                                />
                            )}
                            <Link
                                to={`/atom/${row.subjectAtomId}`}
                                className={`min-w-0 truncate ${row.nameIsId ? "font-mono" : ""} ${linkClass}`}
                            >
                                {row.name}
                            </Link>
                            <span className="text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]">
                                {group.label}
                            </span>
                            <span className="min-w-0 truncate text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]">
                                {subject}
                            </span>
                        </p>
                        <span className="flex items-center gap-4">
                            {row.backing === null ? null : (
                                <Backing amount={row.backing} positions={row.positions} />
                            )}
                            {row.opposition === null ? null : (
                                <span className="font-mono text-[length:var(--text-body-sm)] tabular-nums text-[color:var(--color-alarm)]">
                                    against {row.opposition}
                                </span>
                            )}
                        </span>
                    </li>
                ))}
            </ul>
        </section>
    );
}

/**
 * The atom is there and nothing points at it — the ordinary case for most atoms.
 *
 * Says what would be here, per `rules/ui.md`, and does not pretend the absence is informative:
 * nobody pointing at something is not evidence against it.
 */
export function Empty({atomId}: {atomId: string}) {
    return (
        <div>
            <h2 className="text-[length:var(--text-body)] font-medium">Nothing points at it</h2>
            <p className="mt-3 max-w-[70ch] text-[color:var(--color-steel)]">
                No claim on this chain has{" "}
                <span className="font-mono">{truncateMiddle(atomId)}</span> as its object. A row
                appears when somebody writes one — a declared use, a tag, a category.
            </p>
        </div>
    );
}
