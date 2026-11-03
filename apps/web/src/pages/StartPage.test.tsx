import {fireEvent, screen, waitFor} from "@testing-library/react";
import {beforeEach, describe, expect, it, vi} from "vitest";

import type {ListToolResult} from "../services/list-tool";
import type {ProposeCategoryResult} from "../services/propose-category";

const listing: {
    available: boolean;
    submit: ReturnType<typeof vi.fn>;
    pending: boolean;
    result: ListToolResult | null;
} = {available: true, submit: vi.fn(), pending: false, result: null};

vi.mock("../hooks/use-list-tool", () => ({useListTool: () => listing}));

const proposal: {
    available: boolean;
    submit: ReturnType<typeof vi.fn>;
    pending: boolean;
    result: ProposeCategoryResult | null;
} = {available: true, submit: vi.fn(), pending: false, result: null};

vi.mock("../hooks/use-propose-category", () => ({useProposeCategory: () => proposal}));
vi.mock("../hooks/use-domain-tree", () => ({
    useDomainTree: () => ({
        tree: undefined,
        error: null,
        options: [
            {label: "design", depth: 1},
            {label: "payment", depth: 1},
        ],
    }),
}));

beforeEach(() => {
    listing.available = true;
    listing.submit = vi.fn();
    listing.pending = false;
    listing.result = null;
    proposal.submit = vi.fn();
    proposal.pending = false;
    proposal.result = null;
});

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
        ).toBe("/register?what=tool");
    });

    it("offers only the wallet path when no sponsor is configured", async () => {
        listing.available = false;
        renderWithProviders(<StartPage feed={feedWith([]).feed} />, at("tool"));
        expect(await screen.findByRole("link", {name: "Add it with a wallet →"})).toBeTruthy();
        expect(screen.queryByLabelText("Tool or skill URL")).toBeNull();
    });

    it("offers the category step once the tool is listed: an existing one, or a new one", async () => {
        listing.result = {status: "listed", atomId: "0xabc", created: true, transactions: []};
        renderWithProviders(<StartPage feed={feedWith([]).feed} />, at("tool"));

        const select = await screen.findByLabelText("Category");
        fireEvent.change(select, {target: {value: "design"}});
        fireEvent.click(screen.getByRole("button", {name: "File it"}));
        expect(proposal.submit).toHaveBeenCalledWith({label: "design", subjectId: "0xabc"});

        fireEvent.change(select, {target: {value: "__none-fits"}});
        fireEvent.change(screen.getByLabelText("New category"), {target: {value: "slides"}});
        fireEvent.change(screen.getByLabelText("Under"), {target: {value: "design"}});
        fireEvent.change(screen.getByLabelText("Why none fits"), {
            target: {value: "no deck category"},
        });
        fireEvent.click(screen.getByRole("button", {name: "File it"}));
        expect(proposal.submit).toHaveBeenLastCalledWith({
            label: "slides",
            parent: "design",
            reason: "no deck category",
            subjectId: "0xabc",
        });
    });

    it("shows no category step before a tool is listed", async () => {
        renderWithProviders(<StartPage feed={feedWith([]).feed} />, at("tool"));
        await screen.findByLabelText("Tool or skill URL");
        expect(screen.queryByLabelText("Category")).toBeNull();
    });

    it("says so when the path does not exist", async () => {
        renderWithProviders(<StartPage feed={feedWith([]).feed} />, at("operator"));
        expect(await screen.findByText("No path by that name")).toBeTruthy();
    });
});
