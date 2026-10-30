import {describe, expect, it, vi, beforeEach, afterEach} from "vitest";
import {screen, waitFor} from "@testing-library/react";
import type {AtomStanding, MarketSide} from "@arp-protocol/core";

import {renderWithProviders} from "../test/render";
import {AtomPanel} from "./AtomPanel";

/**
 * The page's states, rendered.
 *
 * `tasks/26`: the six defects that survived three review rounds were all about **what the DOM
 * contains** — a figure printed beside a banner denying it, a live region that was not one, copy
 * describing a layout the page did not have. None of them is reachable from a node environment,
 * and all of them are one assertion away here.
 *
 * The read is faked at the package boundary, which is the only mock: `getAtomStanding` is where the
 * network is. Everything between it and the screen — the view service, the query options, the
 * components — runs for real, because that chain is what shipped the defects.
 */

vi.mock("@arp-protocol/core", async () => {
    const actual = await vi.importActual<Record<string, unknown>>("@arp-protocol/core");
    return {
        ...actual,
        getAtomStanding: vi.fn(),
        resolveAgentRefForAtom: vi.fn(),
        getDeclaredModulesFor: vi.fn(),
    };
});

const {getAtomStanding, resolveAgentRefForAtom, getDeclaredModulesFor} =
    await import("@arp-protocol/core");
const read = getAtomStanding as unknown as ReturnType<typeof vi.fn>;
/**
 * The identity behind an atom, which decides whether this page renders at all.
 *
 * `null` by default — "no identity found", the ordinary case for a tool, a tag or one of ARP's own
 * rig agents. The redirect case has its own test below.
 */
const refRead = resolveAgentRefForAtom as unknown as ReturnType<typeof vi.fn>;
/**
 * Each claimant's declared tools, for the sigil beside its claim. `{}` by default — no glyph, the
 * dot instead, which is the state of most of the testnet rig.
 */
const modulesRead = getDeclaredModulesFor as unknown as ReturnType<typeof vi.fn>;

const ATOM = `0x${"ab".repeat(32)}`;

const side = (assets: bigint, positions: number | null): MarketSide => ({
    totalMarketCap: assets,
    totalAssets: assets,
    marketCap: assets,
    totalShares: 1000n,
    currentSharePrice: 1n,
    positionCount: positions,
});

function standing(overrides: Partial<AtomStanding> = {}): AtomStanding {
    return {
        atomId: ATOM,
        label: "slither",
        type: "Thing",
        pinnedUri: "ipfs://bafkreiexample",
        // **What the atom points at**, and the test for offering its market. The default fixture
        // is a tool, so it has one; the tag case below passes `url: null`.
        url: "https://github.com/crytic/slither",
        market: side(6_035_865_850_000_000_000n, 1),
        exists: true,
        claims: [],
        groups: [
            {
                predicate: {atomId: "0xp-uses", label: "uses"},
                edges: [
                    {
                        tripleId: "0xe1",
                        subject: {atomId: "0xs1", label: "Agent 13579:3", type: "Thing"},
                        support: side(1_980_000_000_000_000n, 1),
                        oppose: side(0n, null),
                    },
                ],
                assets: 1_980_000_000_000_000n,
                positions: 1,
            },
        ],
        edgeCount: 1,
        truncated: false,
        provenance: {source: "intuition", kind: "claim", origin: ATOM},
        // The spread the first draft of this helper forgot, which made every `standing({…})` call
        // return the default and four tests assert against a fixture they had not asked for.
        ...overrides,
    } as unknown as AtomStanding;
}

/**
 * Two claims under one predicate, with distinct subjects and distinct standings.
 *
 * The default fixture has one claim, which is why the focus assertion below went vacuous: with a
 * single dot the card reads it from first paint and focus cannot change anything. Two is the
 * smallest fixture in which "focus moves the reading head" is a falsifiable statement.
 */
