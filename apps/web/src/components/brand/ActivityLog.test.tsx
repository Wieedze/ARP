import {screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {beforeEach, describe, expect, it} from "vitest";

import {ActivityLog as Panel} from "./ActivityLog";
import {ActivityLog as Store} from "../../services/activity-log";
import {renderWithProviders} from "../../test/render";

/**
 * Behavioural throughout, which `rules/code.md` makes load-bearing: a snapshot of this panel would
 * pass with every line unreadable. So each case asserts what a reader gets — a time that reads as a
 * clock, a cost that reads as TRUST, a step named in words — and never which class carried it.
 */
const at = (h: number, m: number, s: number) => new Date(2026, 9, 30, h, m, s).getTime();

function withEntries(fill: (store: Store) => void) {
    const store = new Store();
    fill(store);
    renderWithProviders(<Panel store={store} />);
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
        const toggle = screen.getByRole("button", {name: /activité/i});
        expect(toggle.getAttribute("aria-expanded")).toBe("false");

        await userEvent.click(toggle);
        expect(toggle.getAttribute("aria-expanded")).toBe("true");
        // `ui.md`: an empty state says what would normally be there and how to make it appear.
        expect(screen.getByText(/Rien encore/i).textContent).toMatch(/Déclarer un usage/i);
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
        await userEvent.click(screen.getByRole("button", {name: /activité/i}));

        expect(screen.getByText("21:42:19")).toBeTruthy();
        expect(screen.getByText("reçu")).toBeTruthy();
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
        await userEvent.click(screen.getByRole("button", {name: /activité/i}));
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
        await userEvent.click(screen.getByRole("button", {name: /activité/i}));

        expect(screen.getByText("accès")).toBeTruthy();
        expect(screen.getByText("sur la chaîne")).toBeTruthy();
        expect(screen.getByText(/Agent 13579:4 → oasf/)).toBeTruthy();
    });

    it("counts how many of the entries are the viewer's own", async () => {
        // The count in the closed bar is the whole reason to glance at it. "3 · 1 de vous" says
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
        expect(screen.getByRole("button", {name: /activité/i}).textContent).toMatch(
            /3 · 1 de vous/,
        );
    });

    it("shows a line appended after it was already open", async () => {
        // The store is subscribable and the hook bridges it. Without that the panel renders once
        // and then lies for the rest of the session.
        const store = withEntries(() => {});
        await userEvent.click(screen.getByRole("button", {name: /activité/i}));
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
                store.append({stream: "mine", step: "access", label: "accès", at: at(1, 2, 3)});
            });
            await userEvent.click(screen.getByRole("button", {name: /activité/i}));
            expect(screen.getByText("01:02:03")).toBeTruthy();
        } finally {
            Object.defineProperty(window, "localStorage", {configurable: true, value: original});
        }
    });
});
