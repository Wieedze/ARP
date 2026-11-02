import {fireEvent, render, screen} from "@testing-library/react";
import {MemoryRouter, Route, Routes} from "react-router-dom";
import {describe, expect, it, vi} from "vitest";

/**
 * The wallet menu (`docs/tasks/35` §0): copy the address, open `/account`, disconnect. wagmi is
 * mocked to a connected account, because the real config never connects under `happy-dom`.
 */
const disconnect = vi.fn();
vi.mock("wagmi", () => ({
    useAccount: () => ({
        address: "0x000000000000000000000000000000000000c0DE",
        isConnected: true,
        status: "connected",
    }),
    useConnect: () => ({connectors: [], connect: vi.fn(), isPending: false}),
    useDisconnect: () => ({disconnect}),
}));

import {WalletConnect} from "./WalletConnect";

function renderMenu() {
    render(
        <MemoryRouter initialEntries={["/"]}>
            <Routes>
                <Route path="/" element={<WalletConnect />} />
                <Route path="/account" element={<p>account page</p>} />
            </Routes>
        </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", {name: /0x0000…c0DE/}));
}

describe("the wallet menu", () => {
    it("offers copy, Account and disconnect, in that order", () => {
        renderMenu();
        expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
            "Copy address",
            "Account",
            "Disconnect",
        ]);
    });

    it("opens /account from Account", () => {
        renderMenu();
        fireEvent.click(screen.getByRole("menuitem", {name: "Account"}));
        expect(screen.getByText("account page")).toBeInTheDocument();
    });

    it("disconnects from Disconnect", () => {
        renderMenu();
        fireEvent.click(screen.getByRole("menuitem", {name: "Disconnect"}));
        expect(disconnect).toHaveBeenCalledTimes(1);
    });
});
