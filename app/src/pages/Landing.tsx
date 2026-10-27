import {Link} from "react-router-dom";
import type {RecentDeclaration} from "@arp-protocol/core";

import {PulseField} from "../components/brand/PulseField";
import {useAgentCohort} from "../hooks/use-agent-cohort";
import {useRecentDeclarations} from "../hooks/use-recent-declarations";
import {useTripleCost} from "../hooks/use-triple-cost";
import {useChainChoice} from "../lib/chain-choice";
import {heroControlClass, linkClass} from "../lib/control-class";
import {formatTrust, truncateMiddle} from "../services/trust-format";

/**
 * `/` — the front page.
 *
 * Built from `arp-design-handoff/arp-design-handoff 2/reference/landing.html`, which the handoff
 * marks **approved as final**. The headline is the designer's, not mine: _"The reputation pulse for
 * autonomous agents and tools."_
 *
 * ## Real data or nothing
 *
 * The handoff's own instruction, and the thing that makes this page hard: _"the ticker and event
 * card read real declarations; if there are none, they say so, never sample data."_
 *
 * So the beat count, the ticker and the hero's field all come from `getRecentDeclarations`, which
 * filters to subjects carrying a `same as` edge — an identified ERC-8004 agent rather than
 * anybody's prose. Measured 2026-10-27: **mainnet returns 0, testnet returns 3.**
 *
 * The mainnet zero is on screen, and it is the honest state: nobody has run this loop yet, ARP
 * included. It is **ARP's own non-activity, not a property of the graph** (the user's correction,
 * 2026-10-27), and the page says so in one line rather than hiding it behind a sample.
 *
 * ## Four things the reference has that this does not
 *
 * - **Three.js.** The hero is `PulseField`, Canvas 2D and no dependency — the same idea at about
 *   eighty lines against ~600kB, which `rules/ui.md`'s bundle rule exists to ask about.
 * - **A click that sends a stake wave.** The pulse is a clock. `rules/ui.md`: no mouse-reactive
 *   effects, and a hero that invents a stake on click would be the page's one false claim.
 * - **"SAID FOR FREE" and "PAID TO SAY"** as column headers. The user cut that vocabulary on sight
 *   — _« ça rime à rien, c'est vraiment pas clair et je pense que c'est inutile »_. The columns are
 *   labelled by what they **cost**, which is the fact the section is about.
 * - **"1,204 beats this week."** There is no graph-wide weekly aggregate to read, so the figure
 *   would be invented. The count is of declarations that exist, and it says so.
 */