const twoClaims = [
    {
        predicate: {atomId: "0xp-uses", label: "uses"},
        edges: [
            {
                tripleId: "0xe1",
                subject: {atomId: "0xs1", label: "Agent 13579:3", type: "Thing"},
                support: side(1_980_000_000_000_000n, 1),
                oppose: side(0n, null),
            },
            {
                tripleId: "0xe2",
                subject: {atomId: "0xs2", label: "Agent 13579:4", type: "Thing"},
                // Nobody paid for this one. `positionCount: 0` is the case `docs/17` §4 asks the
                // card to state rather than leave blank, and ADR `0042` is why the amount alone
                // cannot say it: creating the term seeded the vault.
                support: side(1_000_000_000_000_000n, 0),
                oppose: side(0n, null),
            },
        ],
        assets: 2_980_000_000_000_000n,
        positions: 1,
    },
];

/** A tag's edges: many, and none of them `uses`. The shape of `Sanctioned Address` on mainnet. */
const tagGroups = [
    {
        predicate: {atomId: "0xhastag", label: "has tag"},
        edges: [
            {
                tripleId: "0xt1",
                subject: {atomId: "0xs9", label: "caip10:…", type: "Thing"},
                support: side(1n, 1),
                oppose: side(0n, null),
            },
        ],
        assets: 1n,
        positions: 1,
    },
];

beforeEach(() => {
    refRead.mockReset();
    refRead.mockResolvedValue(null);
    modulesRead.mockReset();
    modulesRead.mockResolvedValue({});
});

function renderAt(atomId = ATOM) {
    return renderWithProviders(<AtomPanel />, {
        route: {path: "/atom/:atomId", at: `/atom/${atomId}`},
    });
}

beforeEach(() => {
    read.mockReset();
});
afterEach(() => {
    vi.clearAllMocks();
});

describe("while the read is in flight", () => {
    it("announces itself as a live, busy region", async () => {
        // One of the eight: an async region with no `aria-live`, against three precedents in the
        // same app. A screen reader was told nothing between the click and the rows.
        read.mockImplementation(() => new Promise(() => {}));
        const {container} = renderAt();

        const live = container.querySelector('[aria-live="polite"]');
        expect(live).not.toBeNull();
        expect(live).toHaveAttribute("aria-busy");
        expect(screen.getByRole("img", {name: /reading the atom/i})).toBeInTheDocument();
    });

    it("names which read is running, not just that one is", async () => {
        // ADR `0057` §6: the ring says a read is still running, the sentence says **which**. On
        // this app that is the difference between a slow indexer and the wrong chain.
        read.mockImplementation(() => new Promise(() => {}));
        renderAt();
        expect(screen.getByText(/everything pointing at it on testnet/i)).toBeInTheDocument();
    });
});

describe("a malformed id", () => {
    it("says so instead of reading, because it is a broken link and not a quiet atom", async () => {
        renderAt("not-an-atom");
        expect(screen.getByRole("heading", {name: /not an atom id/i})).toBeInTheDocument();
        expect(read).not.toHaveBeenCalled();
    });
});

describe("an atom nobody points at", () => {
    it("distinguishes 'nothing points at it' from 'no such atom'", async () => {
        // Two different claims about the graph. Collapsing them tells a reader their tool has no
        // reputation when the truth is that the id resolves to nothing.
        read.mockResolvedValue(standing({groups: [], edgeCount: 0}));
        renderAt();
        await waitFor(() =>
            expect(
                screen.getByRole("heading", {name: /nothing points at it/i}),
            ).toBeInTheDocument(),
        );

        screen.getByText(/a row appears when somebody writes one/i);
    });

    it("says 'no such atom' when the id resolves to nothing", async () => {
        read.mockResolvedValue(standing({exists: false, market: null, groups: [], edgeCount: 0}));
        renderAt();
        await waitFor(() =>
            expect(screen.getByRole("heading", {name: /no such atom/i})).toBeInTheDocument(),
        );
    });
});

