import {fireEvent, screen, waitFor} from "@testing-library/react";
import {beforeEach, describe, expect, it, vi} from "vitest";

import type {ListToolResult} from "../services/list-tool";

const listing: {
    available: boolean;
    submit: ReturnType<typeof vi.fn>;
    pending: boolean;
    result: ListToolResult | null;
} = {available: true, submit: vi.fn(), pending: false, result: null};

vi.mock("../hooks/use-list-tool", () => ({useListTool: () => listing}));

beforeEach(() => {
    listing.available = true;
    listing.submit = vi.fn();
    listing.pending = false;
    listing.result = null;
});

import {StartPage} from "./StartPage";
import {RouteTransition} from "../components/brand/RouteTransition";
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
        listing.result = {status: "listed", atomId: "0xabc", created: true, transactions: []};
        renderWithProviders(<StartPage feed={feedWith([]).feed} />, at("tool"));
        fireEvent.change(await screen.findByLabelText("Tool or skill URL"), {
            target: {value: "https://github.com/Wieedze/ARP?skill=arp"},
        });
        fireEvent.click(screen.getByRole("button", {name: "Add it"}));
        expect(listing.submit).toHaveBeenCalledWith("https://github.com/Wieedze/ARP?skill=arp");
        expect(screen.getByText("Listed.")).toBeTruthy();
        expect(screen.getByRole("link", {name: "Open its page →"}).getAttribute("href")).toBe(
            "/atom/0xabc",
        );
        expect(screen.queryByRole("link", {name: "Add it with a wallet →"})).toBeNull();
    });

    it("keeps the wallet path when the sponsor cannot help", async () => {
        listing.result = {status: "unavailable"};
        renderWithProviders(<StartPage feed={feedWith([]).feed} />, at("tool"));
        expect(await screen.findByText("Adding is not available right now.")).toBeTruthy();
        expect(
            screen.getByRole("link", {name: "Add it with a wallet →"}).getAttribute("href"),
        ).toBe("/start/tool?with=wallet");
    });

    it("opens the wallet form on the same page", async () => {
        renderWithProviders(<StartPage feed={feedWith([]).feed} />, at("tool?with=wallet"));
        expect(await screen.findByLabelText("Tool URL")).toBeTruthy();
        expect(screen.getByRole("heading", {name: "Add it with a wallet"})).toBeTruthy();
        expect(screen.getByLabelText("Repository URL")).toBeTruthy();
    });

    it("asks whether the agent has an id, and shows the free steps until told yes", async () => {
        renderWithProviders(<StartPage feed={feedWith([]).feed} />, at("agent"));
        expect(await screen.findByText("Install ARP in your project")).toBeTruthy();
        expect(screen.getByRole("button", {name: "No"})).toHaveAttribute("aria-pressed", "true");
        fireEvent.click(screen.getByRole("button", {name: "Yes, it has one"}));
        // The steps would mint a second identity, so the import replaces them.
        expect(
            await screen.findByRole("heading", {name: "Import an agent you already have"}),
        ).toBeTruthy();
        expect(screen.queryByText("Install ARP in your project")).toBeNull();
    });

    it("offers the wallet mint under the agent steps", async () => {
        // Inside `RouteTransition`, which remounts the page on the push, as the app does.
        renderWithProviders(
            <RouteTransition>
                <StartPage feed={feedWith([]).feed} />
            </RouteTransition>,
            at("agent"),
        );
        const link = await screen.findByRole("link", {name: "Mint with a wallet instead →"});
        expect(link.getAttribute("href")).toBe("/start/agent?with=wallet");
        fireEvent.click(link);
        expect(
            await screen.findByRole("heading", {name: "Mint an ERC-8004 identity"}),
        ).toBeTruthy();
        expect(screen.queryByRole("link", {name: "Mint with a wallet instead →"})).toBeNull();
        // The link that held the focus is gone, so the form it opened takes it.
        await waitFor(() => expect(document.activeElement?.tagName).toBe("SECTION"));
    });

    it("leaves the focus alone when the URL opens the wallet form on arrival", async () => {
        renderWithProviders(<StartPage feed={feedWith([]).feed} />, at("agent?with=wallet"));
        await screen.findByRole("heading", {name: "Mint an ERC-8004 identity"});
        expect(document.activeElement?.tagName).not.toBe("SECTION");
    });

    it("gives the Claude path no wallet form", async () => {
        renderWithProviders(<StartPage feed={feedWith([]).feed} />, at("claude?with=wallet"));
        await screen.findByRole("heading", {name: "I use Claude"});
        expect(screen.queryByText(/wallet/i)).toBeNull();
    });

    it("offers only the wallet path when no sponsor is configured", async () => {
        listing.available = false;
        renderWithProviders(<StartPage feed={feedWith([]).feed} />, at("tool"));
        expect(await screen.findByRole("link", {name: "Add it with a wallet →"})).toBeTruthy();
        expect(screen.queryByLabelText("Tool or skill URL")).toBeNull();
    });

    it("says so when the path does not exist", async () => {
        renderWithProviders(<StartPage feed={feedWith([]).feed} />, at("operator"));
        expect(await screen.findByText("No path by that name")).toBeTruthy();
    });
});