export function Landing() {
    const chain = useChainChoice();
    const recent = useRecentDeclarations(8);
    const cohort = useAgentCohort("economic-conviction", 0);
    const tripleCost = useTripleCost();

    const declarations = recent.data ?? [];
    const backed = declarations.filter((row) => row.positions > 0).length;
    // An em dash until the chain answers. A placeholder figure here would be the copy this read
    // exists to remove.
    const acts = actsFor(
        tripleCost.data === undefined ? "—" : `${formatTrust(tripleCost.data)} ${chain.symbol}`,
    );

    return (
        <>
            <section className="relative mt-6 overflow-hidden rounded-[var(--radius-card)] border border-[color:var(--color-rule)]">
                <div className="absolute inset-0">
                    <PulseField beats={declarations.length} backed={backed} />
                </div>

                {/* The copy sits in a 40rem column at the lower left, as the reference does. It
                    was the full width of the hero, which put an 88px headline straight across the
                    field's rings and made both unreadable. */}
                <div className="relative flex min-h-[min(72vh,38rem)] max-w-[40rem] flex-col justify-end gap-6 p-[clamp(24px,5vw,64px)]">
                    <p className="font-mono text-[length:var(--text-label)] uppercase tracking-[0.08em] text-[color:var(--color-steel)]">
                        ARP · Agent Reputation Protocol
                    </p>
                    <h1 className="type-face text-[clamp(36px,4.4vw,60px)]">
                        The reputation pulse for autonomous agents and tools.
                    </h1>
                    <p className="max-w-[44ch] text-[length:18px] leading-[1.45] text-[color:var(--color-silver)]">
                        Every beat is someone paying to say what they saw.
                    </p>
                    <div className="flex flex-wrap items-center gap-5">
                        <Link to="/agents" className={heroControlClass}>
                            Open the agent index
                        </Link>
                        <a href="#build" className={`font-mono text-[12px] ${linkClass}`}>
                            or build against it →
                        </a>
                    </div>
                </div>

                <Beat declarations={declarations} isPending={recent.isPending} />
            </section>

            <Ticker declarations={declarations} isPending={recent.isPending} />

            {/* The one rule, and the only section that argues rather than reports. */}
            <Section
                figure="Fig. 01 · the one rule"
                title="Free claims go down."
                dim="Paid claims go up."
            >
                <div className="grid border-t border-[color:var(--color-rule-strong)] md:grid-cols-2">
                    <Column
                        cost="Costs nothing"
                        hollow
                        claims={[
                            [
                                '"I am a DeFi agent."',
                                `one gas fee · ${cohortSize(cohort.data?.total)} agents say things like it`,
                            ],
                            [
                                '"I use Slither and the SWC Registry."',
                                "no deposit · a declared tool",
                            ],
                            [
                                '"We rate this agent 71 / 100."',
                                "no deposit · one rater's opinion, signature checked",
                            ],
                        ]}
                    />
                    <Column
                        cost="Costs money"
                        claims={[
                            [
                                '"I used this agent."',
                                `0.1 ${chain.symbol}, gone, with my address on it`,
                            ],
                            ['"I back this agent."', `${chain.symbol} on its atom, withdrawable`],
                            ['"That rating is wrong."', `${chain.symbol} against a signed claim`],
                        ]}
                    />
                </div>
            </Section>

            <Section
                figure="Fig. 02 · the evidence ladder"
                title="Four rungs."
                dim="ARP stands on the top two."
            >
                <div className="border-t border-[color:var(--color-rule-strong)]">
                    {RUNGS.map((rung) => (
                        <div
                            key={rung.n}
                            className={`grid items-center gap-6 border-b border-[color:var(--color-rule)] py-7 md:grid-cols-[5rem_minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1fr)_9rem] ${
                                rung.arp ? "" : "text-[color:var(--color-steel)]"
                            }`}
                        >
                            <span
                                className={`type-face text-[clamp(34px,5vw,56px)] ${
                                    rung.arp
                                        ? "text-[color:var(--color-fg)]"
                                        : "text-[color:var(--color-numeral)]"
                                }`}
                            >
                                {rung.n}
                            </span>
                            <span
                                className={`type-face text-[22px] ${rung.arp ? "text-[color:var(--color-fg)]" : ""}`}
                            >
                                {rung.name}
                            </span>
                            <span className="text-[color:var(--color-silver)]">{rung.claim}</span>
                            <span className="font-mono text-[length:var(--text-body-sm)]">
                                {rung.cost}
                            </span>
                            <span className="flex items-center gap-2 font-mono text-[length:var(--text-body-sm)] md:justify-end">
                                <span
                                    aria-hidden="true"
                                    className={`h-[6px] w-[6px] rounded-full ${
                                        rung.arp
                                            ? "bg-[color:var(--color-accent)]"
                                            : "bg-[color:var(--color-rule-strong)]"
                                    }`}
                                />
                                {rung.who}
                            </span>
                        </div>
                    ))}
                </div>
            </Section>

            <Section
                figure="Fig. 03 · with a wallet"
                title="Three ways to add a beat."
                dim="Each one costs you something."
            >
                <div className="grid gap-5 md:grid-cols-3">
                    {acts.map((act) => (
                        <article
                            key={act.n}
                            className={`flex flex-col gap-4 rounded-[var(--radius-card)] border p-5 ${
                                act.primary
                                    ? "border-[color:var(--color-accent)]"
                                    : "border-[color:var(--color-rule)]"
                            }`}
                        >
                            <span className="font-mono text-[length:var(--text-label)] text-[color:var(--color-steel)]">
                                {act.n}
                            </span>
                            <h3 className="type-face text-[22px]">{act.title}</h3>
                            <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-1.5 font-mono text-[length:var(--text-body-sm)]">
                                {act.terms.map(([term, value]) => (
                                    <div key={term} className="contents">
                                        <dt className="text-[color:var(--color-steel)]">{term}</dt>
                                        {/* Saffron marks a price on this page and nothing
                                            else — the ladder's cost column and the beat figure
                                            carry it too, and the handoff's own reference puts it
                                            here (`<dd class="warm">`). */}
                                        <dd
                                            className={`text-right ${act.primary && term === "Costs from" ? "text-[color:var(--color-accent)]" : ""}`}
                                        >
                                            {value}
                                        </dd>
                                    </div>
                                ))}
                            </dl>
                            <Link
                                to={act.to}
                                className={`mt-auto text-[length:var(--text-body-sm)] ${linkClass}`}
                            >
                                {act.cta} →
                            </Link>
                        </article>
                    ))}
                </div>
            </Section>

            {/* ADR `0046` as a statement rather than a footnote. It is the one thing about this
                protocol that is easiest to get wrong by assuming. */}
            <section className="border-t border-[color:var(--color-rule)] py-24 text-center">
                <p className="type-display mx-auto max-w-[18ch]">
                    No score. No grade. No stars.
                    <br />
                    <span className="text-[color:var(--color-grey)]">
                        ARP has no opinion about any agent.
                    </span>
                    <br />
                    <span className="text-[color:var(--color-accent)]">
                        Every number is somebody&rsquo;s deposit.
                    </span>
                </p>
            </section>

            <Section figure="Fig. 04 · build against it" title="No API key." dim="No indexer.">
                <div className="grid items-center gap-10 lg:grid-cols-2">
                    <div className="flex flex-col gap-5">
                        <p className="type-face text-[clamp(24px,3vw,34px)] text-[color:var(--color-accent)]">
                            Never signs.
                        </p>
                        <p className="font-mono text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]">
                            <code className="text-[color:var(--color-fg)]">@arp-protocol/core</code>{" "}
                            · holds no key, has no send path
                        </p>
                        <p className="font-mono text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]">
                            Nothing installed?{" "}
                            <a
                                href="https://github.com/Wieedze/ARP/blob/main/skills/arp/SKILL.md"
                                target="_blank"
                                rel="noreferrer"
                                className={linkClass}
                            >
                                <code>skills/arp/SKILL.md</code>
                            </a>{" "}
                            is the whole procedure.
                        </p>
                    </div>
                    <pre className="overflow-x-auto rounded-[var(--radius-card)] border border-[color:var(--color-rule)] bg-[color:var(--color-bg)] p-6 font-mono text-[13px] leading-[1.75] text-[color:var(--color-silver)]">
                        {SNIPPET}
                    </pre>
                </div>
            </Section>
        </>
    );
}

