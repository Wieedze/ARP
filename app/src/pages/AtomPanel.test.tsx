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
    return {...actual, getAtomStanding: vi.fn()};
});

const {getAtomStanding} = await import("@arp-protocol/core");
const read = getAtomStanding as unknown as ReturnType<typeof vi.fn>;

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
        market: side(6_035_865_850_000_000_000n, 1),
        exists: true,
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
            expect(screen.getByRole("heading", {name: "uses"})).toBeInTheDocument(),
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
        await waitFor(() => expect(screen.getByText(/250\+/)).toBeInTheDocument());
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
