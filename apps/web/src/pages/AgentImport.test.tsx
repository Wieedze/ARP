import {act, fireEvent, render, screen} from "@testing-library/react";
import type {IdentityAtomPlan} from "@arp-protocol/core";
import type {ReactNode} from "react";
import {MemoryRouter} from "react-router-dom";
import {describe, expect, it, vi} from "vitest";

import {ChainChoiceContext, choiceFor} from "../lib/chain-choice";

/**
 * Step 1 owns everything after it. Checking a second token must drop the first token's priced
 * record, or "Write the public record" sends the calls priced for the agent no longer on screen.
 */
const OWNER = "0x000000000000000000000000000000000000c0DE";
const ACCOUNT = "0x000000000000000000000000000000000000BEEF";
const publishIdentity = vi.fn<(plan: IdentityAtomPlan) => Promise<{txs: string[]}>>(async () => ({txs: []}));

vi.mock("wagmi", async (importOriginal) => ({
    ...(await importOriginal<typeof import("wagmi")>()),
    useAccount: () => ({address: OWNER, isConnected: true, chainId: 13579}),
    useSwitchChain: () => ({switchChainAsync: vi.fn(), isPending: false}),
}));

function planFor(tokenId: string): IdentityAtomPlan {
    const call = {kind: "createAtoms", to: OWNER, data: `0x0${tokenId}`, value: 1n};
    // The page reads only these fields; the rest of the plan is the protocol package's concern.
    return {
        caip19: `eip155:8453/erc721:0x/${tokenId}`,
        existing: {identityAtom: false, caipAtom: false, triple: false},
        uris: {identity: `ipfs://identity-${tokenId}`, caip: `ipfs://caip-${tokenId}`},
        tripleId: `0x${tokenId}`,
        calls: [call],
        totalValue: 1n,
        chainId: 13579,
    } as unknown as IdentityAtomPlan;
}

/** When set, `planIdentity` waits for the test to resolve it, so a reply can land late. */
type Held = {promise: Promise<IdentityAtomPlan>; resolve: (plan: IdentityAtomPlan) => void};
let held: Held | null = null;

function hold(): Held {
    let resolve: (plan: IdentityAtomPlan) => void = () => {};
    const promise = new Promise<IdentityAtomPlan>((done) => {
        resolve = done;
    });
    return {promise, resolve};
}

vi.mock("../hooks/use-agent-import", () => ({
    useAgentImport: () => ({
        verifyOwnership: async (params: {chainId: number; tokenId: string}) => ({
            status: "owned",
            ref: {chainId: params.chainId, tokenId: params.tokenId},
            caip19: `eip155:${params.chainId}/erc721:0x/${params.tokenId}`,
            owner: OWNER,
        }),
        resolveAtom: async () => null,
        deriveOperatingAccount: async () => ACCOUNT,
        signConsent: vi.fn(),
        planLink: vi.fn(),
        publishLink: vi.fn(),
        planIdentity: (agent: {tokenId: string}) =>
            held === null ? Promise.resolve(planFor(agent.tokenId)) : held.promise,
        publishIdentity,
    }),
}));

import {AgentImport} from "./AgentImport";

function Provider({children}: {children: ReactNode}) {
    return (
        <MemoryRouter>
            <ChainChoiceContext.Provider value={{choice: choiceFor(false), setMainnet: () => {}}}>
                {children}
            </ChainChoiceContext.Provider>
        </MemoryRouter>
    );
}

async function checkToken(tokenId: string) {
    fireEvent.change(screen.getByLabelText("Token id"), {target: {value: tokenId}});
    fireEvent.click(screen.getByRole("button", {name: "Check ownership"}));
    await screen.findByRole("button", {name: "Price the public record"});
}

describe("AgentImport after checking a second token", () => {
    it("drops the first token's priced record and writes the second one's", async () => {
        render(<AgentImport />, {wrapper: Provider});

        await checkToken("1");
        fireEvent.click(screen.getByRole("button", {name: "Price the public record"}));
        await screen.findByRole("button", {name: /Write the public record/});

        await checkToken("2");
        expect(screen.queryByRole("button", {name: /Write the public record/})).toBeNull();

        fireEvent.click(screen.getByRole("button", {name: "Price the public record"}));
        fireEvent.click(await screen.findByRole("button", {name: /Write the public record/}));

        expect(publishIdentity).toHaveBeenCalledTimes(1);
        expect(publishIdentity.mock.calls[0]?.[0]).toMatchObject({tripleId: "0x2"});
    });

    it("drops a pricing reply that lands after another token was checked", async () => {
        render(<AgentImport />, {wrapper: Provider});

        await checkToken("1");
        held = hold();
        fireEvent.click(screen.getByRole("button", {name: "Price the public record"}));
        await screen.findByRole("button", {name: "Pricing…"});

        const late = held;
        held = null;
        await checkToken("2");
        await act(async () => late.resolve(planFor("1")));

        expect(screen.queryByRole("button", {name: /Write the public record/})).toBeNull();
        expect(screen.getByRole("button", {name: "Price the public record"})).toBeEnabled();
    });
});
