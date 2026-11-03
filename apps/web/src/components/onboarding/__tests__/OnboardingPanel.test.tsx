import {fireEvent, screen} from "@testing-library/react";
import {describe, expect, it} from "vitest";

import {WalletConnect} from "../../WalletConnect";
import {OnboardingProvider} from "../OnboardingPanel";
import {renderWithProviders} from "../../../test/render";

describe("the onboarding panel", () => {
    it("opens from Connect with the three paths first and the wallet last", async () => {
        renderWithProviders(
            <OnboardingProvider>
                <WalletConnect />
            </OnboardingProvider>,
        );

        // ADR 0114: Connect opens the onboarding, not the wallet.
        fireEvent.click(await screen.findByRole("button", {name: "Connect"}));
        const dialog = await screen.findByRole("dialog", {name: "What brings you here?"});
        const links = [...dialog.querySelectorAll("a")].map((a) => a.getAttribute("href"));
        expect(links).toEqual(["/start/claude", "/start/agent", "/start/tool"]);
        // The wallet comes last, after the three paths.
        expect(screen.getByRole("button", {name: "I have a wallet"})).toBeTruthy();
        // The first path has the focus, so the keyboard starts where the eye does.
        expect(document.activeElement?.getAttribute("href")).toBe("/start/claude");
    });

    it("closes on Escape", async () => {
        renderWithProviders(
            <OnboardingProvider>
                <WalletConnect />
            </OnboardingProvider>,
        );
        fireEvent.click(await screen.findByRole("button", {name: "Connect"}));
        await screen.findByRole("dialog");
        fireEvent.keyDown(window, {key: "Escape"});
        expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("holds the page still while open, and gives the focus back to Connect on close", async () => {
        renderWithProviders(
            <OnboardingProvider>
                <WalletConnect />
            </OnboardingProvider>,
        );
        const connect = await screen.findByRole("button", {name: "Connect"});
        connect.focus();
        fireEvent.click(connect);
        await screen.findByRole("dialog");
        // `SceneDeck` reads this flag and leaves the wheel alone while the sheet is up.
        expect(document.body.dataset.modal).toBe("open");
        // On the root element: `body`'s overflow does not lock the window, because `index.css`
        // clips `html, body` and the body's value is then never handed to the viewport.
        expect(document.documentElement.style.overflow).toBe("hidden");

        fireEvent.click(screen.getByRole("button", {name: "Close"}));
        expect(document.body.dataset.modal).toBeUndefined();
        expect(document.documentElement.style.overflow).toBe("");
        expect(document.activeElement).toBe(screen.getByRole("button", {name: "Connect"}));
    });
});
