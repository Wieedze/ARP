import type {CSSProperties} from "react";
import {Link} from "react-router-dom";
import type {RecentDeclaration} from "@arp-protocol/core";

import {Lines} from "../components/brand/Lines";
import {Reveal} from "../components/brand/Reveal";
import {rowMotion} from "../components/brand/row-motion";
import {SceneDeck} from "../components/brand/SceneDeck";
import {SourceField} from "../components/brand/SourceField";
import {Words} from "../components/brand/Words";
import {useScene} from "../components/brand/scene-context";
import {clamp, smooth} from "../components/brand/source-field-geometry";
import {useRecentDeclarations} from "../hooks/use-recent-declarations";
import {useDeclarationCost} from "../hooks/use-declaration-cost";
import {useChainChoice} from "../lib/chain-choice";
import {heroControlClass, linkClass} from "../lib/control-class";
import {groupRecent} from "../services/recent-declarations-view";
import {formatTrust, relativeDay, truncateMiddle} from "../services/trust-format";
import {cssVars} from "../lib/css-vars";

/**
 * `/` — the front page, as six scenes that hand over through Saffron.
 *
 * ## Where it comes from
 *
 * `arp-motion-reference/index.html` is the design base and `arp-motion-reference/MOTION-V2.md` is
 * the build contract beside it — the user's decision, 2026-10-28: _« garde tout ce qui vient de ce
 * dossier, c'est la nouvelle base »_, and _« surtout garde bien tous les textes et tout ce qui a
 * été fait dans le design »_. So **the copy here is the reference's copy**, to the word, and the
 * four ADRs `0066`–`0069` record the seven decisions it carries that were his rather than ours.
 *
 * The scenes, in order: Pulse · What you see · Why · For you · No score · Build.
 * `Fig. 02 · the evidence ladder` is gone (ADR `0069`), and so are eleven sentences listed there.
 *
 * ## Real data or nothing
 *
 * The one instruction that survives every redesign: _the ticker and the event card read real
 * declarations; if there are none, they say so, never sample data._
 *
 * So every figure comes from `getRecentDeclarations` — which filters to subjects carrying a
 * `same as` edge, an identified ERC-8004 agent rather than anybody's prose — or from the MultiVault
 * in view. Measured 2026-10-27: **mainnet returns 0, testnet returns 3.** The mainnet zero is on
 * screen and it is the honest state: nobody has run this loop yet, ARP included. It is **ARP's own
 * non-activity, not a property of the graph** (the user's correction, 2026-10-27).
 *
 * The reference's `vault-auditor`, `crytic-runner`, `0.1 TRUST` and `0.11 TRUST` are **samples and
 * do not ship**. Scene 2's two cards are built from the one query the page already makes, grouped
 * two ways, and say there is nothing when there is nothing.
 */
/**
 * The rail's names, in scene order. `MOTION-V2.md` §3's own headings for the six.
 *
 * Here and not in the deck: a name belongs beside the scene it describes, and the deck has no
 * business knowing what its scenes are about.
 */
const SCENE_NAMES = ["Pulse", "What you see", "Why", "For you", "No score", "Build"] as const;

/**
 * How many declarations the page asks for.
 *
 * Named, because the hero prints the count and a page of 8 is not a chain's total. Latent today —
 * mainnet returns 0 and testnet 3 — and a wrong number the first time either chain has 8.
 */
const RECENT_LIMIT = 8;

/**
 * What a read can be, as four states rather than two booleans (`rules/code.md`).
 *
 * The fourth is the one that mattered: **`error` is not `empty`.** `recentQueryOptions` sets
 * `retry: 0`, so one transient GraphQL failure gives `isPending === false` and `data === undefined`
 * — and a page reading only those two printed "No declaration on this chain yet. Nobody has run the
 * loop here, including us." That sentence is this page's most load-bearing claim and it was being
 * derived from a failed request: an assertion about the chain with no answer from the chain behind
 * it. `rules/claims.md` §1 — say what you measured, and a read that did not complete measured
 * nothing.
 */
type Read<T> = {status: "pending"} | {status: "failed"} | {status: "ok"; data: T};

function readOf<T>(query: {isPending: boolean; isError: boolean; data: T | undefined}): Read<T> {
    if (query.isPending) return {status: "pending"};
    if (query.isError || query.data === undefined) return {status: "failed"};
    return {status: "ok", data: query.data};
}

