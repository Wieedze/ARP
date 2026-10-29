import {Link, Navigate, useParams} from "react-router-dom";
import type {Hex} from "viem";

import {PageLoading} from "../components/brand/PageLoading";
import {AtomSigil} from "../components/atom/AtomSigil";
import {Backing, Empty, Group} from "../components/atom/ClaimList";
import {ClaimField} from "../components/atom/ClaimField";
import {AtomMarket} from "../components/market/AtomMarket";
import {actionCardClass} from "../lib/surface-class";
import {linkClass} from "../lib/control-class";
import {useDomainTree} from "../hooks/use-domain-tree";
import {useSkillFacts} from "../hooks/use-skill-facts";
import {predicateLabelOf} from "../services/atom-standing-view";
import {DeclareUse} from "../components/usage/DeclareUse";
import {useAgentRefForAtom} from "../hooks/use-agent-ref-for-atom";
import {useDeclaredModules} from "../hooks/use-declared-modules";
import {useAtomStanding, isAtomId} from "../hooks/use-atom-standing";
import {useChainChoice} from "../lib/chain-choice";
import {type AtomView} from "../services/atom-standing-view";
import {truncateMiddle} from "../services/trust-format";

/**
 * `/atom/:atomId` — one atom, its own market, and everything that points at it.
 *
 * ## It replaces `/atom/:atomId`, which was the same page under a narrower name
 *
 * That page read **only** `uses` edges, so a tool had somewhere to go and a tag, a category or a
 * protocol did not — `CapabilitySection` rendered those as dead text. The user's question
 * (2026-10-27): _« si les tools existent et les tags aussi et les supports aussi, pourquoi ne pas
 * avoir de page autour de ça ? »_
 *
 * They do exist. In Intuition every object of a triple is an atom with its own vault, so a tag
 * already has a market. What was missing was a reader that does not presume the predicate, which is
 * `getAtomStanding`. One page now serves a tool, a tag, a category, a protocol and an agent's atom,
 * because the question is the same each time: **who points at this, and what did they put behind
 * saying so.**
 *
 * The old route redirects here rather than 404ing — links to it exist in commits, in ADRs and in
 * whatever the user has bookmarked.
 *
 * ## What it writes, and the one thing it still does not
 *
 * It writes **one** claim: `(your agent, uses, this atom)`, through `DeclareUse` at the head of the
 * column. That is `docs/12` point 3, which had no page anywhere until now — it lived in
 * `scripts/agent-declare-used.ts` and in the MCP server, so the centre of the mechanism was
 * reachable by an agent and not by the human holding its key.
 *
 * It still solicits **no deposit**. The market on an agent lives on the agent's page where its
 * subject is unmistakable (ADR `0017` safeguard 4), and the `uses` edge is a receipt rather than a
 * market worth taking a position on beyond the one it is born with (ADR `0056` §1, ADR `0053`).
 *
 * This section read **"Reads only"** until the declare control shipped. Left visible rather than
 * silently replaced, because the sentence was cited as the page's contract.
 *
 * ## The predicates are whatever the graph holds
 *
 * Grouped by predicate, and the predicate is any atom anybody chose. Measured live on mainnet
 * 2026-10-27, one book's atom is the object of edges whose predicates are `Ethereum`, `Bitcoin`,
 * `Donald Trump` and `prefers`. That is the honest state of a permissionless graph and the page
 * shows it rather than curating a shortlist — ARP points and prices, it does not store or judge
 * (ADR `0051`, `0046`).
 */