/* -------------------------------------------------------------------------- */

/** `30,913`, or `—` while the cohort read is in flight. Never a guess. */
function cohortSize(total: number | null | undefined): string {
    return total === null || total === undefined ? "—" : total.toLocaleString("en-US");
}

function Section({
    figure,
    title,
    dim,
    children,
}: {
    figure: string;
    title: string;
    dim: string;
    children: React.ReactNode;
}) {
    return (
        <section className="pt-24">
            <div className="mb-8 flex flex-wrap items-end justify-between gap-6">
                <h2 className="type-face text-[clamp(30px,4.4vw,56px)]">
                    {title}
                    <br />
                    <span className="text-[color:var(--color-grey)]">{dim}</span>
                </h2>
                <span className="font-mono text-[length:var(--text-label)] uppercase tracking-[0.06em] text-[color:var(--color-steel)]">
                    {figure}
                </span>
            </div>
            {children}
        </section>
    );
}

/**
 * One side of the one-rule split, labelled by **what it costs**.
 *
 * The reference labels them "SAID FOR FREE · SHOWN LOW AND DIM" and "PAID TO SAY · SHOWN HIGH AND
 * LOUD". The user cut that vocabulary, and he was right twice: it names our taxonomy rather than
 * the fact, and the second half describes the page's own styling to the reader.
 */