describe("the dust rule", () => {
    /**
     * ADR `0042`. Every term is born holding `minShare` — 1,000,000 wei — so an unbacked claim
     * still reports a non-zero amount. `positionCount === 0` is the test, never the amount.
     *
     * The original defect: `Staked for <0.00000001 across 0 positions` printed beside a banner
     * saying nobody had staked anything, on **20 of the 84 live tool pages**. Two statements on one
     * screen that cannot both be true.
     */
    it("prints no figure for an atom nobody has backed", async () => {
        read.mockResolvedValue(standing({market: side(1_000_000n, 0)}));
        renderAt();
        await waitFor(() =>
            expect(screen.getByRole("heading", {name: "slither"})).toBeInTheDocument(),
        );

        expect(screen.queryByText(/backed/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/0\.00000001/)).not.toBeInTheDocument();
    });

    it("prints no figure for an unbacked claim either", async () => {
        const dusty = standing();
        dusty.groups[0]!.edges[0]!.support = side(1_000_000n, 0);
        dusty.groups[0]!.assets = 1_000_000n;
        dusty.groups[0]!.positions = 0;
        read.mockResolvedValue(dusty);
        renderAt();
        await waitFor(() =>
            expect(screen.getByRole("heading", {name: /^uses$/i})).toBeInTheDocument(),
        );

        // Scoped to the claim, not to the page. The atom's own vault is still backed here, and
        // that is the point: two markets answering different questions, never conflated
        // (ADR `0056`). A blanket "no tTRUST anywhere" would have passed by hiding both.
        expect(screen.getAllByText(/tTRUST/)).toHaveLength(1);
        expect(screen.getByText(/6\.03586585 tTRUST/)).toBeInTheDocument();

        const claim = screen.getByRole("link", {name: "Agent 13579:3"}).closest("li");
        expect(claim?.textContent).not.toMatch(/tTRUST/);
    });
});

describe("a claim reads as a sentence", () => {
    it("renders subject, predicate and object, not a bare subject", async () => {
        // The user's complaint, with a screenshot: a row read "Agent 13579:3" under a heading
        // "uses", leaving the reader to assemble the triple. A triple is a statement.
        read.mockResolvedValue(standing());
        renderAt();
        await waitFor(() =>
            expect(screen.getByRole("link", {name: "Agent 13579:3"})).toBeInTheDocument(),
        );

        const subject = screen.getByRole("link", {name: "Agent 13579:3"});
        const sentence = subject.parentElement;
        expect(sentence?.textContent).toContain("uses");
        expect(sentence?.textContent).toContain("slither");
    });

    it("links every subject to its own atom, so the graph walks both ways", async () => {
        read.mockResolvedValue(standing());
        renderAt();
        await waitFor(() =>
            expect(screen.getByRole("link", {name: "Agent 13579:3"})).toBeInTheDocument(),
        );

        expect(screen.getByRole("link", {name: "Agent 13579:3"})).toHaveAttribute(
            "href",
            "/atom/0xs1",
        );
    });
});

describe("the figures", () => {
    it("shows the staker mark and the amount, and no prose between them", async () => {
        // "Backing the atom · 6.03586585 TRUST · 1 distinct staker" became a mark, a digit and a
        // number (user, 2026-10-27). `StakerCount` keeps the words in the accessible name.
        read.mockResolvedValue(standing());
        renderAt();
        await waitFor(() =>
            expect(screen.getByRole("heading", {name: "slither"})).toBeInTheDocument(),
        );

        expect(screen.getAllByLabelText("1 distinct staker").length).toBeGreaterThan(0);
        expect(screen.getByText(/6\.03586585 tTRUST/)).toBeInTheDocument();
        expect(screen.queryByText(/distinct staker/)).not.toBeInTheDocument();
    });

    it("marks a truncated read as a floor rather than a total", async () => {
        read.mockResolvedValue(standing({edgeCount: 250, truncated: true}));
        renderAt();
        await waitFor(() => expect(screen.getAllByText(/250\+/).length).toBeGreaterThan(0));
    });
});

