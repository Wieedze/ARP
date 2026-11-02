import {fireEvent, screen, waitFor} from "@testing-library/react";
import {describe, expect, it} from "vitest";

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
        expect(screen.queryByText(/wallet/i)).toBeNull();
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
        fireEvent.submit(field.closest("form") as HTMLFormElement);
        await waitFor(() => expect(screen.queryByLabelText("Repository URL")).toBeNull());
    });

    it("says so when the path does not exist", async () => {
        renderWithProviders(<StartPage feed={feedWith([]).feed} />, at("operator"));
        expect(await screen.findByText("No path by that name")).toBeTruthy();
    });
});