export function AtomPanel() {
    const {atomId} = useParams();
    const valid = isAtomId(atomId);
    const query = useAtomStanding(valid ? atomId : null);
    /**
     * **An agent has one page, and this is what makes that true.**
     *
     * The directory knows an agent's `chainId/tokenId` and links to its panel; a capability search
     * and the claim field know only its atom id and landed here. Same agent, two destinations,
     * depending on where the reader clicked — which is what the user asked to end.
     *
     * So an atom that **is** an agent sends the reader on, and every link in the app converges on
     * the panel whatever id it was holding. `replace`, so Back returns to where they came from
     * rather than bouncing through here.
     *
     * `null` is "no identity found", never "not an agent": ARP's own rig agents on 13579 have no
     * `same as` edge (`tasks/19` step 1b, measured again today — 30,913 such edges on mainnet,
     * none of them ours on testnet), so they stay on this page, which is a complete view of them.
     */
    const agentRef = useAgentRefForAtom(valid ? atomId : null);
    /**
     * Every claimant's declared tools, for the sigil beside its claim — **one query for the page**.
     *
     * The user asked for each declaring agent's glyph here. A sigil's input is the tools that agent
     * declared using, which the standing read does not carry: it returns the edges pointing *at*
     * this atom, and a sigil is about edges pointing *out* of its subject.
     */
    const subjectIds = (query.data?.groups ?? []).flatMap((group) =>
        group.rows.map((row) => row.subjectAtomId),
    );
    const modules = useDeclaredModules(subjectIds);
    const chain = useChainChoice();

    if (!valid) {
        return (
            <section className="mt-10">
                <h1 className="type-title">Not an atom id</h1>
                <p className="mt-4 max-w-[60ch] text-[color:var(--color-steel)]">
                    An atom is addressed by its Intuition id — 0x followed by 32 bytes. Got{" "}
                    <span className="font-mono">{atomId ?? "nothing"}</span>.
                </p>
            </section>
        );
    }

    if (agentRef.data != null) {
        return <Navigate to={`/agent/${agentRef.data.chainId}/${agentRef.data.tokenId}`} replace />;
    }

    // Both reads, not just the standing one. Rendering the atom view while the identity is still
    // in flight would show a page for half a second and then replace it — a flash of the thing the
    // reader is being moved away from. The identity read is one query and runs in parallel with the
    // heavier standing read, so waiting for it costs nothing in practice.
    if (query.isPending || agentRef.isPending) {
        return (
            <PageLoading label="Reading the atom">
                reading {truncateMiddle(atomId)} and everything pointing at it on{" "}
                {chain.label.toLowerCase()}
            </PageLoading>
        );
    }

    if (query.isError) {
        return (
            <section className="mt-10" aria-live="polite">
                <h1 className="type-title">The read failed</h1>
                <p className="mt-4 max-w-[60ch] font-mono text-[length:var(--text-body-sm)] text-[color:var(--color-steel)] break-words">
                    {query.error instanceof Error ? query.error.message : String(query.error)}
                </p>
            </section>
        );
    }

    const view = query.data;

    return (
        <section className="mt-10">
            {/* **The title spans the page; it is not metadata.**
                It lived in the 18rem aside, where `--text-title` clamps to 76px against 288px of
                column — so `Trail of Bits — secure-workflow-guide` rendered as nine lines of
                broken words (`Trail / of / Bits / — / secur / e- / workf / low- / guide`), while
                the right column sat nearly empty. The grid template is fixed, so the aside never
                borrowed that space however little the evidence needed.

                `overflow-wrap: anywhere` stays on `.type-title` and is still right: a bare
                66-character atom id has no break opportunity at all and must be allowed to wrap
                mid-token. Across the full width it only bites for an id, which is what it is for.

                `tasks/28` item 39, found while building this control, filed, and then fixed when
                the user saw it — filing a defect is not the same as leaving it. */}
            <h1
                className={`type-title ${view.titleIsId ? "font-mono" : ""} max-w-[24ch] md:max-w-[32ch]`}
            >
                {view.title}
            </h1>

            <div className="mt-10 grid gap-x-12 gap-y-10 md:grid-cols-[18rem_1fr] md:items-start">
                <aside>
                    {/* The glyph sits where an agent's does on its own panel: at the top of the
                        identity column, above the facts. It is the sigil inverted — a dot per
                        agent that declared this — and it costs no query, because those agents are
                        the subjects of the `uses` edges the page already read. */}
                    <AtomSigil atomId={view.atomId} name={view.title} groups={view.groups} />
                    <Signals view={view} />
                    <Claims view={view} />
                    <Identity view={view} />
                </aside>

                <div className="min-w-0">
                    {!view.exists ? (
                        <Missing atomId={view.atomId} />
                    ) : (
                        <>
                            {/* **The market leads, full width; the declaration follows.** Five
                            shapes have been measured here. At the foot of the column the control
                            sat at y=17602 on a 250-edge atom — unreachable. Open and stacked at the
                            head it pushed the first evidence row from y~230 to y~501. Collapsed
                            into disclosures it cost a click, which the user rejected. Side by side
                            it fit, but gave the two writes equal weight and gave the market half a
                            column for a value line, a backers list and two controls.

                            The user's ordering (2026-10-28): _« take position plutôt en haut et
                            plus large avec plus de place »_. The market is the busier object and
                            the one a reader arrives for; the declaration is a short form and reads
                            fine under it at a form's width.

                            Both are offered on an atom nobody points at too: `Empty` says "a row
                            appears when somebody writes one", and this is where they write it.

                            `atomId` is the route param this component already narrowed with
                            `isAtomId`, the 32-byte hex test. */}
                            <div className="mb-10 border-b border-[color:var(--color-rule-strong)] pb-10">
                                {/* Only for an agent or a tool — the user's scope for the market,
                                _« une bourse d'agents et d'outils »_, not every node in a
                                permissionless graph. ADR `0072`: two tests, because no single field
                                carries the distinction and the first version used the url alone and
                                hid the market on an actual tool. */}
                                {!view.offersMarket ? null : (
                                    <section>
                                        {/* **No heading above the card.** It said "Take a
                                        position, or exit" while the card's own control says "Take
                                        a position" an inch below — the same instruction twice,
                                        which is what the user cut. The card's control heading is
                                        now the section's, which is why `AtomMarket` lifts it to
                                        `h2` when it has no heading of its own: without that the
                                        outline would skip `h1` to `h3`.

                                        One card. The value line, the figures, the support list and
                                        the two controls are one thing a reader acts on; carding
                                        each separately read as unrelated blocks. */}
                                        <div className={actionCardClass}>
                                            <AtomMarket
                                                atomTermId={atomId as Hex}
                                                name={view.title}
                                                nameIsId={view.titleIsId}
                                                backHeading="Take a position"
                                                heading={null}
                                            />
                                        </div>
                                    </section>
                                )}

                                <div
                                    className={
                                        view.offersMarket ? "mt-10 max-w-[48rem]" : "max-w-[48rem]"
                                    }
                                >
                                    <DeclareUse
                                        object={atomId as Hex}
                                        objectLabel={view.title}
                                        onDeclared={() => void query.refetch()}
                                    />
                                </div>
                            </div>
                            {view.groups.length === 0 ? (
                                <Empty atomId={view.atomId} />
                            ) : (
                                <>
                                    {/* The field, not the sentence. It read
                                    "250+ claims across one predicate", which is the whole of what
                                    the page said about its own subject — the user asked for
                                    _« des cercles qui constellent comme le logo autour de l'atom »_
                                    instead. `describePointers` survives for the places that still
                                    want one line of prose. */}
                                    <div className="mb-10">
                                        <ClaimField
                                            groups={view.groups}
                                            subject={view.title}
                                            edgeCount={view.edgeCount}
                                            truncated={view.truncated}
                                        />
                                    </div>
                                    {view.groups.map((group) => (
                                        <Group
                                            key={group.predicateAtomId}
                                            group={group}
                                            subject={view.title}
                                            modules={modules.data ?? {}}
                                        />
                                    ))}
                                </>
                            )}
                        </>
                    )}
                </div>
            </div>
        </section>
    );
}