describe("a claimant's sigil", () => {
    /**
     * The user asked for each declaring agent's glyph beside its claim.
     *
     * A sigil's input is what that agent declared **using**, which the standing read does not carry
     * — it returns the edges pointing *at* this atom, and a sigil is about edges pointing *out* of
     * its subject. So it is a second read, batched into one query for the whole page rather than
     * one per row.
     */
    it("draws the glyph for a claimant that declared something", async () => {
        modulesRead.mockResolvedValue({"0xs1": ["0xtool-a", "0xtool-b", "0xtool-c"]});
        read.mockResolvedValue(standing());
        const {container} = renderAt();
        await waitFor(() => expect(screen.getByRole("heading", {name: /^uses$/i})).toBeTruthy());

        // The glyph is `aria-hidden` by construction — `Sigil` marks itself so when it has no
        // `title`, because the agent's name is the next element and announcing the identity twice
        // is noise. So it is found as a node, not by role.
        await waitFor(() =>
            expect(container.querySelectorAll('svg[aria-hidden="true"]').length).toBeGreaterThan(0),
        );
    });

    it("falls back to the claim dot when the agent declared nothing", async () => {
        // Not a gap: `agent-sigil.ts` refuses a glyph of nothing but its core, because that is the
        // same glyph for every such agent and would stop being an identity. The dot still carries
        // the state — filled is `positions > 0`, ADR `0042`, the count and never the amount.
        modulesRead.mockResolvedValue({});
        read.mockResolvedValue(standing());
        renderAt();
        await waitFor(() => expect(screen.getByRole("heading", {name: /^uses$/i})).toBeTruthy());
        expect(screen.getAllByText("Agent 13579:3").length).toBeGreaterThan(0);
    });
});

describe("one page per agent", () => {
    /**
     * An agent had **two** pages: the directory knows its `chainId/tokenId` and links to the trust
     * panel, while a capability search and the claim field know only its atom id and landed here.
     * Same agent, two destinations, depending on where the reader clicked.
     *
     * So an atom that resolves to an identity sends the reader on, and every link in the app
     * converges on the panel whatever id it was holding.
     */
    it("sends an agent's atom to the agent's own page", async () => {
        refRead.mockResolvedValue({chainId: 8453, tokenId: "6649"});
        read.mockResolvedValue(standing());
        renderWithProviders(<AtomPanel />, {
            route: {path: "/atom/:atomId", at: `/atom/${ATOM}`},
        });

        // The atom view must not appear at all — not even for a frame. Rendering it while the
        // identity is in flight would flash the page the reader is being moved away from, which is
        // why `AtomPanel` waits for both reads before it draws anything.
        await waitFor(() => expect(screen.queryByText(/reading the atom/i)).toBeNull());
        expect(screen.queryByRole("heading", {name: "slither"})).toBeNull();
    });

    it("stays on the atom page when no identity is found, which is the rig's case", async () => {
        // `null` is "no identity found", never "not an agent". ARP's own testnet agents have no
        // `same as` edge (`tasks/19` step 1b; measured 2026-10-28 — 30,913 on mainnet, none ours on
        // testnet), and this page is a complete view of them.
        refRead.mockResolvedValue(null);
        read.mockResolvedValue(standing());
        renderAt();
        await waitFor(() =>
            expect(screen.getByRole("heading", {name: "slither"})).toBeInTheDocument(),
        );
    });
});

