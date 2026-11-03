import {fireEvent, render, screen} from "@testing-library/react";
import type {ReactNode} from "react";
import {MemoryRouter} from "react-router-dom";
import type {Hex} from "viem";
import {beforeEach, describe, expect, it, vi} from "vitest";

import {ChainChoiceContext, choiceFor} from "../lib/chain-choice";
import type {ImportLinkPlan, OwnershipVerdict} from "../services/agent-import";

/**
 * Steps 1 and 2 against an agent the graph mirrors, so step 3 can price and publish the link.
 * `AgentImport.test.tsx` covers the unmirrored agent, whose step 3 writes the identity record.
 */
const OWNER = "0x000000000000000000000000000000000000c0DE";
const ACCOUNT = "0x000000000000000000000000000000000000BEEF";
const ATOM: Hex = `0x${"11".repeat(32)}`;
const SIGNATURE: Hex = `0x${"22".repeat(65)}`;
const TESTNET = choiceFor(false);

vi.mock("wagmi", async (importOriginal) => ({
    ...(await importOriginal<typeof import("wagmi")>()),
    useAccount: () => ({address: OWNER, isConnected: true, chainId: 13579}),
    useSwitchChain: () => ({switchChainAsync: vi.fn(), isPending: false}),
}));

function owned(params: {chainId: number; tokenId: string}): OwnershipVerdict {
    // The page reads only `status`, `caip19` and `owner` off a verdict.
    return {
        status: "owned",
        ref: {chainId: params.chainId, tokenId: params.tokenId},
        caip19: `eip155:${params.chainId}/erc721:0x/${params.tokenId}`,
        owner: OWNER,
    } as unknown as OwnershipVerdict;
}

// The page and `LinkPlan` read only these fields; the rest is the service's concern.
const PLAN = {
    agentAtomId: ATOM,
    operatingAccount: ACCOUNT,
    accountAtomUri: `caip10:eip155:13579:${ACCOUNT}`,
    accountAtomExists: false,
    predicateId: ATOM,
    tripleExists: false,
    atomAssets: 1n,
    tripleAssets: 1n,
    totalCost: 2n,
    chain: TESTNET,
} as unknown as ImportLinkPlan;

const verifyOwnership = vi.fn(async (params: {chainId: number; tokenId: string}) => owned(params));
const signConsent = vi.fn(async () => ({signature: SIGNATURE, chainId: 13579}));
const publishLink = vi.fn(async () => ({tripleTx: SIGNATURE}));

vi.mock("../hooks/use-agent-import", () => ({
    useAgentImport: () => ({
        verifyOwnership,
        resolveAtom: async () => ({atomId: ATOM, label: null, caip19: "eip155:8453/erc721:0x/1"}),
        deriveOperatingAccount: async () => ACCOUNT,
        signConsent,
        planLink: async () => PLAN,
        publishLink,
        planIdentity: vi.fn(),
        publishIdentity: vi.fn(),
    }),
}));

import {AgentImport} from "./AgentImport";

function Provider({children}: {children: ReactNode}) {
    return (
        <MemoryRouter>
            <ChainChoiceContext.Provider value={{choice: TESTNET, setMainnet: () => {}}}>
                {children}
            </ChainChoiceContext.Provider>
        </MemoryRouter>
    );
}

beforeEach(() => {
    vi.clearAllMocks();
});

async function proveToken(tokenId: string) {
    fireEvent.change(screen.getByLabelText("Token id"), {target: {value: tokenId}});
    fireEvent.click(screen.getByRole("button", {name: "Check ownership"}));
    await screen.findByText(`Agent 8453:${tokenId} is yours.`);
}

describe("AgentImport after a rejected re-sign", () => {
    it("keeps the earlier signature, so the priced link still publishes", async () => {
        render(<AgentImport />, {wrapper: Provider});
        await proveToken("1");

        fireEvent.click(screen.getByRole("button", {name: "Sign the statement"}));
        fireEvent.click(await screen.findByRole("button", {name: "Price the link"}));
        await screen.findByRole("button", {name: /Publish the link/});

        signConsent.mockRejectedValueOnce(new Error("User rejected the request."));
        fireEvent.click(screen.getByRole("button", {name: "Sign the statement"}));
        await screen.findByText("User rejected the request.");

        const publish = screen.getByRole("button", {name: /Publish the link/});
        expect(publish).toBeEnabled();
        fireEvent.click(publish);

        expect(publishLink).toHaveBeenCalledTimes(1);
        expect(publishLink.mock.calls[0]).toMatchObject([
            {imported: {signature: SIGNATURE, agentAtomId: ATOM}, plan: PLAN},
        ]);
    });
});
