import {describe, expect, it, vi, beforeEach} from "vitest";
import {act, screen, waitFor} from "@testing-library/react";
import type {RecentDeclaration} from "@arp-protocol/core";

import {renderWithProviders} from "../test/render";
import {Landing} from "./Landing";

/**
 * The front page's behaviours that a type checker cannot see.
 *
 * Three of these are regressions that shipped once:
 *
 * - **One price per act.** The page stated the declaration cost twice and only one copy was
 *   corrected to read the chain, so on testnet the two sites were 100× apart and eleven inches
 *   apart on screen (`rules/claims.md` §5).
 * - **Every in-page anchor resolves.** The hero's second call to action pointed at `#build` and
 *   the port had dropped the section's `id`, so one of two CTAs scrolled nowhere.
 * - **Real data or a sentence saying there is none.** Mainnet returns zero declarations today, and
 *   the reference the page is built from carries sample names (`vault-auditor`, `crytic-runner`)
 *   that must not reach the app.
 *
 * And one is a scope guard rather than a regression: ADR `0060` took hire and pay out of scope, so
 * the `be hired` card may say an agent can be found and called and may **not** promise payment.
 *
 * **The deck pins here, and the inherited claim that it does not was wrong.** `happy-dom` lays out
 * at 1024x768 with `prefers-reduced-motion` false, so `canPin()` is true and every test below
 * renders the pinned deck. What `happy-dom` returns zero for is `getBoundingClientRect()`, so
 * `progress` never leaves 0 — the pinned **structure** at the first scene is reachable and is
 * asserted at the end of this file, and everything **driven by scroll** is not: the gesture
 * stepping, the hand-over in situ, the dive, the four Saffron covers, the scrubbed manifesto and
 * the `played` set. `MOTION-V2.md` §5 is the browser checklist that covers those.
 *
 * The three reads are faked at the package and service boundary — that is where the network is.
 * Everything between them and the screen runs for real, because that is the chain that shipped the
 * defects.
 */

vi.mock("@arp-protocol/core", async () => {
    const actual = await vi.importActual<Record<string, unknown>>("@arp-protocol/core");
    return {...actual, getRecentDeclarations: vi.fn()};
});
vi.mock("../services/declaration-cost", () => ({readDeclarationCost: vi.fn()}));

const {getRecentDeclarations} = await import("@arp-protocol/core");
const {readDeclarationCost} = await import("../services/declaration-cost");

const recent = getRecentDeclarations as unknown as ReturnType<typeof vi.fn>;
const cost = readDeclarationCost as unknown as ReturnType<typeof vi.fn>;

/** Testnet's real figures: fee 0.001000000002, deposit 0.001, floor ~0.002. */
const TESTNET_COST = {fee: 1_000_000_002_000_000n, deposit: 1_000_000_000_000_000n, floor: 0n};
TESTNET_COST.floor = TESTNET_COST.fee + TESTNET_COST.deposit;

function declaration(overrides: Partial<RecentDeclaration> = {}): RecentDeclaration {
    return {
        tripleId: `0x${"cd".repeat(32)}`,
        at: new Date().toISOString(),
        txHash: null,
        subject: {atomId: "agent-1", label: "Agent One"},
        object: {atomId: "tool-1", label: "Slither"},
        assets: null,
        positions: 0,
        ...overrides,
    };
}

beforeEach(() => {
    recent.mockReset();
    cost.mockReset();
    recent.mockResolvedValue([]);
    cost.mockResolvedValue(TESTNET_COST);
});

