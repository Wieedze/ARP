import {useId, useState} from "react";
import {useParams} from "react-router-dom";
import type {Hex} from "viem";

import {useStakeSession} from "../hooks/use-stake-session";
import {useTermShape} from "../hooks/use-term-shape";
import {useToolUsage, isToolAtomId} from "../hooks/use-tool-usage";
import {curveLabelOf} from "../services/tool-catalog";
import {formatTrust, truncateMiddle} from "../services/trust-format";
import {
    describeCounts,
    opensRun,
    UNREACHABLE_TIERS,
    type ToolUsageView,
} from "../services/tool-usage-view";
import {MainnetNotice} from "../components/agent/MainnetNotice";
import {StakeControl} from "../components/agent/StakeControl";
import {TermShapePanel} from "../components/tool/TermShapePanel";
import {UsageEdgeRow} from "../components/tool/UsageEdgeRow";
import {TIER_CAPTION, TIER_LABEL, TIER_UNREACHABLE_REASON} from "../components/tool/tier-scale";
import {INTUITION_MAINNET_EXPLORER} from "../lib/intuition-mainnet";

/**
 * A tool's standing: who declared using it, and what they put behind saying so (`/tool/atom/:atomId`).
 *
 * The half of `docs/12` that did not exist. The panel makes one provider's opinion of one agent
 * checkable; this makes a tool's standing legible, and legible specifically as **who paid what to
 * say so**.
 *
 * Distinct from `/tool/:id`, which is keyed on a `ModuleRegistry` id, reads the atom's own vault and
 * is testnet-only — `ModuleRegistry` is not going to mainnet (ADR `0025`). This page is keyed on an
 * atom, reads the incoming `uses` edges, and is a mainnet view.
 *
 * **It writes now**, and that is new as of 2026-10-21. The first version read only, on the grounds
 * that ADR `0017`'s seven safeguards are acceptance criteria rather than advice. They are, and they
 * are met by reusing the control that implements them: `StakeControl` was generalised from a
 * `TrustRow` to a claim, so the chain guard, the empty amount, the ceiling, the confirmation with
 * the vault's position count, the never-auto-stake rule, `previewDeposit` on every quote and
 * `minShares` from the preview all come with it rather than being re-implemented here.
 *
 * Reading without writing was the larger problem: the `uses` edge market is what `docs/12` is about,
 * and it was the one market in the app nobody could take a position in.
 */
export function ToolUsagePanel() {
    const {atomId} = useParams();
    const valid = isToolAtomId(atomId);
    const query = useToolUsage(valid ? atomId : null);

    if (!valid) {
        return (
            <section>
                <h1 className="text-[length:var(--text-display)] leading-[var(--leading-display)] tracking-tight font-semibold">
                    Not an atom id
                </h1>
                <p className="mt-4 max-w-[60ch] text-[color:var(--color-fg-60)]">
                    A tool is addressed by its Intuition atom id — 0x followed by 32 bytes. Got{" "}
                    <span className="font-mono">{atomId ?? "nothing"}</span>.
                </p>
            </section>
        );
    }

    return (
        <section>
            <MainnetNotice />
            {/* `aria-live` is on the two transient branches, not on the wrapper.
                On the wrapper it was the live region for every `StakeControl` below it, and a live
                region announces all descendant mutations that do not establish their own — so the
                amount field's help text, which swaps as the user types, became a polite
                announcement per keystroke. The controls carry their own `role="status"` and
                `role="alert"` nodes, correctly placed. */}
            <div>
                {query.isPending ? (
                    <p
                        aria-live="polite"
                        aria-busy
                        className="mt-10 text-[color:var(--color-fg-60)]"
                    >
                        Reading the <span className="font-mono">uses</span> edges of{" "}
                        <span className="font-mono">{truncateMiddle(atomId)}</span> on Intuition
                        mainnet…
                    </p>
                ) : query.isError ? (
                    <div aria-live="polite" className="mt-10">
                        <h1 className="text-[length:var(--text-display)] leading-[var(--leading-display)] tracking-tight font-semibold">
                            The read failed
                        </h1>
                        <p className="mt-4 max-w-[60ch] text-[color:var(--color-fg-60)]">
                            {query.error instanceof Error
                                ? query.error.message
                                : String(query.error)}
                        </p>
                    </div>
                ) : (
                    <ToolUsageBody view={query.data} onSettled={() => void query.refetch()} />
                )}
            </div>
        </section>
    );
}

