import {screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {beforeEach, describe, expect, it} from "vitest";

import {ActivityLog as Panel} from "./ActivityLog";
import {ActivityLog as Store} from "../../services/activity-log";
import {AgentFeed, type EventSourceLike} from "../../services/agent-feed";
import {renderWithProviders} from "../../test/render";

/**
 * Behavioural throughout, which `rules/code.md` makes load-bearing: a snapshot of this panel would
 * pass with every line unreadable. So each case asserts what a reader gets — a time that reads as a
 * clock, a cost that reads as TRUST, a step named in words — and never which class carried it.
 */
const at = (h: number, m: number, s: number) => new Date(2026, 9, 30, h, m, s).getTime();

/** A feed with no URL: it never connects, so the panel shows no feed state. */
const quietFeed = (store: Store) =>
    new AgentFeed(store, {url: undefined, open: () => fakeSource(), readReceipt: async () => null});

function fakeSource(): EventSourceLike & {fire: (data: unknown) => void; open: () => void} {
    const source: EventSourceLike & {fire: (data: unknown) => void; open: () => void} = {
        onopen: null,
        onmessage: null,
        onerror: null,
        close: () => undefined,
        fire: (data) =>
            source.onmessage?.(new MessageEvent("message", {data: JSON.stringify(data)})),
        open: () => source.onopen?.(new Event("open")),
    };
    return source;
}

function withEntries(fill: (store: Store) => void) {
    const store = new Store();
    fill(store);
    renderWithProviders(<Panel store={store} feed={quietFeed(store)} />);
    return store;
}

beforeEach(() => {
    try {
        window.localStorage.clear();
    } catch {
        // A browser that refuses storage is a browser this panel still works in.
    }
});

describe("the activity panel", () => {
    it("is closed at first, and says there is nothing rather than showing an empty box", async () => {
        // It is fixed to the foot of every page, so opening by default would take a strip off every
        // layout for a surface most visits do not need.
        withEntries(() => {});
        const toggle = screen.getByRole("button", {name: /^activity/i});
        expect(toggle.getAttribute("aria-expanded")).toBe("false");

        await userEvent.click(toggle);
        expect(toggle.getAttribute("aria-expanded")).toBe("true");
        // `ui.md`: an empty state says what would normally be there and how to make it appear.
        expect(screen.getByText(/Nothing yet/i).textContent).toMatch(/Declaring a use/i);
    });

    it("prints an event with the values it happened with, and no verdict of ours", async () => {
        // The line this panel exists for. A reader gets the step, the subject, the digest and the
        // cost — all checkable — and nothing that reads as the app vouching for itself.
        withEntries((store) => {
            store.append({
                stream: "mine",
                step: "receipt",
                label: "using-git-worktrees",
                detail: "signé 0x8A18… · sha256 8cfb86…",
                at: at(21, 42, 19),
            });
        });
        await userEvent.click(screen.getByRole("button", {name: /^activity/i}));

        expect(screen.getByText("21:42:19")).toBeTruthy();
        expect(screen.getByText("receipt")).toBeTruthy();
        expect(screen.getByText("using-git-worktrees")).toBeTruthy();
        expect(screen.getByText(/sha256 8cfb86/)).toBeTruthy();
    });

    it("renders a cost as TRUST and never as wei", async () => {
        // 2000000002000000 wei is what a triple costs on 13579. Printed raw it is unreadable, and
        // printed as a float it is wrong — `formatEther` on the string is the only honest route.
        withEntries((store) => {
            store.append({
                stream: "mine",
                step: "declaration",
                label: "1 appel",
                costWei: "2000000002000000",
                at: at(21, 42, 24),
            });
        });
        await userEvent.click(screen.getByRole("button", {name: /^activity/i}));
        expect(screen.getByText(/0\.002000000002 tTRUST/)).toBeTruthy();
        expect(screen.queryByText(/2000000002000000/)).toBeNull();
    });

    it("names the chain's own step differently from the viewer's", async () => {
        // The two streams are two kinds of evidence: the chain holds the declaration and nothing
        // about how it was arrived at. A reader has to be able to tell them apart in words, not
        // only by how dim the row is.
        withEntries((store) => {
            store.append({stream: "mine", step: "access", label: "à moi", at: at(21, 0, 1)});
            store.append({
                stream: "chain",
                step: "landed",
                label: "uses",
                detail: "Agent 13579:4 → oasf · 1 position",
                key: "0xabc",
                at: at(21, 0, 2),
            });
        });
        await userEvent.click(screen.getByRole("button", {name: /^activity/i}));

        expect(screen.getByText("access")).toBeTruthy();
        expect(screen.getByText("on chain")).toBeTruthy();
        expect(screen.getByText(/Agent 13579:4 → oasf/)).toBeTruthy();
    });

    it("counts how many of the entries are the viewer's own", async () => {
        // The count in the closed bar is the whole reason to glance at it. "3 · 1 yours" says
        // something a bare total does not.
        withEntries((store) => {
            store.append({stream: "mine", step: "access", label: "a", at: at(21, 0, 1)});
            store.append({
                stream: "chain",
                step: "landed",
                label: "b",
                key: "k1",
                at: at(21, 0, 2),
            });
            store.append({
                stream: "chain",
                step: "landed",
                label: "c",
                key: "k2",
                at: at(21, 0, 3),
            });
        });
        expect(screen.getByRole("button", {name: /^activity/i}).textContent).toMatch(
            /3 · 1 yours · 0 agent/,
        );
    });

    it("shows a line appended after it was already open", async () => {
        // The store is subscribable and the hook bridges it. Without that the panel renders once
        // and then lies for the rest of the session.
        const store = withEntries(() => {});
        await userEvent.click(screen.getByRole("button", {name: /^activity/i}));
        store.append({stream: "mine", step: "confirmed", label: "confirmé", at: at(21, 42, 31)});
        await waitFor(() => expect(screen.getByText("21:42:31")).toBeTruthy());
    });

    it("stays usable when the browser refuses storage", async () => {
        // A private window throws on `localStorage` rather than returning empty, and the panel
        // must still open — the remembered choice is a convenience, not a dependency.
        const original = window.localStorage;
        Object.defineProperty(window, "localStorage", {
            configurable: true,
            get() {
                throw new Error("refusé");
            },
        });
        try {
            withEntries((store) => {
                store.append({stream: "mine", step: "access", label: "access", at: at(1, 2, 3)});
            });
            await userEvent.click(screen.getByRole("button", {name: /^activity/i}));
            expect(screen.getByText("01:02:03")).toBeTruthy();
        } finally {
            Object.defineProperty(window, "localStorage", {configurable: true, value: original});
        }
    });

    it("relays the agent's feed: the skill it invoked, and the declaration it sent", async () => {
        const store = new Store();
        const source = fakeSource();
        const feed = new AgentFeed(store, {
            url: "http://feed",
            open: () => source,
            readReceipt: async () => null,
        });
        renderWithProviders(<Panel store={store} feed={feed} />);
        await waitFor(() => expect(screen.getByText("agent …")).toBeTruthy());
        source.open();
        await waitFor(() => expect(screen.getByText("agent live")).toBeTruthy());

        const atom = `0x${"c".repeat(64)}`;
        source.fire({
            source: "session",
            at: "2026-10-30T13:10:36Z",
            kind: "skill",
            name: "brainstorming",
            ref: atom,
            outcome: "ok",
            ms: 9,
        });
        source.fire({
            source: "sent",
            at: "2026-10-30T13:11:00Z",
            chainId: 13579,
            status: "success",
            hash: `0x${"e".repeat(64)}`,
            value: "2000000002000000",
            decoded: {
                fn: "createTriples",
                subjects: [`0x${"a".repeat(64)}`],
                predicates: [`0x${"b".repeat(64)}`],
                objects: [atom],
            },
        });
        await userEvent.click(screen.getByRole("button", {name: /^activity/i}));
        expect(screen.getByText("invoked")).toBeTruthy();
        expect(screen.getByText("declared")).toBeTruthy();
        // The declaration names the skill it is about, by the name the agent invoked it with.
        expect(screen.getByText(/→ brainstorming/)).toBeTruthy();
        expect(screen.getByRole("button", {name: /^activity/i}).textContent).toMatch(/2 agent/);
    });

    it("links every transaction to its own chain's explorer", async () => {
        withEntries((store) => {
            store.append({
                stream: "mine",
                step: "sent",
                label: "deposit",
                tx: `0x${"ab".repeat(32)}`,
                chainId: 1155,
                at: at(21, 0, 1),
            });
            store.append({
                stream: "chain",
                step: "landed",
                label: "uses",
                tx: `0x${"cd".repeat(32)}`,
                chainId: 13579,
                key: "k",
                at: at(21, 0, 2),
            });
        });
        await userEvent.click(screen.getByRole("button", {name: /^activity/i}));
        const links = screen.getAllByRole("link", {name: /^Transaction 0x/});
        expect(links.map((link) => link.getAttribute("href"))).toEqual([
            `https://explorer.intuition.systems/tx/0x${"ab".repeat(32)}`,
            `https://testnet.explorer.intuition.systems/tx/0x${"cd".repeat(32)}`,
        ]);
    });
});