/** The atom's own facts, including its own vault — which is never summed with its edges'. */
/**
 * What a reader uses to judge a tool, from beside the chain rather than on it.
 *
 * A skill atom carries its URL and nothing else (ADR `0054`), so a description, an install count
 * and a repository's stars have to come from somewhere; they are measured, dated and bundled
 * (`scripts/build-skill-facts.ts`, `build-repo-facts.ts`).
 *
 * **"pushed 2d ago" is what `maintained` means**, and it is why the sentence is here rather than
 * beside the on-chain `Status` edge, which can only say the word. The verdict is a yes or a no; the
 * figure behind it is what lets a reader disagree with it.
 *
 * Stars last, and quietly: they are free to give and they never fall, so they say less than either
 * of the other two. Measured 2026-10-29, `obra/superpowers` carries 307,944 and
 * `101-skills/superpowers` carries 0, and both were pushed within two months.
 */
function Signals({view}: {view: AtomView}) {
    const {factFor, repoFactFor} = useSkillFacts();
    const skill = factFor(view.label);
    // A skill's signals belong to the repository it came from, which is what its `source` edge
    // says. A repository's own atom is its own source, so the label is tried directly as well.
    const sourceLabel =
        view.claims.find((claim) => claim.predicate === "source")?.objectLabel ?? view.label;
    const repo = repoFactFor(sourceLabel);
    if (skill === null && repo === null) return null;
    return (
        <dl className="mt-6 border-t border-[color:var(--color-rule)] pt-4 text-[length:var(--text-body-sm)]">
            {skill === null || skill.description.length === 0 ? null : (
                <Term label="What it does">
                    <span className="text-[color:var(--color-silver)]">{skill.description}</span>
                </Term>
            )}
            {skill?.installs === undefined || skill.installs === null ? null : (
                <Term label="Installs">
                    <span className="font-mono tabular-nums">
                        {skill.installs.toLocaleString("en-US")}
                    </span>
                </Term>
            )}
            {repo === null ? null : (
                <Term label="Its repository">
                    <span className="block font-mono tabular-nums">
                        {repo.gone
                            ? "gone"
                            : repo.archived
                              ? "archived by its owner"
                              : repo.days === null
                                ? "no push date"
                                : `pushed ${repo.days}d ago`}
                    </span>
                    <span className="block font-mono tabular-nums text-[color:var(--color-steel)]">
                        {`${repo.stars.toLocaleString("en-US")} stars`}
                    </span>
                </Term>
            )}
        </dl>
    );
}

