import {renderHook} from "@testing-library/react";
import type {IdentityAtomPlan} from "@arp-protocol/core";
import type {ReactNode} from "react";
import type {Hex} from "viem";
import {beforeEach, describe, expect, it, vi} from "vitest";

import {ChainChoiceContext, choiceFor, type ChainChoice} from "../../lib/chain-choice";
import type {ImportedAgent, ImportLinkPlan} from "../../services/agent-import";
import type {DeclaredUse} from "../../services/declare-use";
import type {ToolRegistration} from "../../services/tool-register";
import type {RedeemQuote, StakeQuote} from "../../services/trust-stake";

/**
 * Every write is signed against the chain its quote or plan was priced on. The toggle is flipped
 * between pricing and submitting, and each submit must still be handed the priced chain's client.
 */
const HASH: Hex = `0x${"ab".repeat(32)}`;
const walletClient = {account: {address: "0x000000000000000000000000000000000000c0DE"}};

type Submitted = {publicClient: unknown; chain?: unknown};
// The stake submits take no client; they read the one on `quote.chain`.
type SubmittedQuote = {quote: {chain: {client: unknown}}};
const submitStake = vi.fn<(params: SubmittedQuote) => Promise<Hex>>(async () => HASH);
const submitRedeem = vi.fn<(params: SubmittedQuote) => Promise<Hex>>(async () => HASH);
const submitUseDeclaration = vi.fn<(params: Submitted) => Promise<Hex>>(async () => HASH);
const submitToolRegistration = vi.fn<(params: Submitted) => Promise<Hex>>(async () => HASH);
const submitOperatorLink = vi.fn<(params: Submitted) => Promise<object>>(async () => ({}));
const submitIdentityAtom = vi.fn<(params: Submitted) => Promise<{txs: Hex[]}>>(async () => ({
    txs: [],
}));

vi.mock("@wagmi/core", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@wagmi/core")>()),
    getWalletClient: async () => walletClient,
}));
vi.mock("../wallet-client", () => ({connectedWalletClient: async () => walletClient}));
vi.mock("../../services/tx-record", () => ({
    recordSent: vi.fn(),
    recordSettled: vi.fn(),
    recordUnsettled: vi.fn(),
}));
vi.mock("../../services/trust-stake", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../../services/trust-stake")>()),
    submitStake: (params: SubmittedQuote) => submitStake(params),
    submitRedeem: (params: SubmittedQuote) => submitRedeem(params),
}));
vi.mock("../../services/declare-use", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../../services/declare-use")>()),
    submitUseDeclaration: (params: {publicClient: unknown}) => submitUseDeclaration(params),
}));
vi.mock("../../services/tool-register", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../../services/tool-register")>()),
    submitToolRegistration: (params: {publicClient: unknown}) => submitToolRegistration(params),
}));
vi.mock("../../services/agent-import", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../../services/agent-import")>()),
    submitOperatorLink: (params: {publicClient: unknown}) => submitOperatorLink(params),
}));
vi.mock("../../services/agent-identity-atom", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../../services/agent-identity-atom")>()),
    submitIdentityAtom: (params: {publicClient: unknown; chain: unknown}) =>
        submitIdentityAtom(params),
}));

import {useAgentImport} from "../use-agent-import";
import {useDeclareUse} from "../use-declare-use";
import {useStakeActions} from "../use-stake-actions";
import {useToolRegister} from "../use-tool-register";

const TESTNET = choiceFor(false);
const MAINNET = choiceFor(true);
let toggle: ChainChoice = TESTNET;

function Toggle({children}: {children: ReactNode}) {
    return (
        <ChainChoiceContext.Provider value={{choice: toggle, setMainnet: () => {}}}>
            {children}
        </ChainChoiceContext.Provider>
    );
}

/** Mounts `hook` on testnet, then flips the toggle to mainnet before the caller submits. */
function mountThenFlip<T>(hook: () => T): T {
    toggle = TESTNET;
    const view = renderHook(hook, {wrapper: Toggle});
    toggle = MAINNET;
    view.rerender();
    return view.result.current;
}