export function Landing() {
    const chain = useChainChoice();
    const recent = useRecentDeclarations(RECENT_LIMIT);
    const cost = useDeclarationCost();

    const read = readOf(recent);
    // An em dash until the chain answers. A placeholder figure here would be the copy this read
    // exists to remove — and **one figure, used at both sites**, because the page carried this
    // number twice and only one copy was corrected: the act card said `0.1 TRUST` with the chain's
    // symbol interpolated beside it, which looked chain-aware while staying fixed. On testnet the
    // two sites were 100× apart, eleven inches apart on screen (`rules/claims.md` §5).
    const floor = cost.data === undefined ? "—" : `${formatTrust(cost.data.floor)} ${chain.symbol}`;
    // The **fee**, not the floor, for the first beat of Fig. 02. That beat says the money does not
    // come back, and only the fee half is: the floor is fee + deposit and the deposit is
    // redeemable. Printing the floor there called a redeemable deposit non-recoverable.
    const fee = cost.data === undefined ? "—" : `${formatTrust(cost.data.fee)} ${chain.symbol}`;

    return (
        <SceneDeck names={SCENE_NAMES}>
            <ScenePulse read={read} />
            <SceneRecord read={read} />
            <SceneWhy fee={fee} />
            <SceneJobs floor={floor} />
            <SceneManifesto />
            <SceneBuild />
        </SceneDeck>
    );
}

/* -------------------------------------------------------------------------- */
/* Scene 1 — Pulse                                                            */
/* -------------------------------------------------------------------------- */

/**
 * The hero.
 *
 * **No frame, and no inset.** It was a bordered card with `clamp(24px,5vw,64px)` of padding, so its
 * headline began 65px to the right of every other heading on the page — measured at 1920px, h1 at
 * 388 against 323 everywhere else. The user read that as _« tout est dans des cadres »_ and he was
 * describing a real misalignment, not a preference.
 *
 * **The full-width ticker is gone** (ADR `0069`): it covered the field, and the newest declaration
 * is already in the beat card. The beat card moved out of the field's corner and into the left
 * column under the call to action, for the same reason.
 */
function ScenePulse({read}: {read: Read<RecentDeclaration[]>}) {
    const {pinned} = useScene();

    return (
        <section className="relative">
            {/* Stacked, the field lives here and carries its own bleed past the shell to the
                viewport edge, so the page runs to the edge rather than stopping in a dead margin.
                **No wrapper**: `50%` in the canvas's width has to resolve against this section or
                the bleed is applied twice and the page scrolls sideways. Pinned, the field is a
                fixed full-viewport canvas owned by the deck's stage and this renders nothing. */}
            {pinned ? null : <SourceField pinned={false} progress={0} />}

            {/* The copy sits in a 40rem column at the lower left, as the reference does. It was the
                full width of the hero, which put an 88px headline straight across the field's rings
                and made both unreadable. Below 900px the field is above the copy instead of behind
                it, so the column pads itself down by the field's 320px. */}
            <div className="relative flex max-w-[min(40rem,44vw)] flex-col justify-end gap-6 max-[900px]:max-w-full max-[900px]:pt-[320px]">
                <Reveal fade>
                    <p className="font-mono text-[length:var(--text-label)] uppercase tracking-[0.08em] text-[color:var(--color-steel)]">
                        ARP · Agent Reputation Protocol
                    </p>
                </Reveal>
                <h1 className="type-face text-[clamp(36px,4.4vw,60px)]">
                    <Words text="The reputation pulse for autonomous agents and tools." />
                </h1>
                {/* One move after the title, with no stagger inside it — the answer to a headline
                    is one sentence, and staggering it would read as a second headline. */}
                <Reveal index={1} afterMs={AFTER_TITLE}>
                    <p className="max-w-[44ch] text-[length:18px] leading-[1.45] text-[color:var(--color-silver)]">
                        Every beat is someone paying to say what they saw.
                    </p>
                </Reveal>
                <Reveal index={1} afterMs={AFTER_TITLE}>
                    <div className="flex flex-wrap items-center gap-5">
                        <Link to="/agents" className={heroControlClass}>
                            Open the agent index
                        </Link>
                        <a href="#build" className={`font-mono text-[12px] ${linkClass}`}>
                            or build against it →
                        </a>
                    </div>
                </Reveal>
                <Reveal fade index={2} afterMs={AFTER_TITLE + 160}>
                    <Beat read={read} />
                </Reveal>
            </div>
        </section>
    );
}

/**
 * How long the hero's answer waits for its title, in ms.
 *
 * The reference measures the h1's real total and subtracts 160ms so the two overlap slightly. Here
 * it is a constant, because the measurement lives inside `Words` and reaching back out for it would
 * couple the page to the component's internals for 50ms of precision. `--stagger-ceiling` is 560 and
 * `--word-rise` is 380, so the title's worst case is 940ms; this is that, less the same overlap.
 */