/**
 * What the atom says about **itself** — its outgoing edges, each one a link.
 *
 * This page rendered only the incoming side until 2026-10-29, and for a whole population it came
 * out blank: a skill atom's edges point outward — `source` to the repository it came from,
 * `has tag` to the domain it is filed under — and nothing points back at it. 662 atoms whose every
 * fact was already on chain had nothing on screen.
 *
 * Above `Identity` because it answers what a reader arrived for; the atom id and the pinned CID
 * answer a question nobody asks first.
 */
function Claims({view}: {view: AtomView}) {
    // The domain tree is a separate, long-cached query, and it is what tells a `has tag` edge
    // whether it is a domain. Read here rather than folded into the standing's cached value: a
    // label derived from one query must not be frozen inside another's cache entry.
    const domains = useDomainTree();
    const labels = new Set(domains.options.map((option) => option.label));
    if (view.claims.length === 0) return null;
    return (
        <dl className="mt-6 border-t border-[color:var(--color-rule)] pt-4 text-[length:var(--text-body-sm)]">
            {view.claims.map((claim) => (
                <Term
                    key={claim.tripleId}
                    label={predicateLabelOf(claim.predicate, claim.objectLabel, labels)}
                >
                    <Link
                        to={`/atom/${claim.objectAtomId}`}
                        className={`${linkClass} ${claim.objectIsId ? "font-mono" : ""}`}
                    >
                        {claim.object}
                    </Link>
                    {/* Only when somebody put something behind it. A claim nobody paid for is the
                        common case here and an empty space says so faster than a zero. */}
                    {claim.backing === null ? null : (
                        <span className="block font-mono text-[length:var(--text-label)] text-[color:var(--color-steel)]">
                            {claim.backing}
                        </span>
                    )}
                </Term>
            ))}
        </dl>
    );
}

function Identity({view}: {view: AtomView}) {
    return (
        <>
            <dl className="mt-6 border-t border-[color:var(--color-rule)] pt-4 text-[length:var(--text-body-sm)]">
                <Term label="Atom">
                    <span className="font-mono break-all">{view.atomId}</span>
                </Term>
                {view.type === null ? null : (
                    <Term label="Type">
                        <span className="font-mono">{view.type}</span>
                    </Term>
                )}
                {view.pinnedUri === null ? null : (
                    <Term label="Pinned at">
                        <span className="font-mono break-all">{view.pinnedUri}</span>
                    </Term>
                )}
                {/* The atom's own market — a different one from the edges below, and never summed
                    with them (ADR `0056`). It was "Backing the atom · 6.03586585 TRUST · 1 distinct
                    staker": a label, a figure and four words of prose for two numbers. The user
                    asked for the mark and the numbers and nothing else (2026-10-27).

                    Absent when nobody has backed it. It read "no backing", which is a sentence
                    about an absence — an empty cell says the same thing and says it faster. */}
                {view.ownBacking === null ? null : (
                    <Term label="Support">
                        <Backing amount={view.ownBacking} positions={view.ownPositions} />
                    </Term>
                )}
            </dl>

            {/* **There is no "Explorer →" here any more, and nothing replaces it.**
                It pointed at `${explorerUrl}/address/${termId}`, which was dead: a term id is 32
                bytes and the explorer wants 20 —
                `GET /api/v2/addresses/0x99b0…3710a` answers
                `Invalid format. Expected ~r/^0x([A-Fa-f0-9]{40})$/`, while the HTML route returns
                200 because it is an SPA shell. So it looked reachable and was not, which is worse
                than its absence.

                Three candidates were checked and none resolves a term id. The explorer: no route.
                `app.intuition.systems/atom/<id>`: a consumer landing page, **byte-identical for a
                real id and a bogus one** and carrying neither label — measured in a browser, not
                inferred from a 200. `computeAtomWalletAddr(atomId)` is a real 20-byte address but
                a different object, and presenting an atom's wallet as "the atom" is the same
                category error one level in.

                The id itself is in the `dl` above, in mono, selectable. That is the honest
                surface. ADR `0054`: the id is a pure function of the atom's data, so it is
                reproducible without any third party — which is the better answer than a link. */}
        </>
    );
}

function Term({label, children}: {label: string; children: React.ReactNode}) {
    return (
        <>
            <dt className="mt-4 text-[color:var(--color-steel)] text-[length:var(--text-label)] uppercase tracking-wider first:mt-0">
                {label}
            </dt>
            <dd className="mt-1">{children}</dd>
        </>
    );
}

/** The id resolves to nothing. Different from an atom nobody points at, and said differently. */
function Missing({atomId}: {atomId: string}) {
    return (
        <div>
            <h2 className="text-[length:var(--text-body)] font-medium">No such atom</h2>
            <p className="mt-3 max-w-[70ch] text-[color:var(--color-steel)]">
                <span className="font-mono">{truncateMiddle(atomId)}</span> is a well-formed id that
                this chain&rsquo;s graph does not hold. It may exist on the other chain, or not yet
                exist at all.
            </p>
        </div>
    );
}