function Column({
    cost,
    claims,
    hollow = false,
}: {
    cost: string;
    claims: [string, string][];
    hollow?: boolean;
}) {
    return (
        <div
            className={`flex flex-col py-6 ${hollow ? "pr-0 md:pr-10" : "md:border-l md:border-l-[color:var(--color-rule)] md:pl-10"}`}
        >
            <span className="flex items-center gap-2.5 pb-4 font-mono text-[length:var(--text-label)] uppercase tracking-[0.06em] text-[color:var(--color-steel)]">
                <span
                    aria-hidden="true"
                    className={`h-2 w-2 rounded-full ${
                        hollow
                            ? "border-[1.5px] border-[color:var(--color-steel)]"
                            : "bg-[color:var(--color-fg)]"
                    }`}
                />
                {cost}
            </span>
            {claims.map(([quote, note]) => (
                <div
                    key={quote}
                    className="flex flex-col gap-2 border-t border-dashed border-[color:var(--color-rule)] py-5"
                >
                    <span
                        className={`text-[17px] ${hollow ? "text-[color:var(--color-steel)]" : "text-[color:var(--color-fg)]"}`}
                    >
                        {quote}
                    </span>
                    <span className="font-mono text-[length:var(--text-label)] text-[color:var(--color-steel)]">
                        {note}
                    </span>
                </div>
            ))}
        </div>
    );
}

/**
 * The newest declaration, in the hero's corner.
 *
 * Real or absent. The reference shows `0.10 TRUST · vault-auditor uses github.com/crytic/slither`
 * as sample data; on mainnet today the honest version of that card is empty, and saying so is the
 * page's most load-bearing sentence.
 */
