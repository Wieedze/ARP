import {screen, waitFor, within} from "@testing-library/react";
import {describe, expect, it} from "vitest";

import {ActivityPage} from "./ActivityPage";
import type {ChainReads} from "../hooks/use-chain-facts";
import {ActivityLog} from "../services/activity-log";
import {AgentFeed, type EventSourceLike} from "../services/agent-feed";
import {renderWithProviders} from "../test/render";

const SKILL = `0x${"c".repeat(64)}`;
const NOTHING: ChainReads = {fetchRecent: async () => [], fetchStakes: async () => []};
const HASH = `0x${"e".repeat(64)}`;
const LATER = `0x${"f".repeat(64)}`;

function feedWith(events: unknown[]) {
    const source: EventSourceLike = {
        onopen: null,
        onmessage: null,
        onerror: null,
        close: () => undefined,
    };
    const feed = new AgentFeed(new ActivityLog(), {
        url: "http://feed",
        open: () => source,
        readReceipt: async () => null,
    });
    return {
        feed,
        deliver: () => {
            source.onopen?.(new Event("open"));
            for (const event of events)
                source.onmessage?.(new MessageEvent("message", {data: JSON.stringify(event)}));
        },
    };
}

describe("the activity page", () => {
    it("joins each invocation to the declaration that names it, with the explorer link", async () => {
        const {feed, deliver} = feedWith([
            {
                source: "session",
                at: "2026-10-30T13:10:00Z",
                kind: "skill",
                name: "brainstorming",
                ref: SKILL,
                outcome: "ok",
                ms: 9,
                call: "a",
            },
            {
                source: "session",
                at: "2026-10-30T13:10:05Z",
                kind: "skill",
                name: "brainstorming",
                ref: SKILL,
                outcome: "ok",
                ms: 4,
                call: "b",
            },
            {
                source: "session",
                at: "2026-10-30T13:10:06Z",
                kind: "mcp",
                name: "arp",
                ref: null,
                outcome: "ok",
                ms: 30,
                call: "c",
            },
            {
                source: "sent",
                at: "2026-10-30T13:11:00Z",
                chainId: 13579,
                status: "success",
                hash: HASH,
                value: "2000000002000000",
                kind: "create-triple",
                decoded: {
                    fn: "createTriples",
                    subjects: [`0x${"a".repeat(64)}`],
                    predicates: [`0x${"b".repeat(64)}`],
                    objects: [SKILL],
                },
            },
        ]);
        renderWithProviders(<ActivityPage feed={feed} reads={NOTHING} />);
        deliver();

        const skill = (await screen.findAllByText("brainstorming"))[0]!.closest("tr")!;
        expect(within(skill).getByText("×2")).toBeTruthy();
        const link = within(skill).getByRole("link");
        expect(link.getAttribute("href")).toBe(
            `https://testnet.explorer.intuition.systems/tx/${HASH}`,
        );

        // An MCP server has no atom, so nothing can name it — said in two words, not guessed at.
        const mcp = screen.getAllByText("arp")[0]!.closest("tr")!;
        expect(within(mcp).getByText("no atom")).toBeTruthy();

        await waitFor(() => expect(screen.getByText("Live")).toBeTruthy());
    });

    it("says how to start the feed when there is none", () => {
        const feed = new AgentFeed(new ActivityLog(), {
            url: undefined,
            open: () => {
                throw new Error("unused");
            },
            readReceipt: async () => null,
        });
        renderWithProviders(<ActivityPage feed={feed} reads={NOTHING} />);
        expect(screen.getByText(/arp-session-log --serve/)).toBeTruthy();
        expect(screen.getByText("No feed configured")).toBeTruthy();
    });

    it("carries the positions /profile used to show, and asks for a wallet without one", () => {
        const feed = new AgentFeed(new ActivityLog(), {
            url: undefined,
            open: () => {
                throw new Error("unused");
            },
            readReceipt: async () => null,
        });
        renderWithProviders(<ActivityPage feed={feed} reads={NOTHING} />);
        expect(screen.getByRole("heading", {name: "Positions"})).toBeTruthy();
        expect(screen.getByText("Connect a wallet to see what it holds.")).toBeTruthy();
    });

    it("lists every agent's declarations and stakes from the indexer, newest first", async () => {
        const feed = new AgentFeed(new ActivityLog(), {
            url: undefined,
            open: () => {
                throw new Error("unused");
            },
            readReceipt: async () => null,
        });
        const end = (atomId: string, label: string) => ({atomId, label});
        const reads: ChainReads = {
            fetchRecent: async () => [
                {
                    tripleId: "claim-1",
                    at: "2026-10-30T13:17:10+00:00",
                    txHash: HASH,
                    subject: end("a8", "Agent 13579:8"),
                    object: end("t1", "writing-plans"),
                    assets: null,
                    positions: 1,
                },
            ],
            fetchStakes: async () => [
                {
                    id: `${LATER}-2`,
                    kind: "deposit",
                    at: "2026-10-30T13:17:27+00:00",
                    txHash: LATER,
                    tripleId: "claim-1",
                    subject: end("a8", "Agent 13579:8"),
                    object: end("t1", "writing-plans"),
                    account: "0xB86F5f4E338eCEEC5DD095f48acF764465587FCF",
                    assets: 2000000000000000n,
                },
                {
                    // In the transaction that wrote the claim: shown on the declaration's row.
                    id: `${HASH}-4`,
                    kind: "deposit",
                    at: "2026-10-30T13:17:10+00:00",
                    txHash: HASH,
                    tripleId: "claim-1",
                    subject: end("a8", "Agent 13579:8"),
                    object: end("t1", "writing-plans"),
                    account: "0xB86F5f4E338eCEEC5DD095f48acF764465587FCF",
                    assets: 990000000000000n,
                },
            ],
        };
        renderWithProviders(<ActivityPage feed={feed} reads={reads} />);

        const table = await screen.findByRole("table", {name: /on chain/i});
        const rows = within(table).getAllByRole("row").slice(1);
        expect(rows).toHaveLength(2);
        expect(within(rows[0]!).getByText(/staked/)).toBeTruthy();
        expect(within(rows[0]!).getByText("by 0xB86F…7FCF")).toBeTruthy();
        expect(within(rows[1]!).getByText(/declared/)).toBeTruthy();
        expect(within(rows[1]!).getByText(/0\.00099/)).toBeTruthy();
        expect(within(rows[1]!).getByText("Agent 13579:8")).toBeTruthy();
    });

    it("marks the rows incomplete when one of the two reads fails", async () => {
        const reads: ChainReads = {
            fetchRecent: async () => [
                {
                    tripleId: "claim-1",
                    at: "2026-10-30T13:17:10+00:00",
                    txHash: HASH,
                    subject: {atomId: "a8", label: "Agent 13579:8"},
                    object: {atomId: "t1", label: "writing-plans"},
                    assets: null,
                    positions: 0,
                },
            ],
            fetchStakes: async () => {
                throw new Error("indexer down");
            },
        };
        renderWithProviders(<ActivityPage feed={quietFeed()} reads={reads} />);
        expect(
            await screen.findByRole("heading", {name: /every agent · incomplete, one read failed/}),
        ).toBeTruthy();
        expect(screen.getByText("Agent 13579:8")).toBeTruthy();
    });

    it("says the indexer did not answer when both reads fail", async () => {
        const down = async () => {
            throw new Error("indexer down");
        };
        renderWithProviders(
            <ActivityPage feed={quietFeed()} reads={{fetchRecent: down, fetchStakes: down}} />,
        );
        expect(await screen.findByText(/The indexer did not answer/)).toBeTruthy();
        expect(screen.queryByRole("table", {name: /on chain/i})).toBeNull();
    });

    it("says nothing is declared yet when the indexer has nothing", async () => {
        const feed = new AgentFeed(new ActivityLog(), {
            url: undefined,
            open: () => {
                throw new Error("unused");
            },
            readReceipt: async () => null,
        });
        renderWithProviders(<ActivityPage feed={feed} reads={NOTHING} />);
        expect(await screen.findByText(/Nothing declared on/)).toBeTruthy();
    });
});

function quietFeed() {
    return new AgentFeed(new ActivityLog(), {
        url: undefined,
        open: () => {
            throw new Error("unused");
        },
        readReceipt: async () => null,
    });
}