describe("the claim field", () => {
    /**
     * The constellation that replaced "N claims across M predicates".
     *
     * The behaviour worth asserting is the one `rules/ui.md` cares about: the edge a claim composes
     * is revealed on **keyboard focus**, not only on hover. A reveal a mouse alone can reach is the
     * mouse-reactive effect the rule rejects; one that answers the keyboard is a disclosure, which
     * `Hint` already established on this surface. ADR `0073`.
     */
    it("names the whole triple when a claim takes focus, not only on hover", async () => {
        read.mockResolvedValue(standing());
        const {container} = renderAt();
        await waitFor(() => expect(screen.getByRole("heading", {name: /^uses$/i})).toBeTruthy());

        const field = container.querySelector('[role="group"]');
        expect(field, "no claim field on the page").toBeTruthy();
        const dot = field?.querySelector("a");
        expect(dot, "the field has no focusable claim").toBeTruthy();

        // The link carries the whole triple as its accessible name, so focus announces it once
        // and completely. A visible sentence plus a live region would announce twice, and a live
        // region firing on hover says nothing to a reader who navigates by focus.
        expect(dot?.textContent).toContain("Agent 13579:3");
        expect(dot?.textContent).toContain("uses");
        expect(dot?.textContent).toContain("slither");

        // The card reads a claim from its first paint — it follows the rotation on its own, and
        // hover or focus only takes it over. Its slot is in the DOM at its final size before
        // anything is pointed at, which is ADR `0073`'s third condition.
        const slot = container.querySelector("[data-claim-sentence]");
        expect(slot?.getAttribute("data-claim-sentence")).toBe("one");

        (dot as HTMLAnchorElement).focus();
        await waitFor(() => expect(slot?.getAttribute("data-claim-sentence")).toBe("one"));
        expect(slot?.textContent).toContain("Agent 13579:3");
        // The card is a link to what it shows, the same target as the dot it reads, and not a
        // second tab stop: the dot is already that link.
        expect(slot?.tagName).toBe("A");
        expect(slot?.getAttribute("href")).toBe(dot?.getAttribute("href"));
        expect(slot?.getAttribute("tabindex")).toBe("-1");

        // **And what the claim is worth, not only what it says.** The slot named the triple and
        // gave no figure, so a reader could see that a claim existed and never what anybody had
        // put behind it — the one distinction this page argues about.
        //
        // This read `/position|nothing behind it/`, a disjunction that passed on either branch and
        // so tested neither. The fixture's claim has one position, so it is the first branch; the
        // zero-position branch is the test below.
        expect(slot?.textContent ?? "").toMatch(/position/);
    });

    it("moves the reading head to the claim that takes focus", async () => {
        // ADR `0073`'s first condition, made falsifiable. Deleting `onFocus`/`onBlur` from the dot
        // left the whole suite green, because the assertion above compares the card against the
        // claim it already reads at rest. With two claims, focusing the second must move the card
        // to the second — which no amount of hover wiring can do.
        read.mockResolvedValue(standing({groups: twoClaims, edgeCount: 2}));
        const {container} = renderAt();
        await waitFor(() => expect(screen.getByRole("heading", {name: /^uses$/i})).toBeTruthy());

        const field = container.querySelector('[role="group"]');
        const dots = [...(field?.querySelectorAll("a") ?? [])] as HTMLAnchorElement[];
        expect(dots.length, "two claims should be two focusable dots").toBe(2);
        const slot = container.querySelector("[data-claim-sentence]");

        const second = dots.find((dot) => (dot.textContent ?? "").includes("Agent 13579:4"));
        expect(second, "no dot for the second claim").toBeTruthy();
        (second as HTMLAnchorElement).focus();
        await waitFor(() => expect(slot?.textContent).toContain("Agent 13579:4"));

        // And back the other way, so the card follows focus rather than latching on first use.
        const first = dots.find((dot) => (dot.textContent ?? "").includes("Agent 13579:3"));
        (first as HTMLAnchorElement).focus();
        await waitFor(() => expect(slot?.textContent).toContain("Agent 13579:3"));
    });

    it("says a claim nobody paid for rather than going blank", async () => {
        // The other half of the disjunction above, and a spec item that had no test. An amount
        // cannot say it: creating a term seeds its vault, so `assets > 0` only means the term
        // exists. The position count is the discriminator (ADR `0042`).
        read.mockResolvedValue(standing({groups: twoClaims, edgeCount: 2}));
        const {container} = renderAt();
        await waitFor(() => expect(screen.getByRole("heading", {name: /^uses$/i})).toBeTruthy());

        const field = container.querySelector('[role="group"]');
        const dots = [...(field?.querySelectorAll("a") ?? [])] as HTMLAnchorElement[];
        const unpaid = dots.find((dot) => (dot.textContent ?? "").includes("Agent 13579:4"));
        (unpaid as HTMLAnchorElement).focus();

        const slot = container.querySelector("[data-claim-sentence]");
        await waitFor(() => expect(slot?.textContent).toContain("Agent 13579:4"));
        expect(slot?.textContent ?? "").toContain("nothing behind it");
    });

    it("gives every claim a reachable link and an accessible name", async () => {
        read.mockResolvedValue(standing());
        const {container} = renderAt();
        await waitFor(() => expect(screen.getByRole("heading", {name: /^uses$/i})).toBeTruthy());

        // The dots are real links rather than `<circle>`s precisely so this holds: focus rings,
        // keyboard order and names all come from the DOM instead of being rebuilt inside an SVG.
        const links = [...(container.querySelector('[role="group"]')?.querySelectorAll("a") ?? [])];
        expect(links.length).toBe(1);
        for (const link of links) {
            expect(link.getAttribute("href")).toMatch(/^\/atom\/0x/);
            expect(link.textContent ?? "").not.toBe("");
        }
    });

    it("says how many claims there are, and marks a capped read as a floor", async () => {
        // The sentence this replaced carried `250+`; dropping it would have rendered a count the
        // reader knows is a floor as a total (`rules/claims.md`).
        read.mockResolvedValue(standing({edgeCount: 250, truncated: true}));
        renderAt();
        await waitFor(() => expect(screen.getAllByText(/250\+/).length).toBeGreaterThan(0));
    });
});

