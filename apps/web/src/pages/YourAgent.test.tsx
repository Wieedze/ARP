import {fireEvent, render, screen} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";

import {
    MAINNET_MINT,
    TESTNET_MINT,
    type MintQuote,
    type MintTarget,
} from "../services/identity-mint";

/**
 * The mint keeps the chain its quote was made on (`docs/tasks/50` §4). The toggle is the hook's
 * `target`, swapped between renders; wagmi is mocked to a wallet on 13579, because the real config
 * never connects under `happy-dom`.
 */
const OWNER = "0x000000000000000000000000000000000000c0DE";
let toggle: MintTarget = TESTNET_MINT;
const submit = vi.fn();

vi.mock("wagmi", async (importOriginal) => ({
    ...(await importOriginal<typeof import("wagmi")>()),
    useAccount: () => ({address: OWNER, isConnected: true, chainId: 13579}),
    useSwitchChain: () => ({switchChainAsync: vi.fn(), isPending: false}),
}));

vi.mock("../hooks/use-identity-mint", () => ({
    draftToAgentUri: () => "data:application/json;base64,e30=",
    useIdentityMint: () => ({
        target: toggle,
        quote: async (owner: string, agentUri: string): Promise<MintQuote> => ({
            predictedTokenId: "11",
            agentUri,
            uriBytes: 10,
            owner: owner as MintQuote["owner"], // The mocked account's address, a valid address.
            chainId: toggle.chain.id,
            registry: toggle.registry,
            gas: 100_000n,
            maxFeePerGas: null,
        }),
        submit,
    }),
}));

import {MintIdentity} from "./YourAgent";

describe("the mint after a toggle flip", () => {
    it("keeps showing and signing the chain the quote was made on", async () => {
        toggle = TESTNET_MINT;
        const {rerender} = render(<MintIdentity />);
        fireEvent.change(screen.getByLabelText("Name"), {target: {value: "Probe"}});
        fireEvent.click(screen.getByRole("button", {name: "Check what it costs"}));
        expect(await screen.findByText("Confirm before your wallet opens")).toBeInTheDocument();

        toggle = MAINNET_MINT;
        rerender(<MintIdentity />);

        expect(screen.getByText("Confirm before your wallet opens")).toBeInTheDocument();
        expect(screen.getByText("Intuition Testnet (13579)")).toBeInTheDocument();
        expect(screen.queryByText(/Base \(8453\)/)).toBeNull();
        expect(screen.queryByRole("button", {name: /Switch to/})).toBeNull();

        fireEvent.click(screen.getByRole("button", {name: "Mint"}));
        expect(submit).toHaveBeenCalledTimes(1);
        expect(submit.mock.calls[0]?.[0]).toMatchObject({
            chainId: 13579,
            registry: TESTNET_MINT.registry,
        });
    });
});