const AFTER_TITLE = 780;

/**
 * The newest declaration, under the call to action.
 *
 * Real or absent. The reference shows `0.10 TRUST · vault-auditor uses github.com/crytic/slither`
 * as sample data; on mainnet today the honest version of that card is empty, and saying so is the
 * page's most load-bearing sentence.
 */
function Beat({read}: {read: Read<RecentDeclaration[]>}) {
    const chain = useChainChoice();
    const rows = read.status === "ok" ? read.data : [];
    const newest = rows[0];

    return (
        <div
            aria-live="polite"
            className="flex min-w-[min(20rem,70vw)] max-w-[26rem] flex-col gap-1 rounded-[var(--radius-button)] border border-[color:var(--color-rule-strong)] bg-[color:var(--color-bg)]/90 px-3.5 py-3"
        >
            <span className="flex items-center gap-2 border-b border-[color:var(--color-rule)] pb-2 font-mono text-[10px] uppercase tracking-[0.06em] text-[color:var(--color-steel)]">
                <Dot on={rows.length > 0} />
                {/* `8+` at the cap, because the query asks for a page and the label says "on this
                    chain": printing a full page as the chain's total is a wrong number dressed as
                    a measurement. An em dash covers both a read in flight and one that failed. */}
                Pulse ·{" "}
                {read.status !== "ok"
                    ? "—"
                    : rows.length === RECENT_LIMIT
                      ? `${RECENT_LIMIT}+`
                      : rows.length}{" "}
                on {chain.label.toLowerCase()}
            </span>
            {read.status === "pending" ? (
                <span className="font-mono text-[10px] text-[color:var(--color-steel)]">
                    reading…
                </span>
            ) : read.status === "failed" ? (
                <>
                    <span className="text-[13px] text-[color:var(--color-fg)]">
                        The graph did not answer.
                    </span>
                    <span className="font-mono text-[10px] text-[color:var(--color-steel)]">
                        This is a read that failed, not an empty chain.
                    </span>
                </>
            ) : newest === undefined ? (
                <>
                    <span className="text-[13px] text-[color:var(--color-fg)]">
                        No declaration on this chain yet.
                    </span>
                    <span className="font-mono text-[10px] text-[color:var(--color-steel)]">
                        Nobody has run the loop here, including us.
                    </span>
                </>
            ) : (
                <>
                    <span className="font-mono text-[10px] text-[color:var(--color-steel)]">
                        Declared use · {relativeDay(newest.at)}
                    </span>
                    {/* **Paper, not accent.** This is the newest declaration's deposit — somebody
                        else's position — and `rules/ui.md` spends the accent on the primary
                        action, the selected state and **the viewer's own** position. Carried over
                        from the page this replaced, where it was Saffron; ADR `0067`'s third
                        condition says a figure never wears it decoratively, and that condition
                        would have been false of its own page on the first chain with a position. */}
                    <strong className="type-face text-[20px]">
                        {newest.assets === null
                            ? "no position"
                            : `${formatTrust(newest.assets)} ${chain.symbol}`}
                    </strong>
                    <span className="text-[13px] text-[color:var(--color-fg)]">
                        {label(newest.subject)} uses {label(newest.object)}
                    </span>
                </>
            )}
        </div>
    );
}

/* -------------------------------------------------------------------------- */
/* Scene 2 — What you see                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Two readers of the same record.
 *
 * The user's own framing, 2026-10-28: _« ce qui fait bouger les gens c'est les tools, choisir un
 * agent, et voir quels tools sont utilisés. »_ One card for somebody choosing an agent, one for
 * somebody whose tool is the thing being chosen.
 *
 * **Both are built from the recent-declarations query**, grouped two ways — by subject for the
 * agent card, by object for the tool card. The reference's names are samples; grouping one query
 * the page already makes is what keeps this real without a second round trip, and it is the only
 * read on this page that needs no route parameter. A tool's or an agent's full record is on its own
 * page, where there is an id to ask about.
 */