// Each priced object is built on testnet; the submit path reads only its `chain` field.
const stakeQuote = {chain: TESTNET} as unknown as StakeQuote;
const redeemQuote = {chain: TESTNET} as unknown as RedeemQuote;

beforeEach(() => {
    vi.clearAllMocks();
});

describe("a submit after the toggle moved", () => {
    it("deposits and withdraws with the quote's client", async () => {
        const actions = mountThenFlip(useStakeActions);
        await actions.submit(stakeQuote);
        await actions.submitExit(redeemQuote);
        expect(submitStake.mock.calls[0]?.[0].quote.chain.client).toBe(TESTNET.client);
        expect(submitRedeem.mock.calls[0]?.[0].quote.chain.client).toBe(TESTNET.client);
    });

    it("waits for the receipt on the quote's chain", async () => {
        const wait = vi.spyOn(TESTNET.client, "waitForTransactionReceipt");
        const other = vi.spyOn(MAINNET.client, "waitForTransactionReceipt");
        wait.mockResolvedValueOnce({} as Awaited<ReturnType<typeof wait>>); // Only awaited, never read.
        const actions = mountThenFlip(useStakeActions);
        await actions.awaitReceipt(HASH, stakeQuote.chain);
        expect(wait).toHaveBeenCalledWith({hash: HASH});
        expect(other).not.toHaveBeenCalled();
    });

    it("declares with the declaration's client", async () => {
        const actions = mountThenFlip(useDeclareUse);
        // The hook reads only `chain` off the declaration; the service that reads the rest is mocked.
        await actions.submit({chain: TESTNET} as unknown as DeclaredUse);
        expect(submitUseDeclaration.mock.calls[0]?.[0].publicClient).toBe(TESTNET.client);
    });

    it("lists a tool with the registration's client", async () => {
        const actions = mountThenFlip(useToolRegister);
        // The hook reads only `chain` off the registration; the service that reads the rest is mocked.
        await actions.submit({chain: TESTNET} as unknown as ToolRegistration);
        expect(submitToolRegistration.mock.calls[0]?.[0].publicClient).toBe(TESTNET.client);
    });

    it("publishes an import link and an identity record on the plan's chain", async () => {
        const actions = mountThenFlip(useAgentImport);
        await actions.publishLink({
            // Passed through untouched to the mocked service, so no field of it is read.
            imported: {} as ImportedAgent,
            // The hook reads only `chain` off the plan; the service that reads the rest is mocked.
            plan: {chain: TESTNET} as unknown as ImportLinkPlan,
        });
        // The hook reads only `chainId` off the plan; the service that reads the rest is mocked.
        await actions.publishIdentity({chainId: TESTNET.chainId} as IdentityAtomPlan);
        expect(submitOperatorLink.mock.calls[0]?.[0].publicClient).toBe(TESTNET.client);
        expect(submitIdentityAtom.mock.calls[0]?.[0].publicClient).toBe(TESTNET.client);
        expect(submitIdentityAtom.mock.calls[0]?.[0].chain).toMatchObject({chainId: 13579});
    });

    it("publishes a mainnet-priced identity record on mainnet after a flip to testnet", async () => {
        toggle = MAINNET;
        const view = renderHook(useAgentImport, {wrapper: Toggle});
        toggle = TESTNET;
        view.rerender();
        // The hook reads only `chainId` off the plan; the service that reads the rest is mocked.
        await view.result.current.publishIdentity({chainId: MAINNET.chainId} as IdentityAtomPlan);
        expect(submitIdentityAtom.mock.calls[0]?.[0].publicClient).toBe(MAINNET.client);
        expect(submitIdentityAtom.mock.calls[0]?.[0].chain).toMatchObject({chainId: 1155});
    });

    it("refuses an identity record priced on a chain ARP does not write to", async () => {
        const actions = mountThenFlip(useAgentImport);
        // Only `chainId` is read before the refusal, so nothing else of the plan is needed.
        const plan = {chainId: 8453} as IdentityAtomPlan;
        await expect(actions.publishIdentity(plan)).rejects.toThrow("chain 8453");
        expect(submitIdentityAtom).not.toHaveBeenCalled();
    });
});
