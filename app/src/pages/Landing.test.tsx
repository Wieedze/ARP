import {describe, expect, it, vi, beforeEach} from "vitest";
import {screen, waitFor} from "@testing-library/react";
import type {RecentDeclaration} from "@arp-protocol/core";

import {renderWithProviders} from "../test/render";
import {Landing} from "./Landing";

/**
 * The front page's two behaviours that a type checker cannot see.
 *
 * Both failed review on the day the page shipped, and both are one assertion wide:
 *
 * - **One price per act.** The page stated the declaration fee twice and only one copy was
 *   corrected to read the chain, so on testnet the two sites were 100x apart and eleven inches
 *   apart on screen (`rules/claims.md` §5).
 * - **Every in-page anchor resolves.** The hero's second call to action pointed at `#build` and
 *   the port had dropped the section's `id`, so one of two CTAs scrolled nowhere.
 *
 * The three reads are faked at the package and service boundary — that is where the network is.
 * Everything between them and the screen runs for real, because that is the chain that shipped
 * the defects.
 */

vi.mock("@arp-protocol/core", async () => {
    const actual = await vi.importActual<Record<string, unknown>>("@arp-protocol/core");
    return {...actual, getRecentDeclarations: vi.fn(), listAgents: vi.fn()};
});
vi.mock("../services/declaration-cost", () => ({readDeclarationCost: vi.fn()}));

const {getRecentDeclarations, listAgents} = await import("@arp-protocol/core");
const {readDeclarationCost} = await import("../services/declaration-cost");

const recent = getRecentDeclarations as unknown as ReturnType<typeof vi.fn>;
const agents = listAgents as unknown as ReturnType<typeof vi.fn>;
const cost = readDeclarationCost as unknown as ReturnType<typeof vi.fn>;

/** Testnet's real figures: fee 0.001000000002, deposit 0.001, floor ~0.002. */
const TESTNET_COST = {fee: 1_000_000_002_000_000n, deposit: 1_000_000_000_000_000n, floor: 0n};
TESTNET_COST.floor = TESTNET_COST.fee + TESTNET_COST.deposit;

function declaration(overrides: Partial<RecentDeclaration> = {}): RecentDeclaration {
    return {
        tripleId: `0x${"cd".repeat(32)}`,
        at: new Date().toISOString(),
        subject: {atomId: "agent-1", label: "Agent One"},
        object: {atomId: "tool-1", label: "Slither"},
        assets: null,
        positions: 0,
        ...overrides,
    };
}

beforeEach(() => {
    recent.mockReset();
    agents.mockReset();
    cost.mockReset();
    recent.mockResolvedValue([]);
    agents.mockResolvedValue({agents: [], total: 28_648, nextCursor: null});
    cost.mockResolvedValue(TESTNET_COST);
});

describe("Landing", () => {
    it("prints no amount the chain read did not produce", async () => {
        const {container} = renderWithProviders(<Landing />);
        await waitFor(() => expect(cost).toHaveBeenCalled());

        // The defect this guards: a literal `0.1 TRUST` survived beside a figure read off the
        // chain, wearing the chain's symbol so it looked chain-aware while staying fixed. On
        // testnet the two were 100x apart.
        //
        // The page legitimately prints **two** figures — the non-recoverable fee and the
        // fee-plus-deposit floor — so the assertion is not "one amount". It is that every amount
        // on the page came from the mocked read, which a hardcoded literal cannot satisfy.
        const allowed = new Set(["0.001 tTRUST", "0.002 tTRUST"]);
        await waitFor(() => {
            const amounts = (container.textContent ?? "").match(/[\d.]+\s*tTRUST/g) ?? [];
            expect(amounts.length).toBeGreaterThan(0);
            for (const amount of amounts) expect(allowed).toContain(amount.replace(/\s+/g, " "));
        });
    });

    it("prices the act card at fee plus deposit, not the fee alone", async () => {
        const {container} = renderWithProviders(<Landing />);
        await waitFor(() => expect(cost).toHaveBeenCalled());

        // Scoped to the row, because the fee alone is correctly printed elsewhere — beat 01 says
        // what does not come back, and that is the fee. What must not happen is the *floor* row
        // showing the fee: `getTripleCost()` alone seeds a term with `minShare` and zero
        // positions (ADR `0053`), so calling it the floor understates by half on testnet.
        await waitFor(() => {
            const term = [...container.querySelectorAll("dt")].find(
                (dt) => dt.textContent?.trim() === "Costs from",
            );
            expect(term, "no `Costs from` row on the page").toBeTruthy();
            expect(term?.nextElementSibling?.textContent).toBe("0.002 tTRUST");
        });
    });

    it("gives every in-page anchor a target on the page", async () => {
        const {container} = renderWithProviders(<Landing />);
        await waitFor(() => expect(cost).toHaveBeenCalled());

        const anchors = [...container.querySelectorAll('a[href^="#"]')];
        expect(anchors.length).toBeGreaterThan(0);
        for (const anchor of anchors) {
            const id = (anchor.getAttribute("href") ?? "").slice(1);
            expect(container.querySelector(`#${id}`), `no target for #${id}`).not.toBeNull();
        }
    });

    it("says nothing has happened rather than showing a sample, when the chain is empty", async () => {
        renderWithProviders(<Landing />);
        // Mainnet returns zero today. The handoff's own instruction: never sample data.
        expect(await screen.findByText(/No declaration on this chain yet/i)).toBeTruthy();
    });

    it("shows the newest declaration when there is one", async () => {
        recent.mockResolvedValue([
            declaration({
                subject: {atomId: "a", label: "Agent One"},
                positions: 1,
                assets: 5n * 10n ** 17n,
            }),
        ]);
        renderWithProviders(<Landing />);
        // `findAll`, not `find`: the hero's beat card and the ticker beneath it both render the
        // newest declaration, so the page states it twice by design and a singular query throws.
        expect(await screen.findAllByText(/Agent One uses Slither/)).not.toHaveLength(0);
    });
});