function SceneRecord({read}: {read: Read<RecentDeclaration[]>}) {
    const declarations = read.status === "ok" ? read.data : [];
    const {agent, tool} = groupRecent(declarations);

    return (
        <section>
            <SceneHead
                lines={[
                    {text: "See what every agent runs on."},
                    {text: "Choose by its tools. Earn as yours spreads.", dim: true},
                ]}
                figure="Fig. 01 · two ways to read the record"
            />
            <div className="grid gap-5 lg:grid-cols-2">
                <Reveal index={2} className="flex">
                    <PeekCard
                        label="Choosing an agent"
                        name={agent === null ? null : label(agent.key)}
                        href={agent === null ? null : `/atom/${agent.key.atomId}`}
                        rows={
                            agent === null
                                ? []
                                : agent.rows.map((row, index) => ({
                                      key: row.tripleId,
                                      // Proven is a position behind the claim, not the claim. ADR
                                      // `0042`: every term is born with `minShare`, so the test is
                                      // `positions`, never the amount.
                                      filled: row.positions > 0,
                                      name: label(row.object),
                                      note: row.positions > 0 ? "used · proven" : "declared only",
                                      index,
                                  }))
                        }
                        empty="No agent has declared using anything here yet."
                        read={read}
                        foot="What it says it uses, and what it paid to prove. Then rate it, at a price."
                    />
                </Reveal>
                <Reveal index={3} className="flex">
                    <PeekCard
                        label="Your tool or your skill"
                        name={tool === null ? null : label(tool.key)}
                        href={tool === null ? null : `/atom/${tool.key.atomId}`}
                        rows={
                            tool === null
                                ? []
                                : tool.rows.map((row, index) => ({
                                      key: row.tripleId,
                                      filled: row.positions > 0,
                                      name: label(row.subject),
                                      note: `declared use · ${relativeDay(row.at)}`,
                                      index,
                                  }))
                        }
                        empty="No tool has been declared here yet."
                        read={read}
                        foot="Every agent that paid to say it used it, and when. List it first and hold a position: each agent that backs it after you pays more on the curve."
                    />
                </Reveal>
            </div>
        </section>
    );
}

type PeekRow = {key: string; filled: boolean; name: string; note: string; index: number};

function PeekCard({
    label: cardLabel,
    name,
    href,
    rows,
    empty,
    read,
    foot,
}: {
    label: string;
    name: string | null;
    href: string | null;
    rows: readonly PeekRow[];
    empty: string;
    read: Read<unknown>;
    foot: string;
}) {
    // Three sentences for three different facts, and conflating the last two is the defect this
    // card shipped with: a failed read is not an empty chain.
    const nothing =
        read.status === "pending"
            ? "reading the graph…"
            : read.status === "failed"
              ? "The graph did not answer. This is a read that failed, not an empty chain."
              : empty;
    return (
        <article className="flex flex-1 flex-col gap-4 rounded-[var(--radius-card)] border border-[color:var(--color-rule)] p-5">
            <header className="flex flex-col gap-2 border-b border-[color:var(--color-rule)] pb-4">
                <span className="font-mono text-[length:var(--text-label)] uppercase tracking-[0.08em] text-[color:var(--color-steel)]">
                    {cardLabel}
                </span>
                {name === null ? (
                    <span className="type-face text-[20px] text-[color:var(--color-steel)]">
                        {read.status === "pending"
                            ? "reading…"
                            : read.status === "failed"
                              ? "unknown"
                              : "nothing yet"}
                    </span>
                ) : href === null ? (
                    <span className="type-face break-all text-[20px]">{name}</span>
                ) : (
                    // **Paper and underlined, not silver.** `index.css`'s unlayered
                    // `a { color: var(--color-silver) }` repaints any link that sets no colour of
                    // its own, so this slot was paper when there was nothing to link to and a step
                    // dimmer — with no underline either — exactly when it became clickable. The
                    // bang is what beats the base rule; `linkClass` carries the affordance.
                    <Link
                        to={href}
                        className={`type-face break-all text-[20px] text-[color:var(--color-fg)]! ${linkClass}`}
                    >
                        {name}
                    </Link>
                )}
            </header>
            {rows.length === 0 ? (
                <p className="font-mono text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]">
                    {nothing}
                </p>
            ) : (
                <ul className="flex flex-col">
                    {rows.map((row) => {
                        const motion = rowMotion(row.index);
                        return (
                            <li
                                key={row.key}
                                style={motion.style}
                                className={`${motion.className} flex items-center gap-3 border-b border-[color:var(--color-rule)] py-2.5 text-[length:var(--text-body-sm)] last:border-b-0`}
                            >
                                <Dot on={row.filled} />
                                <span className="min-w-0 flex-1 break-all">{row.name}</span>
                                <span className="shrink-0 font-mono text-[11px] text-[color:var(--color-steel)]">
                                    {row.note}
                                </span>
                            </li>
                        );
                    })}
                </ul>
            )}
            <p className="mt-auto font-mono text-[11px] leading-[1.6] text-[color:var(--color-steel)]">
                {foot}
            </p>
        </article>
    );
}

/* -------------------------------------------------------------------------- */
/* Scene 3 — Why                                                              */
/* -------------------------------------------------------------------------- */