describe("a failed read", () => {
    it("says the read failed instead of rendering an empty atom", async () => {
        // An empty page reads as "there is nothing here", which is the one thing it does not mean.
        read.mockRejectedValue(new Error("indexer unreachable"));
        renderAt();
        await waitFor(() =>
            expect(screen.getByRole("heading", {name: /the read failed/i})).toBeInTheDocument(),
        );
        expect(screen.getByText(/indexer unreachable/)).toBeInTheDocument();
    });
});

describe("the two writes", () => {
    /**
     * The page's writes, and the behaviours worth asserting are **presence, order and scope**.
     *
     * They were `<details>` collapsed by default, which a reviewer's measurement argued for and the
     * user rejected: what you can do on an atom should be legible on arrival. So the assertions
     * moved from "the disclosure is shut" to "the heading is there and the evidence still follows".
     *
     * `rules/code.md` says behaviourally and means it — a snapshot would have passed with the
     * control missing from the branch that needs it most, and again with it 17,602px down.
     */
    const declareLabel = /declare that your agent used this/i;
    /** The card's own control heading, now that the section above it is gone. */
    const marketLabel = /^take a position$/i;

    it("shows both writes open on an atom the chain holds", async () => {
        read.mockResolvedValue(standing());
        renderAt();
        await waitFor(() =>
            expect(screen.getByRole("heading", {name: declareLabel})).toBeInTheDocument(),
        );
        expect(screen.getByRole("heading", {name: marketLabel})).toBeInTheDocument();
        // Open means the form is reachable without a click, which is the whole of the change.
        expect(screen.getByLabelText(/your agent/i)).toBeInTheDocument();
    });

    it("puts both writes before the evidence, which a careless `else` would undo", async () => {
        read.mockResolvedValue(standing());
        renderAt();
        const declare = await screen.findByRole("heading", {name: declareLabel});

        // The regression this exists for: moved back under `groups.map`, the control sat at
        // y=17602 on a 250-edge atom and **every gate stayed green**. Document order is the one
        // thing a DOM test can hold onto, since `happy-dom` lays nothing out.
        const group = screen.getByRole("heading", {name: /^uses$/i});
        expect(
            declare.compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING,
            "the declare control must precede the first predicate group",
        ).toBeTruthy();
    });

    it("offers the write on an atom nobody points at, which is the first declaration", async () => {
        // The branch that matters most and the one a careless `else` would have dropped: `Empty`
        // says "a row appears when somebody writes one", and this is where they write it.
        read.mockResolvedValue(standing({groups: [], edgeCount: 0}));
        renderAt();
        await waitFor(() => expect(screen.getByText(/nothing points at it/i)).toBeInTheDocument());
        expect(screen.getByRole("heading", {name: declareLabel})).toBeInTheDocument();
    });

    it("offers neither write on an atom that points at nothing, which is what a tag is", async () => {
        // `/atom/:atomId` serves every atom, so without this the deposit control appeared on a
        // tag, a keyword and a person's name — a real-TRUST button on `Sanctioned Address`. The
        // user's scope for the market is "une bourse d'agents et d'outils" (ADR `0072`).
        //
        // `type` cannot decide it: measured on mainnet, that tag and the skill `docx` are **both**
        // `Thing`. Nor can the url alone — the testnet rig's tools carry `url: ""` and a real
        // name, so that test hid the market on an actual tool. A tag fails **both** halves: no
        // url, and every edge on it is `has tag` rather than `uses`.
        //
        // `url: null`, not `""` — the reader normalises an empty url to `null`, and a fixture that
        // skips that normalisation tests a shape the app never receives.
        //
        // **The declare form went with it on 2026-10-29.** It was offered here and the market was
        // not, which left "declare that your agent used this" on a domain, a keyword and a
        // person's name. The user: « déclarer que notre agent utilise marketing, le domaine, quel
        // intérêt ça a dans la boucle ? je pense aucun » — `(agent, uses, marketing)` is a
        // sentence with no referent. An agent uses a tool or another agent, and that is the same
        // scope the market already had.
        read.mockResolvedValue(standing({url: null, groups: tagGroups}));
        renderAt();
        await waitFor(() =>
            expect(screen.getByRole("heading", {name: /^has tag$/i})).toBeInTheDocument(),
        );
        expect(screen.queryByRole("heading", {name: declareLabel})).not.toBeInTheDocument();
        expect(screen.queryByRole("heading", {name: marketLabel})).not.toBeInTheDocument();
    });

    it("offers neither for an id the chain does not hold", async () => {
        // There is no object to write a claim about, and the controls would invite paying a
        // non-recoverable fee to assert a use of nothing, or to back nothing.
        read.mockResolvedValue(standing({exists: false, groups: [], edgeCount: 0}));
        renderAt();
        await waitFor(() => expect(screen.getByText(/no such atom/i)).toBeInTheDocument());
        expect(screen.queryByRole("heading", {name: declareLabel})).not.toBeInTheDocument();
        expect(screen.queryByRole("heading", {name: marketLabel})).not.toBeInTheDocument();
    });

    it("asks for the agent as chain and token, never as a bare id", async () => {
        // ADR `0027`: the registry is at one address on several chains, so a bare token id names a
        // different agent on each. The field has to teach the shape before the guard refuses it.
        read.mockResolvedValue(standing());
        renderAt();
        const field = await screen.findByLabelText(/your agent/i);
        expect(field).toHaveAttribute("placeholder", "8453/1380");
    });

    it("disables the lookup and says why while no wallet is connected", async () => {
        // `renderWithProviders` mounts the real wagmi config, whose only connector finds no
        // `window.ethereum` here — so this is the state a first-time reader is in.
        read.mockResolvedValue(standing());
        renderAt();
        expect(await screen.findByRole("button", {name: /check it/i})).toBeDisabled();
        expect(screen.getByText(/connect the wallet that owns the agent/i)).toBeInTheDocument();
    });

    it("states the mainnet refusal as one line and never as the column's headline", async () => {
        // Mainnet is the **default** chain, and `security.md` authorises a human in the panel under
        // ADR `0017` — which covers a deposit into a `has trust provider` vault, not creating a
        // `uses` edge. So the refusal is the ordinary case. The regression this guards is the first
        // version of that branch: an `h2` in display type at the top of the column, which made the
        // loudest element on every atom page a feature announcing that it does not work.
        read.mockResolvedValue(standing());
        const {container} = renderWithProviders(<AtomPanel />, {
            mainnet: true,
            route: {path: "/atom/:atomId", at: `/atom/${ATOM}`},
        });
        await waitFor(() =>
            expect(screen.getByText(/declaring a use is not open on/i)).toBeInTheDocument(),
        );
        expect(screen.queryByLabelText(/your agent/i)).not.toBeInTheDocument();
        for (const node of container.querySelectorAll("h1, h2, h3")) {
            expect(node.textContent ?? "").not.toMatch(/not open/i);
        }
    });

    it("solicits no deposit on the edge", async () => {
        // ADR `0056` §1, on the user's measured objection: nobody takes the other side of
        // `X used Y`, so a control to add TRUST there would be a fee for nothing. The market beside
        // it is on the **atom**, a different vault, and says so.
        read.mockResolvedValue(standing());
        renderAt();
        await waitFor(() =>
            expect(screen.getByRole("heading", {name: declareLabel})).toBeInTheDocument(),
        );
        for (const forbidden of [/add trust/i, /back this claim/i, /stake on this edge/i]) {
            expect(screen.queryByRole("button", {name: forbidden})).not.toBeInTheDocument();
        }
    });
});

