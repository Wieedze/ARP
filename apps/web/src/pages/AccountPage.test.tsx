import {fireEvent, screen, within} from "@testing-library/react";
import {type Delegation} from "@metamask/smart-accounts-kit";
import {describe, expect, it, vi} from "vitest";
import {getAddress, parseEther, type Hex} from "viem";

import {AccountPage} from "./AccountPage";
import {type AccountDelegations, type DelegationRow} from "../hooks/use-account-delegations";
import {stakeDelegation} from "../services/delegation";
import {describeDelegation} from "../services/delegation-view";
import {renderWithProviders} from "../test/render";

/**
 * `/account` rendered with its data injected, so what is asserted is what an operator reads and
 * which controls exist — never a chain read and never a signature.
 */
const OPERATOR: Hex = "0x000000000000000000000000000000000000c0DE";
const SA: Hex = "0x00000000000000000000000000000000000000aa";
const RUNTIME = getAddress("0x00000000000000000000000000000000000000d1");

function row(state: DelegationRow["state"] = "enabled"): DelegationRow {
    const delegation: Delegation = {
        ...stakeDelegation({
            delegator: SA,
            delegate: RUNTIME,
            cap: parseEther("2"),
            periodSeconds: 86_400n,
            salt: `0x${"01".repeat(32)}`,
        }),
        signature: "0x1234",
    };
    return {
        stored: {delegation, signedAt: 1_798_000_000},
        view: describeDelegation(delegation),
        state,
    };
}

function mutation() {
    return {mutate: vi.fn(), isPending: false, error: null, variables: undefined};
}

function account(overrides: Partial<Record<string, unknown>> = {}): AccountDelegations {
    // The page reads a handful of fields off each mutation; the full TanStack result is not needed.
    return {
        operator: OPERATOR,
        walletChainId: 13579,
        onTestnet: true,
        switchToTestnet: vi.fn().mockResolvedValue(undefined),
        smartAccount: {address: SA, isDeployed: true},
        smartAccountError: null,
        rows: [row()],
        runtimes: [{address: RUNTIME, balance: parseEther("0.5")}],
        suggestedDelegate: null,
        deploy: mutation(),
        sign: mutation(),
        revoke: mutation(),
        ...overrides,
    } as unknown as AccountDelegations;
}

describe("the account page", () => {
    it("lists a stored delegation with its delegate, its cap and its state", () => {
        renderWithProviders(<AccountPage account={account()} />);
        const table = screen.getByRole("table", {name: "Delegations"});
        expect(within(table).getByText(RUNTIME)).toBeInTheDocument();
        expect(within(table).getByText(/2 tTRUST \/ 1d/)).toBeInTheDocument();
        expect(within(table).getByText("active")).toBeInTheDocument();
        expect(within(table).getByText("local only")).toBeInTheDocument();
    });

    it("asks for confirmation before revoking, and the confirmation names the chain", () => {
        const acct = account();
        renderWithProviders(<AccountPage account={acct} />);

        fireEvent.click(screen.getByRole("button", {name: "Revoke"}));
        const confirm = screen.getByRole("group", {name: "Confirm revocation"});
        expect(confirm).toHaveTextContent("13579");
        expect(acct.revoke.mutate).not.toHaveBeenCalled();

        fireEvent.click(within(confirm).getByRole("button", {name: "Revoke in wallet"}));
        expect(acct.revoke.mutate).toHaveBeenCalledTimes(1);
        expect(vi.mocked(acct.revoke.mutate).mock.calls[0][0]).toBe(acct.rows[0].stored.delegation);
    });

    it("offers no revoke on a delegation already revoked or whose state is unknown", () => {
        renderWithProviders(
            <AccountPage account={account({rows: [row("disabled"), row("unknown")]})} />,
        );
        expect(screen.getByText("revoked")).toBeInTheDocument();
        expect(screen.getByText("unknown")).toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Revoke"})).toBeNull();
    });

    it("renders no signing control on mainnet 1155", () => {
        renderWithProviders(<AccountPage account={account()} />, {mainnet: true});
        expect(screen.getByText("Signing: testnet only")).toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Revoke"})).toBeNull();
        expect(screen.queryByRole("button", {name: "Review"})).toBeNull();
        expect(screen.queryByRole("button", {name: /Deploy/})).toBeNull();
        // The stored row and its export stay readable.
        expect(screen.getByText(RUNTIME, {selector: "td"})).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Export"})).toBeInTheDocument();
    });

    it("asks to switch the wallet when it is not on 13579, and offers nothing that signs", () => {
        renderWithProviders(
            <AccountPage account={account({onTestnet: false, walletChainId: 1155})} />,
        );
        expect(screen.getByRole("button", {name: /Switch wallet to/})).toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Revoke"})).toBeNull();
        expect(screen.queryByRole("button", {name: "Review"})).toBeNull();
    });

    it("signs a new delegation only from the second click, which names the chain", () => {
        const acct = account({rows: []});
        renderWithProviders(<AccountPage account={acct} />);

        fireEvent.change(screen.getByLabelText("Delegate"), {
            target: {value: RUNTIME.toLowerCase()},
        });
        fireEvent.change(screen.getByLabelText(/Cap per period/), {target: {value: "3"}});
        fireEvent.click(screen.getByRole("button", {name: "Review"}));
        expect(acct.sign.mutate).not.toHaveBeenCalled();
        expect(screen.getByText(/Sign on .*\(13579\)/)).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", {name: "Sign in wallet"}));
        expect(acct.sign.mutate).toHaveBeenCalledWith({
            delegate: RUNTIME,
            cap: parseEther("3"),
            periodSeconds: 86_400n,
        });
    });

    it("refuses a delegate that is not an address before anything is signed", () => {
        const acct = account({rows: []});
        renderWithProviders(<AccountPage account={acct} />);
        fireEvent.change(screen.getByLabelText("Delegate"), {target: {value: "nobody"}});
        fireEvent.click(screen.getByRole("button", {name: "Review"}));
        expect(screen.getByRole("alert")).toHaveTextContent("Delegate must be an address");
        expect(acct.sign.mutate).not.toHaveBeenCalled();
    });

    it("asks for a wallet when none is connected", () => {
        renderWithProviders(<AccountPage account={account({operator: undefined})} />);
        expect(screen.getByText(/Connect a wallet/)).toBeInTheDocument();
        expect(screen.queryByRole("table")).toBeNull();
    });
});