/**
 * How a reputation grows, as three steps and one picture.
 *
 * Every line names a mechanism that exists, not a projection: the fee is read off the chain, the
 * position is a vault deposit anyone can redeem, and the price moving with deposits is the bonding
 * curve Intuition already runs. **No figure here is a return.**
 */
function SceneWhy({fee}: {fee: string}) {
    return (
        <section>
            <SceneHead
                lines={[
                    {text: "Your agent uses something."},
                    {text: "Others follow. Both reputations grow.", dim: true},
                ]}
                figure="Fig. 02 · how a reputation grows"
            />
            <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
                <ol className="flex flex-col">
                    {stepsFor(fee).map((step, index) => (
                        <Reveal key={step.n} index={2 + index * 3}>
                            <li className="grid grid-cols-[3rem_minmax(0,1fr)] items-baseline gap-4 border-b border-[color:var(--color-rule)] py-5">
                                <span className="font-mono text-[length:var(--text-label)] text-[color:var(--color-steel)]">
                                    {step.n}
                                </span>
                                <div className="flex flex-col gap-1.5">
                                    <h3 className="type-face text-[20px]">{step.name}</h3>
                                    <p className="text-[length:var(--text-body-sm)] text-[color:var(--color-silver)]">
                                        {step.line}
                                    </p>
                                </div>
                            </li>
                        </Reveal>
                    ))}
                    <Reveal fade index={11}>
                        <p className="pt-4 font-mono text-[11px] text-[color:var(--color-steel)]">
                            Run several agents? Each one builds its own record.
                        </p>
                    </Reveal>
                </ol>
                <Reveal fade index={2}>
                    <GrowthDiagram />
                </Reveal>
            </div>
        </section>
    );
}

/**
 * An illustrative diagram, and the one place on this page that draws rather than reads.
 *
 * It is a **picture of the mechanism**, not a chart of data, and it has to stay that way: there is
 * no series on any chain that this would be a plot of. Your agent arrives first — the one warm dot,
 * which is `rules/ui.md`'s "the viewer's own position" and so needs no exception — then five others
 * arrive and do the same. The white staircase is the tool's record; the Saffron curve is the
 * position you took before any of them.
 *
 * The `aria-label` carries the whole of it, because a reader who cannot see it still needs the
 * argument the scene is making.
 */
function GrowthDiagram() {
    const others = [164, 248, 332, 416, 500];
    return (
        <svg
            viewBox="0 0 720 300"
            role="img"
            aria-label="Your agent arrives first and takes a position on a tool. Five other agents arrive after it and do the same. With each arrival the tool's reputation steps up, and your position grows with it."
            className="w-full"
        >
            <line
                x1="60"
                y1="250"
                x2="520"
                y2="250"
                stroke="var(--color-rule-strong)"
                strokeWidth="1"
            />
            <path
                className="arp-draw"
                d="M60 250 H80 V222.1 H164 V199.2 H248 V171.3 H332 V138.5 H416 V100.8 H500 V59.8 H520"
                fill="none"
                stroke="var(--color-fg)"
                strokeWidth="2"
                style={cssVars({
                    "--draw-length": 1400,
                    "--draw-at": "600ms",
                    "--draw-for": "3200ms",
                })}
            />
            <path
                className="arp-draw"
                d="M80 232.0 L164 227.0 L248 220.5 L332 212.3 L416 202.4 L500 191.0 L520 187.7"
                fill="none"
                stroke="var(--color-accent)"
                strokeWidth="2"
                style={cssVars({
                    "--draw-length": 700,
                    "--draw-at": "900ms",
                    "--draw-for": "2900ms",
                })}
            />
            <text
                className="arp-pop fill-[var(--color-fg)] font-mono text-[11px]"
                x="530"
                y="63.8"
                style={cssVars({"--draw-at": "3600ms"})}
            >
                {"the tool's reputation"}
            </text>
            <text
                className="arp-pop fill-[var(--color-accent)] font-mono text-[11px]"
                x="530"
                y="191.7"
                style={cssVars({"--draw-at": "3700ms"})}
            >
                your position
            </text>
            <circle
                className="arp-pop"
                cx="80"
                cy="250"
                r="7"
                fill="var(--color-accent)"
                style={cssVars({"--draw-at": "600ms"})}
            />
            <text
                className="arp-pop fill-[var(--color-steel)] font-mono text-[11px]"
                x="80"
                y="278"
                textAnchor="middle"
                style={cssVars({"--draw-at": "600ms"})}
            >
                your agent
            </text>
            {others.map((x, index) => (
                <circle
                    key={x}
                    className="arp-pop"
                    cx={x}
                    cy="250"
                    r="6"
                    fill="var(--color-silver)"
                    style={{"--draw-at": `${1120 + index * 520}ms`} as CSSProperties}
                />
            ))}
            <text
                className="arp-pop fill-[var(--color-steel)] font-mono text-[11px]"
                x="332"
                y="278"
                textAnchor="middle"
                style={cssVars({"--draw-at": "2160ms"})}
            >
                other agents arrive and do the same
            </text>
        </svg>
    );
}