describe("a skill's page", () => {
    it("opens the skill page for a skill atom, with the line that installs it", async () => {
        // A repository the path table does not know, so no SKILL.md is fetched and the page says
        // it found none rather than reading somebody else's file.
        read.mockResolvedValue(
            standing({
                label: "github.com/example/pack?skill=render-video",
                url: "https://github.com/example/pack?skill=render-video",
            }),
        );
        renderAt();
        expect(await screen.findByRole("heading", {name: "render-video", level: 1})).toBeTruthy();
        expect(screen.getByText("npx skills add example/pack --skill render-video")).toBeTruthy();
        expect(screen.getByRole("heading", {name: "Relations"})).toBeTruthy();
        expect(screen.getByRole("heading", {name: "On the record"})).toBeTruthy();
        expect(await screen.findByText(/No SKILL\.md found/)).toBeTruthy();
    });

    it("keeps the generic page for an atom that is not a skill", async () => {
        read.mockResolvedValue(standing());
        renderAt();
        await screen.findByRole("heading", {name: "slither", level: 1});
        expect(screen.queryByText(/npx skills add/)).toBeNull();
    });
});

describe("a repository's page", () => {
    it("opens the repository page, with its skills listed and not repeated under Relations", async () => {
        read.mockResolvedValue(
            standing({
                label: "github.com/example/pack",
                url: "https://github.com/example/pack",
                groups: [
                    {
                        predicate: {atomId: "0xp-source", label: "source"},
                        edges: [
                            {
                                tripleId: "0xs-edge",
                                subject: {
                                    atomId: "0xskill",
                                    label: "github.com/example/pack?skill=render-video",
                                    type: "Thing",
                                },
                                support: side(0n, 0),
                                oppose: side(0n, null),
                            },
                        ],
                        assets: 0n,
                        positions: 0,
                    },
                ],
                edgeCount: 1,
            }),
        );
        renderAt();
        expect(await screen.findByText("npx skills add example/pack")).toBeTruthy();
        expect(screen.getByRole("heading", {name: "1 skill"})).toBeTruthy();
        expect(screen.getByRole("link", {name: "render-video"})).toBeTruthy();
        // The skills are the `source` claims, so Relations has nothing left to show.
        expect(screen.getByText(/Nothing points at example\/pack yet/)).toBeTruthy();
    });
});
