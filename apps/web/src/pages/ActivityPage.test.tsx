import {screen, waitFor, within} from "@testing-library/react";
import {describe, expect, it} from "vitest";

import {ActivityPage} from "./ActivityPage";
import {ActivityLog} from "../services/activity-log";
import {AgentFeed, type EventSourceLike} from "../services/agent-feed";
import {renderWithProviders} from "../test/render";

const SKILL = `0x${"c".repeat(64)}`;
const HASH = `0x${"e".repeat(64)}`;

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
        renderWithProviders(<ActivityPage feed={feed} />);
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
        renderWithProviders(<ActivityPage feed={feed} />);
        expect(screen.getByText(/arp-session-log --serve/)).toBeTruthy();
        expect(screen.getByText("No feed configured")).toBeTruthy();
    });
});
