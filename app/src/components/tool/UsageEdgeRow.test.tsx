import {describe, expect, it} from "vitest";
import {screen, within} from "@testing-library/react";

import {renderWithProviders} from "../../test/render";
import {UsageEdgeRow} from "./UsageEdgeRow";
import type {ToolUsageEdgeView} from "../../services/tool-usage-view";

/**
 * The first component tests in this repo. `tasks/26` is the bill they pay.
 *
 * Eight defects shipped on one page across three review rounds, three of them live on mainnet data.
 * Two were closed by moving pure functions into `tool-usage-view.ts`, where the node environment
 * reaches them. **The other six are about what the DOM contains**, and nothing could assert that.
 *
 * These are behavioural, per `rules/code.md`: what a reader sees, never which class carried it. No
 * snapshot — a snapshot of that page would have passed with all eight defects in it.
 */

const edge = (overrides: Partial<ToolUsageEdgeView> = {}): ToolUsageEdgeView => ({
    tripleId: `0x${"11".repeat(32)}`,
    agent: {atomId: `0x${"22".repeat(32)}`, label: "Captain Dackie", type: "Thing"},
    tier: "priced-assertion",
    supportAssets: 80_000_000_000_000_000n,
    supportPositions: 8,
    opposeAssets: 0n,
    opposePositions: 0,
    isOffCurve: false,
    isOppositionOffCurve: false,
    isContested: false,
    ...overrides,
});

describe("an amount never appears without its position count", () => {
    /**
     * ADR `0023`, and the defect that produced it: every vault on this surface holds one or two
     * positions, so a TRUST figure on its own suggests a depth of opinion that is not there. The
     * count is the part that stops it reading as a market.
     */
    it("prints the staker count beside the supported amount", () => {
        renderWithProviders(<UsageEdgeRow edge={edge()} isFirstOfTier />);

        expect(screen.getByText(/0\.08/)).toBeInTheDocument();
        expect(screen.getByLabelText("8 distinct stakers")).toBeInTheDocument();
    });

    it("prints no amount at all when nothing is staked on the claim", () => {
        // The dust rule, ADR `0042`: a term is born holding `minShare`, so an unbacked claim still
        // reports assets. `supportPositions === 0` is the test, never the amount — rendering that
        // as `<0.00000001 tTRUST` invented a market where there is none.
        renderWithProviders(
            <UsageEdgeRow
                edge={edge({
                    tier: "free-assertion",
                    supportAssets: 1_000_000n,
                    supportPositions: 0,
                })}
                isFirstOfTier
            />,
        );

        expect(screen.queryByText(/TRUST/i)).not.toBeInTheDocument();
        expect(screen.getByText(/nothing staked on this claim/i)).toBeInTheDocument();
    });

    it("shows the opposition only when somebody actually took that side", () => {
        const quiet = renderWithProviders(
            <UsageEdgeRow
                edge={edge({opposeAssets: 1_000_000n, opposePositions: 0})}
                isFirstOfTier
            />,
        );
        expect(quiet.queryByText(/against/i)).not.toBeInTheDocument();
        quiet.unmount();

        renderWithProviders(
            <UsageEdgeRow
                edge={edge({
                    isContested: true,
                    opposeAssets: 30_000_000_000_000_000n,
                    opposePositions: 3,
                })}
                isFirstOfTier
            />,
        );
        expect(screen.getByLabelText("3 distinct stakers")).toBeInTheDocument();
    });
});

describe("off-curve is its own state, not a free assertion", () => {
    /**
     * One of the eight. An off-curve edge carries real capital on a curve this read is not scoped
     * to — 89.33% of mainnet `uses` TRUST sits on curve 2 — so calling it free is a false claim
     * about the money, and printing a figure for it is a false claim about what the page can see.
     */
    it("names itself and shows no figure", () => {
        renderWithProviders(
            <UsageEdgeRow
                edge={edge({tier: "free-assertion", supportPositions: 0, isOffCurve: true})}
                isFirstOfTier
            />,
        );

        // The label, the cell and the caption, asserted apart — the first draft matched
        // `/curve this page does not read/` and found **two** nodes, because on the first row of a
        // run the caption and the "For" cell both say it. That is redundancy and not a defect
        // (rows 2..n have no caption), but a test that cannot tell them apart would also pass if
        // one of them disappeared.
        expect(screen.getByText(/staked off-curve/i)).toBeInTheDocument();
        expect(
            screen.getByText(/^Staked on a curve this page does not read\.$/),
        ).toBeInTheDocument();
        expect(screen.getByText(/^A stake is behind this claim/)).toBeInTheDocument();
        expect(screen.queryByText(/nothing staked on this claim/i)).not.toBeInTheDocument();
    });
});

describe("the chain's own symbol", () => {
    it("reads tTRUST on testnet and TRUST on mainnet", () => {
        const testnet = renderWithProviders(<UsageEdgeRow edge={edge()} isFirstOfTier />);
        expect(testnet.getByText(/tTRUST/)).toBeInTheDocument();
        testnet.unmount();

        renderWithProviders(<UsageEdgeRow edge={edge()} isFirstOfTier />, {mainnet: true});
        const amount = screen.getByText(/TRUST/);
        expect(amount.textContent).toContain("TRUST");
        expect(amount.textContent).not.toContain("tTRUST");
    });
});

describe("the document outline", () => {
    it("names the agent as a heading, so the rows are in the outline", () => {
        // A `<p>` left every row outside the outline entirely. Tailwind's preflight resets heading
        // size and weight, so the tag changes the structure and not the type.
        renderWithProviders(<UsageEdgeRow edge={edge()} isFirstOfTier />);
        const heading = screen.getByRole("heading", {name: /Captain Dackie/});
        expect(heading).toBeInTheDocument();
    });

    it("falls back to the atom id when the agent has no label", () => {
        renderWithProviders(
            <UsageEdgeRow
                edge={edge({agent: {atomId: `0x${"ab".repeat(32)}`, label: null, type: null}})}
                isFirstOfTier
            />,
        );
        const heading = screen.getByRole("heading");
        expect(within(heading).getByText(/0xabababab/)).toBeInTheDocument();
    });
});