describe("Landing", () => {
    it("prints no amount the chain read did not produce", async () => {
        const {container} = renderWithProviders(<Landing />);
        await waitFor(() => expect(cost).toHaveBeenCalled());

        // The defect this guards: a literal `0.1 TRUST` survived beside a figure read off the
        // chain, wearing the chain's symbol so it looked chain-aware while staying fixed. On
        // testnet the two were 100× apart.
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

    it("prices the declare card at fee plus deposit, not the fee alone", async () => {
        const {container} = renderWithProviders(<Landing />);
        await waitFor(() => expect(cost).toHaveBeenCalled());

        // Scoped to the row, because the fee alone is correctly printed elsewhere — Fig. 02's
        // first beat says what does not come back, and that is the fee. What must not happen is
        // the *floor* row showing the fee: `getTripleCost()` alone seeds a term with `minShare`
        // and zero positions (ADR `0053`), so calling it the floor understates by half on testnet.
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

        // None since 2026-10-29, when the user cut "or build against it →". The guard stays for
        // the next one rather than asserting that one exists.
        const anchors = [...container.querySelectorAll('a[href^="#"]')];
        for (const anchor of anchors) {
            const id = (anchor.getAttribute("href") ?? "").slice(1);
            expect(container.querySelector(`#${id}`), `no target for #${id}`).not.toBeNull();
        }
    });

    it("says nothing has happened rather than showing a sample, when the chain is empty", async () => {
        renderWithProviders(<Landing />);
        // Mainnet returns zero today. The handoff's own instruction: never sample data.
        expect(await screen.findByText(/No declaration on this chain yet/i)).toBeTruthy();
        // And the same for the two cards of Fig. 01, which the reference fills with sample names.
        expect(
            await screen.findByText(/No agent has declared using anything here yet/i),
        ).toBeTruthy();
        expect(await screen.findByText(/No tool has been declared here yet/i)).toBeTruthy();
    });

    it("carries no sample name from the design reference", async () => {
        recent.mockResolvedValue([declaration()]);
        const {container} = renderWithProviders(<Landing />);
        await waitFor(() => expect(cost).toHaveBeenCalled());

        // The reference's two cards are filled with invented agents and tools so a designer can
        // see the composition. Any of these reaching the app is the failure the empty states exist
        // to prevent, and it is one grep (`rules/claims.md` §5).
        await waitFor(() => {
            const text = container.textContent ?? "";
            for (const sample of ["vault-auditor", "crytic-runner", "maturity-bot", "Echidna"]) {
                expect(text, `sample data on the page: ${sample}`).not.toContain(sample);
            }
        });
    });

    it("says the read failed rather than claiming the chain is empty", async () => {
        recent.mockRejectedValue(new Error("502 from the indexer"));
        renderWithProviders(<Landing />);

        // `recentQueryOptions` sets `retry: 0`, so one transient GraphQL failure gives
        // `isPending === false` and `data === undefined`. Reading only those two printed
        // "Nobody has run the loop here, including us." — this page's most load-bearing claim,
        // derived from a request that never answered (`rules/claims.md` §1).
        // `findAll`: the beat card and both cards of Fig. 01 each say it, which is the point —
        // three independent reads of the same query, none of them claiming an empty chain.
        expect(await screen.findAllByText(/The graph did not answer/i)).toHaveLength(3);
        expect(screen.queryByText(/Nobody has run the loop here/i)).toBeNull();
        expect(screen.queryByText(/No declaration on this chain yet/i)).toBeNull();
        expect(screen.queryByText(/No agent has declared using anything here yet/i)).toBeNull();
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
        expect(await screen.findByText(/Agent One uses Slither/)).toBeTruthy();
    });

    it("walks the recent declarations, and names a tool by its name, not its URL", async () => {
        vi.useFakeTimers({shouldAdvanceTime: true});
        try {
            recent.mockResolvedValue([
                declaration({
                    tripleId: "0x01",
                    subject: {atomId: "a", label: "Agent One"},
                    object: {
                        atomId: "t1",
                        label: "github.com/obra/superpowers?skill=brainstorming",
                    },
                }),
                declaration({
                    tripleId: "0x02",
                    subject: {atomId: "b", label: "Agent Two"},
                    object: {atomId: "t2", label: "github.com/crytic/slither"},
                }),
            ]);
            renderWithProviders(<Landing />);
            expect(await screen.findByText("Agent One uses brainstorming")).toBeTruthy();
            await act(async () => {
                vi.advanceTimersByTime(4000);
            });
            expect(await screen.findByText("Agent Two uses crytic/slither")).toBeTruthy();
        } finally {
            vi.useRealTimers();
        }
    });

    it("groups one query two ways, so both cards of Fig. 01 read real edges", async () => {
        recent.mockResolvedValue([
            declaration({
                tripleId: "0x01",
                subject: {atomId: "a", label: "Agent One"},
                object: {atomId: "t1", label: "Slither"},
                positions: 1,
            }),
            declaration({
                tripleId: "0x02",
                subject: {atomId: "a", label: "Agent One"},
                object: {atomId: "t2", label: "Echidna-like"},
                positions: 0,
            }),
        ]);
        renderWithProviders(<Landing />);

        // The agent card lists what one agent used, with `proven` only where a position stands
        // behind the claim — ADR `0042`: the test is `positions`, never the amount, because every
        // term is born with `minShare`.
        expect(await screen.findByText("used · proven")).toBeTruthy();
        expect(await screen.findByText("declared only")).toBeTruthy();
    });

    it("does not promise payment for being hired", async () => {
        const {container} = renderWithProviders(<Landing />);
        await waitFor(() => expect(cost).toHaveBeenCalled());

        // ADR `0060`: ARP records a use, it does not broker one. A delegation names its delegate by
        // address and an agent's runtime address is not on the graph, so "get paid" would be a
        // promise with no mechanism. The card may say findable and callable, and no more.
        const text = (container.textContent ?? "").toLowerCase();
        expect(text).toContain("let other agents find yours and call it");
        for (const forbidden of ["get paid", "earn fees", "marketplace", "hire an agent"]) {
            expect(text, `out-of-scope promise on the page: ${forbidden}`).not.toContain(forbidden);
        }
    });

    it("puts one scene on screen and takes the other five out of the tree", async () => {
        const {container} = renderWithProviders(<Landing />);
        await waitFor(() => expect(cost).toHaveBeenCalled());

        // Pinned, all six scenes are mounted and inside the viewport the whole time, just
        // transparent. Without `inert` + `aria-hidden` on the five that are not current, six
        // screens of links are in the tab order at once and a reader has no idea where they are.
        const scenes = [...container.querySelectorAll("[data-scene]")];
        expect(scenes).toHaveLength(6);
        const visible = scenes.filter((scene) => scene.getAttribute("aria-hidden") === null);
        expect(visible, "exactly one scene should be in the accessibility tree").toHaveLength(1);
        expect(visible[0]?.getAttribute("data-scene")).toBe("0");
        for (const scene of scenes.slice(1)) {
            expect(scene.getAttribute("aria-hidden")).toBe("true");
            expect(scene.hasAttribute("inert")).toBe(true);
        }
    });

    it("shows no scene counter and no rail, which the user removed", async () => {
        const {container} = renderWithProviders(<Landing />);
        await waitFor(() => expect(cost).toHaveBeenCalled());

        // The user, 2026-10-29: the `01 / 06 · PULSE` label and the dots on the right go.
        expect(container.textContent).not.toMatch(/\d{2} \/ \d{2}/);
    });

    it("keeps a space between the headline's words", async () => {
        const {container} = renderWithProviders(<Landing />);
        await waitFor(() => expect(cost).toHaveBeenCalled());

        // Each word is an inline-block, which drops a space at the end of its own box. The space
        // has to sit between the boxes, or the headline reads "Thereputation pulsefor".
        const words = container.querySelector("h1 [aria-hidden='true']");
        expect(words?.textContent).toBe("The reputation pulse for autonomous agents and tools.");
        for (const word of words?.querySelectorAll(".arp-word") ?? []) {
            expect(word.textContent).not.toMatch(/\s/);
        }
    });

    it("keeps the headline as one sentence for assistive technology", async () => {
        const {container} = renderWithProviders(<Landing />);
        await waitFor(() => expect(cost).toHaveBeenCalled());

        // `docs/18` §4: a headline split into one span per word can be announced word by word. The
        // accessible name has to stay one sentence, so the real text is a visually hidden node and
        // the animated words are `aria-hidden`.
        const heading = container.querySelector("h1");
        expect(heading?.querySelector(".sr-only")?.textContent).toBe(
            "The reputation pulse for autonomous agents and tools.",
        );
        expect(heading?.querySelector("[aria-hidden='true']")).not.toBeNull();
    });
});