/* -------------------------------------------------------------------------- */
/* Scene 4 — For you                                                          */
/* -------------------------------------------------------------------------- */

/**
 * The four jobs, reading first because reading is free.
 *
 * It replaces "Three ways to add a beat", whose three acts all required a wallet under the heading
 * "Each one costs you something" — a page whose first offer costs money has asked for a commitment
 * before it has shown anything (ADR `0069`).
 *
 * **`be hired` promises nothing.** ADR `0060` took hire and pay out of scope: ARP records a use, it
 * does not broker one. The card says other agents can find yours and call it, and that ARP hosts
 * nothing. It may not say more than that.
 */
function SceneJobs({floor}: {floor: string}) {
    return (
        <section>
            <SceneHead
                lines={[{text: "Start by reading."}, {text: "It costs nothing.", dim: true}]}
                figure="Fig. 03 · four things you can do"
            />
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
                {jobsFor(floor).map((job, index) => (
                    <Reveal key={job.n} index={2 + index} className="flex">
                        <article
                            className={`flex flex-1 flex-col gap-4 rounded-[var(--radius-card)] border p-5 ${
                                job.primary
                                    ? "border-[color:var(--color-accent)]"
                                    : "border-[color:var(--color-rule)]"
                            }`}
                        >
                            <span className="font-mono text-[length:var(--text-label)] uppercase tracking-[0.08em] text-[color:var(--color-steel)]">
                                {job.n}
                            </span>
                            <h3 className="type-face text-[20px]">{job.title}</h3>
                            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 font-mono text-[length:var(--text-body-sm)]">
                                {job.terms.map(([term, value]) => (
                                    <div key={term} className="contents">
                                        <dt className="text-[color:var(--color-steel)]">{term}</dt>
                                        {/* The one figure on this page that wears the accent. It
                                            is the primary action's own cost, inside the primary
                                            action's own card, which is what `rules/ui.md` spends
                                            the accent on — and the reference puts it here too. */}
                                        <dd
                                            className={`text-right ${
                                                job.primary && term === "Costs from"
                                                    ? "text-[color:var(--color-accent)]"
                                                    : ""
                                            }`}
                                        >
                                            {value}
                                        </dd>
                                    </div>
                                ))}
                            </dl>
                            <Link
                                to={job.to}
                                className={`mt-auto text-[length:var(--text-body-sm)] ${linkClass}`}
                            >
                                {job.cta} →
                            </Link>
                        </article>
                    </Reveal>
                ))}
            </div>
        </section>
    );
}

/* -------------------------------------------------------------------------- */
/* Scene 5 — No score                                                         */
/* -------------------------------------------------------------------------- */

/**
 * ADR `0046` as a statement rather than a footnote.
 *
 * The three lines light from grey to paper as the scroll crosses the scene, one after another —
 * which is the one effect on this page that is scrubbed rather than triggered, because the sentence
 * is a list and reading it is the animation.
 *
 * "ARP has no opinion about any agent" and "Every number is somebody's deposit" are **gone** (ADR
 * `0069`): both answered an objection the reader has not raised. What replaces them states the
 * positive instead of denying a negative.
 */
function SceneManifesto() {
    const {progress, index, pinned} = useScene();

    // Lit across the first part of the scene's hold, one line after another. Stacked there is no
    // scrubbing to do, so every line is lit — the composition, still, which is what
    // `prefers-reduced-motion` asks for and what a reader who never scrolls here gets.
    const reached = pinned
        ? clamp((progress - (index - 0.42)) / 0.34) * MANIFESTO.length
        : Infinity;

    return (
        <section className="text-center">
            {/* The size is on each line rather than on the paragraph, and written out in both
                branches rather than hoisted into a constant. Two reasons, both load-bearing:
                the grey line's 3.84:1 is only allowed on display type, so a component whose
                contrast depends on an ancestor — or on a constant four lines away — is one
                refactor from failing, and `check:contrast` deliberately reads a short window
                around the call site so that the evidence sits with the claim.

                `clamp(36px, 5.4vw, 72px)` is the reference's own figure, not `--text-display`'s
                `clamp(44px, 6.4vw, 88px)`. This is the scene most likely to overflow a 680px-tall
                pinned stage, and the stage is `overflow-hidden`, so it clips in silence. */}
            <p className="mx-auto max-w-[22ch]">
                {MANIFESTO.map((line, lineIndex) => (
                    <span
                        key={line.text}
                        className={
                            line.lights
                                ? "type-face block text-[clamp(36px,5.4vw,72px)] leading-[1.02] arp-lit"
                                : "type-face block text-[clamp(36px,5.4vw,72px)] leading-[1.02] text-[color:var(--color-grey)]"
                        }
                        style={
                            line.lights
                                ? cssVars({"--lit": smooth(clamp(reached - lineIndex)).toFixed(3)})
                                : undefined
                        }
                    >
                        {line.text}
                    </span>
                ))}
            </p>
        </section>
    );
}

