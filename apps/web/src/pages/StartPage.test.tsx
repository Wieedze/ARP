import {fireEvent, screen, waitFor} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";

import {StartPage} from "./StartPage";
import {ActivityLog} from "../services/activity-log";
import {AgentFeed, type EventSourceLike} from "../services/agent-feed";
import {renderWithProviders} from "../test/render";

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

const at = (profile: string) => ({route: {path: "/start/:profile", at: `/start/${profile}`}});

describe("the start page", () => {
    it("shows the Claude path with no wallet word, and ticks the connection when the agent is live", async () => {
        const {feed, deliver} = feedWith([]);
        renderWithProviders(<StartPage feed={feed} />, at("claude"));

        expect(await screen.findByRole("heading", {name: "I use Claude"})).toBeTruthy();
        expect(screen.queryByText(/wallet|testnet|chain|trust/i)).toBeNull();
        expect(screen.getAllByText("to do")).toHaveLength(3);

        deliver();
        await waitFor(() => expect(screen.getAllByText("to do")).toHaveLength(2));
    });

    it("offers the example prompt as words to say, not a shell command", async () => {
        renderWithProviders(<StartPage feed={feedWith([]).feed} />, at("claude"));
        const prompt = await screen.findByText(/sourdough bread/);
        expect(prompt.textContent?.startsWith("$")).toBe(false);
    });

    it("sends a pasted repository URL to the search page", async () => {
        renderWithProviders(<StartPage feed={feedWith([]).feed} />, at("tool"));
        const field = await screen.findByLabelText("Repository URL");
        fireEvent.change(field, {target: {value: "github.com/Wieedze/ARP"}});
        fireEvent.click(screen.getByRole("button", {name: "Find"}));
        await waitFor(() => expect(screen.queryByLabelText("Repository URL")).toBeNull());
    });

    it("lists a tool through the sponsor and links to its page", async () => {
        const fetch = vi.fn(
            async () =>
                new Response(JSON.stringify({atomId: "0xabc", created: true, transactions: []}), {
                    status: 200,
                }),
        );
        vi.stubGlobal("fetch", fetch);
        try {
            renderWithProviders(<StartPage feed={feedWith([]).feed} />, at("tool"));
            fireEvent.change(await screen.findByLabelText("Tool or skill URL"), {
                target: {value: "https://github.com/Wieedze/ARP?skill=arp"},
            });
            fireEvent.click(screen.getByRole("button", {name: "Add it"}));
            expect(await screen.findByText("Listed.")).toBeTruthy();
            expect(screen.getByRole("link", {name: "Open its page →"}).getAttribute("href")).toBe(
                "/atom/0xabc",
            );
            expect(fetch).toHaveBeenCalledTimes(1);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it("says so when the path does not exist", async () => {
        renderWithProviders(<StartPage feed={feedWith([]).feed} />, at("operator"));
        expect(await screen.findByText("No path by that name")).toBeTruthy();
    });
});