function ToolUsageBody({view, onSettled}: {view: ToolUsageView; onSettled: () => void}) {
    return (
        <div className="mt-10 grid gap-x-12 gap-y-10 md:grid-cols-[18rem_1fr] md:items-start">
            <aside>
                <h1 className="text-[length:var(--text-display)] leading-[var(--leading-display)] tracking-tight font-semibold break-words">
                    {view.label ?? "Unnamed atom"}
                </h1>
                <dl className="mt-6 border-t border-[color:var(--color-border)] pt-4 text-[length:var(--text-body-sm)]">
                    <dt className="text-[color:var(--color-fg-60)] text-[length:var(--text-label)] uppercase tracking-wider">
                        Atom
                    </dt>
                    <dd className="mt-1 font-mono break-all">{view.toolAtomId}</dd>
                    {view.pinnedUri === null ? null : (
                        <>
                            <dt className="mt-4 text-[color:var(--color-fg-60)] text-[length:var(--text-label)] uppercase tracking-wider">
                                Pinned at
                            </dt>
                            <dd className="mt-1 font-mono break-all">{view.pinnedUri}</dd>
                        </>
                    )}
                    <dt className="mt-4 text-[color:var(--color-fg-60)] text-[length:var(--text-label)] uppercase tracking-wider">
                        Declared uses
                    </dt>
                    <dd className="mt-1 font-mono tabular-nums">{view.edges.length}</dd>
                </dl>

                {/* Gated on the POSITION count, not on `isEmpty`. `scripts/measure-tool-page-states.ts`
                    counts which state every tool atom would render: on mainnet 2026-10-19, 64 of 84
                    render the sidebar and **20 have it gated** — 19 entirely free plus the one
                    off-curve atom — because every edge carries creation dust (ADR 0042). Rendering
                    it for those printed "Staked for <0.00000001 across 0 positions" beside the
                    banner saying nobody has staked anything: two statements on one screen that
                    cannot both be true. */}
                {view.totals.supportPositions > 0 || view.totals.opposePositions > 0 ? (
                    <Totals view={view} />
                ) : null}

                <a
                    href={`${INTUITION_MAINNET_EXPLORER}/address/${view.toolAtomId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-6 inline-block text-[length:var(--text-body-sm)] text-[color:var(--color-accent)]"
                >
                    Explorer →
                </a>
            </aside>

            <div className="min-w-0">
                {view.isEmpty ? (
                    <EmptyState atomId={view.toolAtomId} />
                ) : (
                    <Edges view={view} onSettled={onSettled} />
                )}
                {/* "Everything above prices the claim…" is false with nothing above it. */}
                {view.isEmpty ? null : <OtherMarket />}
                <Ladder view={view} />
            </div>
        </div>
    );
}

/**
 * The summed market, and never the sum alone.
 *
 * `ToolUsage.totals` carries the position counts for exactly this reason: summing assets across
 * edges without them turns a handful of convictions into something that reads like liquidity.
 *
 * **Not `StakerCount` here, and that is the trap ADR `0023` predicted in writing.** Its accessible
 * name is "N distinct stakers", which is true of a `MarketSide` scoped to one vault — ADR `0023`
 * says so outright — and **false of a sum across edges**, where one account backing two tools is
 * counted twice. The rows below use `StakerCount` because each is a single vault; this says
 * "positions" because that is all a sum can claim.
 */
function Totals({view}: {view: ToolUsageView}) {
    return (
        <dl className="mt-6 border-t border-[color:var(--color-border)] pt-4 text-[length:var(--text-body-sm)]">
            {view.totals.supportPositions > 0 ? (
                <>
                    <dt className="text-[color:var(--color-fg-60)] text-[length:var(--text-label)] uppercase tracking-wider">
                        Staked for
                    </dt>
                    <dd className="mt-1 font-mono tabular-nums">
                        {formatTrust(view.totals.supportAssets)}{" "}
                        <span className="text-[color:var(--color-fg-60)]">
                            across {view.totals.supportPositions}{" "}
                            {view.totals.supportPositions === 1 ? "position" : "positions"}
                        </span>
                    </dd>
                </>
            ) : null}
            {view.totals.opposePositions > 0 ? (
                <>
                    <dt className="mt-4 text-[color:var(--color-fg-60)] text-[length:var(--text-label)] uppercase tracking-wider">
                        Staked against
                    </dt>
                    <dd className="mt-1 font-mono tabular-nums">
                        {formatTrust(view.totals.opposeAssets)}{" "}
                        <span className="text-[color:var(--color-fg-60)]">
                            across {view.totals.opposePositions}{" "}
                            {view.totals.opposePositions === 1 ? "position" : "positions"}
                        </span>
                    </dd>
                </>
            ) : null}
        </dl>
    );
}

function Edges({view, onSettled}: {view: ToolUsageView; onSettled: () => void}) {
    // One session read for the whole list, not one per row: it is the same chain config every
    // control needs, and `curveId`/`minDeposit` are governance state rather than per-claim state.
    const {data: session, error: sessionError} = useStakeSession();
    /**
     * Which row's form is open — **one at a time**, by construction.
     *
     * Not a per-row boolean. The form is ~390px against a ~120px row, so N open forms turn a list
     * `rules/ui.md` wants at 15 rows above the fold into one and a half, and put ~4 tab stops on
     * every row. One at a time keeps the list dense and the keyboard path short.
     */
    const [openEdge, setOpenEdge] = useState<string | null>(null);
    /**
     * The open row has a transaction out, so no other row may take its place.
     *
     * One-at-a-time plus unmount would otherwise destroy the receipt mid-flight: the user signs on
     * row A, clicks "Take a position" on row B while the receipt is pending, and row A's control
     * unmounts — taking the hash, the explorer link and the "it may still land, do not sign it
     * again" branch with it. The unmount is kept, because it is also what empties the form between
     * rows (ADR `0017` safeguard 2, enforced by construction); what is added is that it cannot
     * happen while money is in the air.
     */
    const [inFlight, setInFlight] = useState(false);
    const panelPrefix = useId();

    return (
        <>
            {view.isEntirelyUnpriced ? (
                <p className="mb-6 max-w-[70ch] border border-[color:var(--color-border-strong)] px-4 py-3 text-[length:var(--text-body-sm)]">
                    Every declaration below is free. Nobody has put TRUST behind any of these
                    claims, so there is no market here to read — not a weak one.
                </p>
            ) : null}
            <ul>
                {view.edges.map((edge, index) => {
                    const isOpen = openEdge === edge.tripleId;
                    const panelId = `${panelPrefix}-${edge.tripleId}`;
                    const subject = edge.agent.label ?? truncateMiddle(edge.agent.atomId);
                    const tripleId = tripleIdOrNull(edge.tripleId);
                    return (
                        <UsageEdgeRow
                            key={edge.tripleId}
                            edge={edge}
                            // `opensRun` lives in the service because this predicate was wrong
                            // here: it keyed on the tier while the row renders from the tier AND
                            // `isOffCurve`, which suppressed the caption on the first free row
                            // after an off-curve one.
                            isFirstOfTier={opensRun(view.edges, index)}
                            action={
                                // No form for an id the encoder would reject. The row still reads.
                                tripleId === null ? null : (
                                    /* `border-0!` with the bang, and the bang is the point.
                                       `index.css` carries an **unlayered** `button { border: 1px
                                       solid var(--color-border) }`, and an unlayered normal
                                       declaration beats a normal one in every `@layer` — so the
                                       plain `border-0` utility, which Tailwind emits into
                                       `@layer utilities`, loses. Verified in the built CSS, not
                                       assumed: `button{border:` sits at depth 0 in
                                       `dist/assets/index-*.css`. Importance outranks layer order,
                                       so `!important` is what actually suppresses it.

                                       `rules/ui.md` names this as one of two failure classes no
                                       static check sees, and says the comment at the call site is
                                       the only defence. An earlier version of this comment
                                       described a defence that did not work, which is worse than
                                       none.

                                       The same rule sets `color` and `cursor`, so the accent text,
                                       the disabled colour and the disabled cursor each need the
                                       bang too. Without them the only difference between enabled
                                       and disabled was a missing underline — a lock nobody would
                                       notice, on the mechanism that protects a transaction in
                                       flight.

                                       `p-0` needs no bang: preflight's `button{padding:0}` is in
                                       `@layer base`, so utility and reset are both layered and the
                                       utility wins. */
                                    <button
                                        type="button"
                                        aria-expanded={isOpen}
                                        // Only while open: `children` renders only then, so the
                                        // IDREF would otherwise point at nothing.
                                        {...(isOpen ? {"aria-controls": panelId} : {})}
                                        // Every row, the open one included: its Close is what
                                        // would throw the receipt away mid-flight, and gating the
                                        // siblings instead gated the wrong button.
                                        disabled={inFlight}
                                        onClick={() => setOpenEdge(isOpen ? null : edge.tripleId)}
                                        className="border-0! p-0 text-[length:var(--text-body-sm)] text-[color:var(--color-accent)]! underline underline-offset-4 disabled:text-[color:var(--color-fg-40)]! disabled:no-underline disabled:cursor-not-allowed!"
                                    >
                                        {isOpen ? "Close" : "Take a position"}
                                    </button>
                                )
                            }
                        >
                            {isOpen && tripleId !== null ? (
                                <div id={panelId}>
                                    {/* The distribution first, the form second. A reader deciding
                                        whether to back a claim wants to know whether one account
                                        already holds most of it before they are asked for a
                                        number, and the shape read only happens for the open row —
                                        one aggregate plus a batched breadth request per term is a
                                        fan-out a whole list should not trigger. */}
                                    <EdgeShape
                                        tripleId={tripleId}
                                        curveId={session?.curveId}
                                        sessionFailed={sessionError !== null}
                                    />
                                    <StakeControl
                                        claim={{
                                            tripleId,
                                            subject,
                                            subjectIsId: edge.agent.label === null,
                                            predicate: "uses this tool",
                                            blurb: "Your deposit is the market's confidence that this agent actually used this tool.",
                                            /**
                                             * `null` when the page cannot speak for the count, not
                                             * `0`. `isOffCurve` means the vault this page reads
                                             * shows no position while the term holds real assets —
                                             * so the count on the curve a deposit targets is
                                             * genuinely unknown here, and the confirmation must say
                                             * "not reported" rather than "you would be the first".
                                             * It said the latter, two lines under a row saying
                                             * capital was behind the claim.
                                             *
                                             * The displayed count is also scoped to
                                             * `tool-usage.ts`'s hardcoded `DEFAULT_CURVE_ID` while
                                             * the deposit follows `getBondingCurveConfig()` read
                                             * from the chain. They agree on 1155 today — measured,
                                             * not guaranteed — and `tasks/23` owns closing it.
                                             */
                                            market: {
                                                support: {
                                                    positionCount: edge.isOffCurve
                                                        ? null
                                                        : edge.supportPositions,
                                                },
                                                opposition: {
                                                    positionCount: edge.isOppositionOffCurve
                                                        ? null
                                                        : edge.opposePositions,
                                                },
                                            },
                                        }}
                                        session={session}
                                        sessionError={sessionError}
                                        onSettled={onSettled}
                                        onInFlightChange={setInFlight}
                                    />
                                </div>
                            ) : undefined}
                        </UsageEdgeRow>
                    );
                })}
            </ul>
        </>
    );
}

/**
 * One claim's distribution and its curve, read only when its row is open.
 *
 * Its own component so the read is mounted by the disclosure rather than by the list: `useTermShape`
 * is `enabled` on a non-null term, and a hook called once per row would fire a request per row.
 */
function EdgeShape({
    tripleId,
    curveId,
    sessionFailed,
}: {
    tripleId: Hex;
    curveId: bigint | undefined;
    /**
     * The session read failed, so the curve will never arrive.
     *
     * Without it a failed session left `curveId` undefined forever and this rendered a pending state
     * with `aria-busy` that could not resolve: a spinner announcing itself to a screen reader
     * indefinitely, while the form directly below it correctly reported the error.
     */
    sessionFailed: boolean;
}) {
    /**
     * Nothing is read until the curve is known.
     *
     * It defaulted to 1 while the stake session loaded, then re-keyed and silently redrew with
     * different numbers once the real `defaultCurveId` arrived — and `use-stake-session.ts` says in
     * as many words that the curve is governance-configurable and today's value "is not a
     * guarantee". A figure that changes under the reader without the label changing is worse than a
     * figure that arrives late.
     */
    const query = useTermShape(curveId === undefined ? null : tripleId, Number(curveId ?? 1n));
    // Nothing rather than a spinner: the form below already says why staking is closed, and a
    // second copy of the same failure is noise.
    if (sessionFailed) return null;
    if (curveId === undefined || query.isPending) {
        return (
            <p
                aria-live="polite"
                aria-busy
                className="text-[length:var(--text-body-sm)] text-[color:var(--color-fg-60)]"
            >
                Reading this claim&rsquo;s market…
            </p>
        );
    }
    if (query.isError || query.data === undefined) {
        // Absent rather than an error block: the staking form below it still works, and a failed
        // read of a secondary reading should not look like a broken page.
        return null;
    }
    return (
        <div className="mb-6 pb-6 border-b border-[color:var(--color-border)]">
            <TermShapePanel
                shape={query.data.shape}
                curve={query.data.curve}
                curveLabel={curveLabelOf(query.data.shape.curveId)}
            />
        </div>
    );
}

/**
 * The edge's `term_id`, or `null` when it is not 32 bytes of hex.
 *
 * It arrives from the indexer typed `string`. The project already has this predicate twice
 * (`agent-trust.ts`'s `asTermId`, `use-tool-usage.ts`'s `isToolAtomId`), and casting instead of
 * checking made the two `StakeControl` call sites meet the same non-nullable `Hex` contract by
 * different means — one validated, one asserted.
 *
 * **It returns `null` and does not throw**, and the difference is the whole page. `app/src` has no
 * error boundary — `grep -rn "componentDidCatch\|getDerivedStateFromError"` finds nothing — so a
 * throw from render unmounts the tree to the root and blanks the app. A malformed id is a reason not
 * to offer the form, not a reason to take the page down; the row still reads, it just cannot be
 * staked on, which is the honest state and is what `AssessmentRow` already does for a null
 * `tripleId`.
 *
 * What the cast let through instead: the bad value reached viem, whose fixed-`bytesN` encoder throws
 * `AbiEncodingBytesSizeMismatchError` **client-side, before any RPC** — inside `handleReview`'s
 * try/catch, so it surfaced as "Nothing was staked" with a Back button. Contained, and better than
 * a throw from render. An earlier comment here said the chain would revert; it would not.
 *
 * Latent either way: no mainnet `uses` edge has been measured carrying a malformed `term_id`.
 */
function tripleIdOrNull(value: string): Hex | null {
    return /^0x[0-9a-fA-F]{64}$/.test(value) ? (value as Hex) : null;
}

/**
 * The empty state, for the overwhelming majority of atoms, which nobody has declared using.
 *
 * Not "the roughly 88,000 atoms": 88,243 is the count of ERC-8004 identities on **Base**
 * (`docs/12:10`), of which Intuition mirrors 28,648. It is not a count of Intuition-mainnet atoms,
 * and that population has not been measured. What has: **84** atoms are the object of a `uses` edge
 * on 1155 (`scripts/measure-tool-atom-shape.ts`).
 *
 * Says what would be here and how it appears, per `rules/ui.md`, and is not a pitch. It also does
 * not pretend the absence is informative: nobody declaring a tool is not evidence against it.
 *
 * **No measured figure in the copy.** A first draft said "84 of the atoms on mainnet are the object
 * of a `uses` edge" — true on 2026-10-19 (`scripts/measure-tool-atom-shape.ts`) and guaranteed to
 * rot on screen, where nobody can re-run it. The shape of the claim survives without the number.
 */
function EmptyState({atomId}: {atomId: string}) {
    return (
        <div>
            <h2 className="text-[length:var(--text-body)] font-medium">No declared uses</h2>
            <p className="mt-3 max-w-[70ch] text-[color:var(--color-fg-60)]">
                No agent has declared using{" "}
                <span className="font-mono">{truncateMiddle(atomId)}</span>. An edge appears here
                when an agent writes <span className="font-mono">(agent, uses, this atom)</span> on
                Intuition mainnet and, usually in a second transaction, deposits TRUST on that edge.
            </p>
            <p className="mt-3 max-w-[70ch] text-[color:var(--color-fg-60)]">
                An empty page says nothing about the tool. Almost every atom on the graph is in this
                state, because almost nobody has written a <span className="font-mono">uses</span>{" "}
                edge yet.
            </p>
        </div>
    );
}

/**
 * The market this page does **not** read, named once.
 *
 * A deposit can sit on the tool's own atom instead of on the `uses` edge, and 74 of the 185 mainnet
 * edges are in exactly that state (`scripts/measure-stake-vault-placement.ts`). Pricing the edge is
 * the right choice — it is the claim, it is contestable, and it is attributable (ADR `0039`) — but
 * it means "nothing staked on this claim" is not "nothing staked on this tool", and a reader will
 * take the first for the second unless told.
 */
function OtherMarket() {
    return (
        <p className="mt-10 max-w-[70ch] text-[length:var(--text-body-sm)] text-[color:var(--color-fg-60)]">
            Everything above prices the <em>claim</em> that an agent used this tool. A deposit can
            also sit on the tool's own atom — a market on the tool in general, open to anyone for
            any reason, which this page does not read and which is often the larger of the two.
        </p>
    );
}

/**
 * The scale, including the rungs this page cannot reach.
 *
 * Without it a priced assertion reads as the best evidence that exists. `docs/14`'s ladder has five
 * rungs and this data distinguishes two; saying so is cheaper than implying the other three are
 * unoccupied rather than unread.
 */
function Ladder({view}: {view: ToolUsageView}) {
    // What is actually on screen, counted rather than implied. `tierCounts` exists for this.
    // Not `ToolUsageView | null`: there is one call site and it always has a view, so the null
    // branch was unreachable.
    const counts = view.isEmpty ? null : describeCounts(view);
    return (
        <section className="mt-12 border-t border-[color:var(--color-border)] pt-6">
            <h2 className="text-[length:var(--text-label)] uppercase tracking-wider text-[color:var(--color-fg-60)]">
                What this page can and cannot know
            </h2>
            {counts === null ? null : (
                <p className="mt-3 max-w-[70ch] text-[length:var(--text-body-sm)]">{counts}</p>
            )}
            <dl className="mt-4 space-y-3 text-[length:var(--text-body-sm)]">
                {UNREACHABLE_TIERS.map((tier) => (
                    <div key={tier} className="flex flex-wrap gap-x-3">
                        <dt className="text-[color:var(--color-fg-60)] line-through">
                            {TIER_LABEL[tier]}
                        </dt>
                        <dd className="max-w-[60ch] text-[color:var(--color-fg-60)]">
                            {TIER_CAPTION[tier]} {TIER_UNREACHABLE_REASON[tier]}
                        </dd>
                    </div>
                ))}
            </dl>
            <p className="mt-4 max-w-[70ch] text-[length:var(--text-body-sm)] text-[color:var(--color-fg-60)]">
                Position counts here are scoped to one bonding curve, while the amounts are the
                term's across every curve — two different populations, which is why an edge holding
                TRUST on another curve shows as <span className="font-mono">staked off-curve</span>{" "}
                rather than as a figure. Reading the curve from the chain is the fix and it belongs
                to the connector.
            </p>
            <p className="mt-4 max-w-[70ch] text-[length:var(--text-body-sm)] text-[color:var(--color-fg-60)]">
                The three rungs struck through are <em>higher</em> on the ladder than anything this
                page can show, and nothing in this project reads them yet. Their absence here is not
                evidence that nobody is on them. What the edges carry — a priced or a free assertion
                — sits at the bottom of a scale that continues above.
            </p>
        </section>
    );
}