/**
 * `lights: false` on the middle line is the design, not an omission.
 *
 * `MOTION-V2.md` §3 scene 5 marks it **grey** where the other two light, and the reference enforces
 * it with a class of its own — `.manifesto .stay` against `.manifesto .lit`. So the sentence reads
 * as two statements with a quiet one between them rather than three that all arrive together.
 *
 * `--color-grey` is 3.84:1 and allowed here because `type-display` floors at 44px (`rules/ui.md`:
 * dim **display** text only, never body copy).
 */
const MANIFESTO = [
    {text: "No score. No grade. No stars.", lights: true},
    {text: "Just what agents really use.", lights: false},
    {text: "On the record, for anyone to check.", lights: true},
] as const;

/* -------------------------------------------------------------------------- */
/* Scene 6 — Build                                                            */
/* -------------------------------------------------------------------------- */

/**
 * The usual way against ARP's.
 *
 * "No API key. No indexer." said nothing on its own, so each line is now a fact with its opposite
 * beside it — the README's "Build against ARP" and ADR `0045`'s invariant, which is the request
 * path and not the runtime.
 *
 * `@arp-protocol/core` is named without `npm`, deliberately: **the package is not published.**
 */
function SceneBuild() {
    return (
        <section id="build" className="scroll-mt-24">
            <SceneHead
                lines={[
                    {text: "Plug in without asking anyone."},
                    {text: "It lives on a public chain, not on our servers.", dim: true},
                ]}
                figure="Fig. 04 · build against it"
            />
            <div className="grid gap-5 lg:grid-cols-2">
                {COLUMNS.map((column, columnIndex) => (
                    <Reveal key={column.label} index={2 + columnIndex} className="flex">
                        <div
                            className={`flex flex-1 flex-col gap-4 rounded-[var(--radius-card)] border p-5 ${
                                column.ours
                                    ? "border-[color:var(--color-rule-strong)]"
                                    : "border-[color:var(--color-rule)]"
                            }`}
                        >
                            <span className="font-mono text-[length:var(--text-label)] uppercase tracking-[0.08em] text-[color:var(--color-steel)]">
                                {column.label}
                            </span>
                            <ul className="flex flex-col">
                                {column.lines.map((line) => (
                                    <li
                                        key={line}
                                        className={`flex items-start gap-3 border-b border-[color:var(--color-rule)] py-3 text-[length:var(--text-body-sm)] last:border-b-0 ${
                                            column.ours
                                                ? "text-[color:var(--color-fg)]"
                                                : "text-[color:var(--color-steel)]"
                                        }`}
                                    >
                                        {/* The only `items-start` row, and the only one that
                                            wants the optical nudge: it aligns the dot to the
                                            first text line. The two `items-center` rows are
                                            already centred and it pushed them 7px below. */}
                                        <Dot on={column.ours} className="mt-[7px]" />
                                        {line}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </Reveal>
                ))}
            </div>
            <Reveal index={4} className="mt-8">
                <div className="flex flex-wrap items-center gap-5 border-t border-[color:var(--color-rule)] pt-8">
                    <Link to="/agents" className={heroControlClass}>
                        Open the agent index
                    </Link>
                    <a
                        href="https://github.com/Wieedze/ARP/blob/main/skills/arp/SKILL.md"
                        target="_blank"
                        rel="noreferrer"
                        className={`font-mono text-[12px] ${linkClass}`}
                    >
                        Read the skill, nothing to install →
                    </a>
                    <code className="ml-auto font-mono text-[11px] text-[color:var(--color-steel)]">
                        @arp-protocol/core
                    </code>
                </div>
            </Reveal>
        </section>
    );
}

const COLUMNS = [
    {
        label: "The usual way",
        ours: false,
        lines: [
            "Ask a company for an API key",
            "Depend on its servers and its indexer",
            "Trust the score it hands back",
            "Lose everything if it shuts down",
        ],
    },
    {
        label: "With ARP",
        ours: true,
        lines: [
            "One package, or just read the skill",
            "Read the chain directly, no key, no account",
            "Check every figure yourself: each one is a deposit",
            "Unplug ARP's servers: every read and declaration still works",
        ],
    },
] as const;

/* -------------------------------------------------------------------------- */
/* Shared                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * A scene's heading: two authored lines, and the figure label beside them.
 *
 * The label is a `Reveal fade` rather than a sliding one — at 11px an eyebrow that moves reads as
 * misaligned with the title it belongs to.
 */
function SceneHead({
    lines,
    figure,
}: {
    lines: readonly {text: string; dim?: boolean}[];
    figure: string;
}) {
    return (
        <div className="mb-8 flex flex-wrap items-end justify-between gap-6">
            {/* No size and no face class here: `Lines` carries `type-section`, so the dim line
                is above the large-text contrast floor by construction rather than by this
                element remembering to set one. */}
            <h2>
                <Lines lines={lines} />
            </h2>
            <Reveal fade index={2}>
                <span className="font-mono text-[length:var(--text-label)] uppercase tracking-[0.06em] text-[color:var(--color-steel)]">
                    {figure}
                </span>
            </Reveal>
        </div>
    );
}

/**
 * The 6px dot that carries proven-versus-declared everywhere on this page.
 *
 * Filled means a position stands behind the claim. ADR `0042`: every term is born with `minShare`,
 * so the test is `positionCount`, never the amount — a dot driven by a balance would be lit for
 * every row on the chain.
 */
function Dot({on, className = ""}: {on: boolean; className?: string}) {
    return (
        <span
            aria-hidden="true"
            className={`h-[6px] w-[6px] shrink-0 rounded-full ${
                on ? "bg-[color:var(--color-fg)]" : "border border-[color:var(--color-rule-strong)]"
            } ${className}`}
        />
    );
}

function label(end: {atomId: string; label: string | null}): string {
    return end.label ?? truncateMiddle(end.atomId, 8, 6);
}

/** The three beats of Fig. 02. The fee is the chain's, read at call time. */
function stepsFor(fee: string) {
    return [
        {
            n: "01",
            name: "Your agent uses a tool",
            line: `It says so on chain: a ${fee} fee that does not come back, its address on it for good.`,
        },
        {
            n: "02",
            name: "It takes a position",
            line: "TRUST into the tool's vault. Not a payment to anyone: it stays yours, withdraw it whenever you want.",
        },
        {
            n: "03",
            name: "Others arrive and do the same",
            line: "Each deposit after yours is priced higher on the curve. The tool's record grows, and so does your agent's, which backed it first.",
        },
    ] as const;
}

/**
 * The four jobs of Fig. 03. Each one is a page that exists — a card for a job nobody can do would
 * be a brochure.
 *
 * `declare` takes the cost because **the cost is a chain fact, not a copy**. It says **from**,
 * because a declaration also pays `getAtomCost()` for any of the three atoms that does not exist
 * yet, and it is the fee **plus** `minDeposit`: the fee alone seeds a term with `minShare` and zero
 * positions (ADR `0053`), so calling the fee the floor understates it by half on testnet.
 */
function jobsFor(floor: string) {
    return [
        {
            n: "01 · check",
            title: "See who paid to stand behind an agent or a tool",
            primary: false,
            to: "/agents",
            cta: "Open the index",
            terms: [
                ["Needs", "nothing"],
                ["Wallet", "no"],
            ],
        },
        {
            n: "02 · declare",
            title: "Say what your agent used",
            primary: true,
            to: "/tools",
            cta: "Find a tool",
            terms: [
                ["Costs from", floor],
                ["Needs", "wallet + ERC-8004 id"],
            ],
        },
        {
            n: "03 · list",
            title: "Add a tool that is not listed yet",
            primary: false,
            to: "/register",
            cta: "Add a tool",
            terms: [
                ["You give", "its URL"],
                ["Needs", "a wallet with TRUST"],
            ],
        },
        {
            n: "04 · be hired",
            title: "Let other agents find yours and call it",
            primary: false,
            to: "/agent",
            cta: "Your agent",
            terms: [
                ["Needs", "an endpoint you run"],
                ["ARP hosts", "nothing"],
            ],
        },
    ] as const satisfies readonly {
        n: string;
        title: string;
        primary: boolean;
        to: string;
        cta: string;
        terms: readonly (readonly [string, string])[];
    }[];
}
