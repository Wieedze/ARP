import {act, fireEvent, render, screen} from "@testing-library/react";
import {lazy, Suspense, useEffect} from "react";
import {MemoryRouter, Route, Routes} from "react-router-dom";
import {beforeEach, describe, expect, it, vi} from "vitest";
import {ProviderNotFoundError} from "wagmi";

import {ConnectPrompt} from "../ConnectPrompt";
import {OnboardingProvider} from "../OnboardingPanel";
import {useOnboarding} from "../onboarding-context";
import {renderWithProviders} from "../../../test/render";

const connect = vi.fn();
let connectError: Error | null = null;

vi.mock("wagmi", async (importOriginal) => ({
    ...(await importOriginal<typeof import("wagmi")>()),
    useConnect: () => ({
        connectors: [{id: "injected"}],
        connect,
        isPending: false,
        error: connectError,
    }),
}));

beforeEach(() => {
    connect.mockReset();
    connectError = null;
});

/** Stands in for Get started: anything that opens the panel through the context. */
function Opener() {
    const onboarding = useOnboarding();
    return (
        <button type="button" onClick={onboarding.open}>
            Get started
        </button>
    );
}

function panel() {
    return renderWithProviders(
        <OnboardingProvider>
            <Opener />
        </OnboardingProvider>,
    );
}

describe("the onboarding panel", () => {
    it("offers the three paths and no wallet", async () => {
        panel();
        fireEvent.click(await screen.findByRole("button", {name: "Get started"}));
        const dialog = await screen.findByRole("dialog", {name: "What brings you here?"});
        const links = [...dialog.querySelectorAll("a")].map((a) => a.getAttribute("href"));
        expect(links).toEqual(["/start/claude", "/start/agent", "/start/tool"]);
        // Task 62, ADR 0128: a wallet is asked for by an action that signs, not here.
        expect(dialog.textContent).not.toMatch(/wallet/i);
        // The first path has the focus, so the keyboard starts where the eye does.
        expect(document.activeElement?.getAttribute("href")).toBe("/start/claude");
    });

    it("closes on Escape", async () => {
        panel();
        fireEvent.click(await screen.findByRole("button", {name: "Get started"}));
        await screen.findByRole("dialog");
        fireEvent.keyDown(window, {key: "Escape"});
        expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("holds the page still while open, and gives the focus back to its opener on close", async () => {
        panel();
        const opener = await screen.findByRole("button", {name: "Get started"});
        opener.focus();
        fireEvent.click(opener);
        await screen.findByRole("dialog");
        // `SceneDeck` reads this flag and leaves the wheel alone while the sheet is up.
        expect(document.body.dataset.modal).toBe("open");
        // On the root element: `body`'s overflow does not lock the window, because `index.css`
        // clips `html, body` and the body's value is then never handed to the viewport.
        expect(document.documentElement.style.overflow).toBe("hidden");

        fireEvent.click(screen.getByRole("button", {name: "Close"}));
        expect(document.body.dataset.modal).toBeUndefined();
        expect(document.documentElement.style.overflow).toBe("");
        expect(document.activeElement).toBe(screen.getByRole("button", {name: "Get started"}));
    });
});

describe("leaving the panel for a path", () => {
    it("stays open over the loading route and closes once the path's page is mounted", async () => {
        let resolvePage: (() => void) | null = null;
        function Landed() {
            const {landed} = useOnboarding();
            useEffect(() => landed(), [landed]);
            return <h1>The path</h1>;
        }
        // A route that suspends until the test lets it through, as a lazy chunk does.
        const Page = lazy(
            () =>
                new Promise<{default: typeof Landed}>((resolve) => {
                    resolvePage = () => resolve({default: Landed});
                }),
        );
        render(
            <MemoryRouter initialEntries={["/"]}>
                <OnboardingProvider>
                    <Routes>
                        <Route path="/" element={<Opener />} />
                        <Route
                            path="/start/:profile"
                            element={
                                <Suspense fallback={<p>loading your path…</p>}>
                                    <Page />
                                </Suspense>
                            }
                        />
                    </Routes>
                </OnboardingProvider>
            </MemoryRouter>,
        );
        fireEvent.click(screen.getByRole("button", {name: "Get started"}));
        const dialog = await screen.findByRole("dialog");
        const agent = dialog.querySelector('a[href="/start/agent"]');
        if (agent === null) throw new Error("no agent path in the panel");
        fireEvent.click(agent);

        // The route is loading: the sheet still covers it.
        expect(await screen.findByText("loading your path…")).toBeTruthy();
        expect(screen.getByRole("dialog")).toBeTruthy();

        await act(async () => resolvePage?.());
        expect(await screen.findByRole("heading", {name: "The path"})).toBeTruthy();
        expect(screen.queryByRole("dialog")).toBeNull();
    });
});

describe("the connect prompt", () => {
    it("connects the wallet where an action needs one, without opening the panel", async () => {
        renderWithProviders(
            <OnboardingProvider>
                <ConnectPrompt label="Connect a wallet to add support" />
            </OnboardingProvider>,
        );
        fireEvent.click(
            await screen.findByRole("button", {name: "Connect a wallet to add support"}),
        );
        expect(connect).toHaveBeenCalledWith({connector: {id: "injected"}});
        expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("says so when no wallet extension answers", async () => {
        // `injected()` is always configured, so the absence shows up only as `connect`'s error.
        connectError = new ProviderNotFoundError();
        renderWithProviders(<ConnectPrompt label="Connect a wallet to add support" />);
        expect(await screen.findByText("No wallet detected")).toBeTruthy();
        expect(screen.getByRole("button", {name: "Connect a wallet to add support"})).toBeTruthy();
    });

    it("says nothing until something went wrong", async () => {
        renderWithProviders(<ConnectPrompt label="Connect a wallet to add support" />);
        await screen.findByRole("button", {name: "Connect a wallet to add support"});
        expect(screen.queryByText("No wallet detected")).toBeNull();
    });
});