function Beat({declarations, isPending}: {declarations: RecentDeclaration[]; isPending: boolean}) {
    const chain = useChainChoice();
    const newest = declarations[0];

    return (
        <div
            aria-live="polite"
            className="absolute right-[clamp(20px,4vw,56px)] bottom-[clamp(20px,4vw,56px)] flex min-w-[min(18rem,70vw)] flex-col gap-1 rounded-[var(--radius-button)] border border-[color:var(--color-rule-strong)] bg-[color:var(--color-bg)]/90 px-3.5 py-3"
        >
            <span className="flex items-center gap-2 border-b border-[color:var(--color-rule)] pb-2 font-mono text-[10px] uppercase tracking-[0.06em] text-[color:var(--color-steel)]">
                <span
                    aria-hidden="true"
                    className="h-[6px] w-[6px] rounded-full bg-[color:var(--color-accent)]"
                />
                Pulse · {isPending ? "—" : declarations.length} on {chain.label.toLowerCase()}
            </span>
            {isPending ? (
                <span className="font-mono text-[10px] text-[color:var(--color-steel)]">
                    reading…
                </span>
            ) : newest === undefined ? (
                <>
                    <span className="text-[13px] text-[color:var(--color-fg)]">
                        No declaration on this chain yet.
                    </span>
                    <span className="font-mono text-[10px] text-[color:var(--color-steel)]">
                        Nobody has run the loop here — including us.
                    </span>
                </>
            ) : (
                <>
                    <span className="font-mono text-[10px] text-[color:var(--color-steel)]">
                        Declared use · {relative(newest.at)}
                    </span>
                    <strong className="type-face text-[20px] text-[color:var(--color-accent)]">
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

/**
 * The strip under the hero.
 *
 * No marquee animation when there is nothing to scroll, and no duplicated track to fake a loop:
 * three real declarations are three, and a seamless infinite scroll of three would be the page
 * pretending to a volume it does not have.
 */
function Ticker({
    declarations,
    isPending,
}: {
    declarations: RecentDeclaration[];
    isPending: boolean;
}) {
    const chain = useChainChoice();

    return (
        <div
            className="mt-6 flex h-12 items-center gap-8 overflow-x-auto border-y border-[color:var(--color-rule)] font-mono text-[12px] text-[color:var(--color-silver)]"
            aria-label="Declarations on this chain"
        >
            {isPending ? (
                <span className="text-[color:var(--color-steel)]">reading the graph…</span>
            ) : declarations.length === 0 ? (
                <span className="text-[color:var(--color-steel)]">
                    No agent has declared using anything on {chain.label.toLowerCase()} yet.
                </span>
            ) : (
                declarations.map((row) => (
                    <Link
                        key={row.tripleId}
                        to={`/atom/${row.object.atomId}`}
                        className="flex shrink-0 items-center gap-3 whitespace-nowrap"
                    >
                        <span
                            aria-hidden="true"
                            className={`h-[6px] w-[6px] rounded-full ${
                                row.positions > 0
                                    ? "bg-[color:var(--color-accent)]"
                                    : "bg-[color:var(--color-rule-strong)]"
                            }`}
                        />
                        {label(row.subject)} uses {label(row.object)}
                        {row.assets === null ? null : (
                            <span className="text-[color:var(--color-steel)]">
                                {formatTrust(row.assets)} {chain.symbol}
                            </span>
                        )}
                    </Link>
                ))
            )}
        </div>
    );
}

function label(end: {atomId: string; label: string | null}): string {
    return end.label ?? truncateMiddle(end.atomId, 8, 6);
}

/** `3 days ago`. Coarse on purpose — the exact timestamp is on the atom's page. */
function relative(iso: string): string {
    const then = Date.parse(iso);
    if (Number.isNaN(then)) return "at an unknown time";
    const days = Math.floor((Date.now() - then) / 86_400_000);
    if (days <= 0) return "today";
    if (days === 1) return "yesterday";
    if (days < 31) return `${days} days ago`;
    const months = Math.floor(days / 30);
    return months === 1 ? "a month ago" : `${months} months ago`;
}

/** `docs/09` §3, verbatim. ARP is rows three and four; it has no claim on one and two. */
const RUNGS = [
    {
        n: "01",
        name: "Asserted",
        claim: '"I am an agent, I do X."',
        cost: "one gas fee, once",
        who: "ERC-8004",
        arp: false,
    },
    {
        n: "02",
        name: "Rated",
        claim: '"Someone scored this agent."',
        cost: "nothing",
        who: "feedback aggregators",
        arp: false,
    },
    {
        n: "03",
        name: "Staked",
        claim: '"I have capital at risk on this claim."',
        cost: "capital that can be lost",
        who: "ARP",
        arp: true,
    },
    {
        n: "04",
        name: "Proven",
        claim: '"This action executed under enforced caveats."',
        cost: "a validated transaction",
        who: "ARP",
        arp: true,
    },
] as const;

/**
 * Each one is a page that exists. A card for an act nobody can perform would be a brochure.
 *
 * It takes the cost because **the cost is a chain fact, not a copy**. The first card read
 * `0.1 TRUST` as a literal, which is right on 1155 and wrong by 100× on 13579, and wore mainnet's
 * symbol on both (`rules/portability.md`, `rules/claims.md` §2). It now reads what the MultiVault
 * in view charges, and says **from**, because a declaration also pays `getAtomCost()` for any atom
 * of the three that does not exist yet.
 */
function actsFor(cost: string) {
    return [
        {
            n: "01",
            title: "Declare you used it",
            primary: true,
            to: "/tools",
            cta: "Find a tool",
            terms: [
                ["Costs from", cost],
                ["Refundable", "no"],
                ["Signed by", "your address"],
            ],
        },
        {
            n: "02",
            title: "Back it",
            primary: false,
            to: "/agents",
            cta: "Open the index",
            terms: [
                ["Goes to", "its atom vault"],
                ["Withdrawable", "yes"],
                ["Paid to the agent", "no"],
            ],
        },
        {
            n: "03",
            title: "Put yourself on it",
            primary: false,
            to: "/agent",
            cta: "Add your agent",
            terms: [
                ["Mints", "a real ERC-8004 id"],
                ["Chain", "Base 8453"],
                ["Then", "link your staking account"],
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

/** The real calls. Every name here is exported by the package today. */
const SNIPPET = `import {
  createErc8004Client, listAgents, getToolUsage,
  prepareDeclareUsed, INTUITION_MAINNET_GRAPHQL,
} from '@arp-protocol/core';

const client = createErc8004Client();

// Who is on the record, ordered by evidence, never by a score.
const page = await listAgents(client, {
  order: 'evidence-quantity', limit: 25,
});

// Who declared using a tool, and what stands behind each side.
const usage = await getToolUsage(toolAtomId, {
  graphqlUrl: INTUITION_MAINNET_GRAPHQL,
});

// Writing is a plan: unsigned calls, signed by your own wallet.
const plan = await prepareDeclareUsed({
  subject, reads, tools: ['github.com/crytic/slither'],
});`;
