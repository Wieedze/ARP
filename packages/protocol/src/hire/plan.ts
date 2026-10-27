import {toFunctionSelector, type Address, type Hex} from "viem";

import {HIRE_SELECTORS, type HireBound} from "./caveats.js";

/**
 * The buyer's half of a hire: a bounded sub-delegation, prepared and **not signed**.
 *
 * ADR `0038` is the constraint most likely to erode here, and `tasks/25` says so in as many words —
 * "a hire is a multi-step handshake and a signer parameter would make it one call". There is no
 * signer parameter. This returns the delegation to sign and the bounds to show; the buyer's wallet
 * signs it and nothing in this package holds a key.
 *
 * **The seller signs nothing**, which is the property `tasks/25` exists to protect: the delegation
 * bounds the *buyer's* spend, so a buyer can hire an agent that has never heard of ARP.
 */

/** Everything the framework needs, resolved for one chain. */
export type HireEnvironment = {
    delegationManager: Address;
    caveatEnforcers: {
        NativeTokenTransferAmountEnforcer?: Address;
        AllowedTargetsEnforcer?: Address;
        AllowedMethodsEnforcer?: Address;
        TimestampEnforcer?: Address;
    };
};

export class DelegationFrameworkMissingError extends Error {
    constructor(chainId: number, cause?: unknown) {
        super(
            `no MetaMask Delegation Framework deployment for chain ${chainId}` +
                (cause === undefined ? "" : `: ${String(cause).slice(0, 200)}`),
        );
        this.name = "DelegationFrameworkMissingError";
    }
}

export class HireBoundMissingError extends Error {
    constructor(name: string, chainId: number) {
        super(`${name} is not deployed on chain ${chainId}, so a hire cannot be bounded there`);
        this.name = "HireBoundMissingError";
    }
}

/**
 * An unsigned delegation, in the framework's own field order.
 *
 * `signature` is absent rather than empty: a struct carrying `"0x"` is one cast away from being
 * passed to a redeemer as if it were signed, and the difference between "not signed yet" and
 * "signed with nothing" is the whole of ADR `0038` on this surface.
 */
export type UnsignedDelegation = {
    delegate: Address;
    delegator: Address;
    authority: Hex;
    caveats: {enforcer: Address; terms: Hex; args: Hex}[];
    salt: bigint;
};

export type HirePlan = {
    chainId: number;
    delegation: UnsignedDelegation;
    /** The same caveats, each with the sentence to show before the buyer signs. */
    bounds: HireBound[];
    delegationManager: Address;
    /** The budget, restated so a caller does not have to decode `terms` to show it. */
    budget: bigint;
    /** Unix seconds after which the authority is dead, or `null` when open-ended. */
    expiresAt: number | null;
};

/** `authority` for a delegation that descends from nothing — the framework's own sentinel. */
export const ROOT_AUTHORITY: Hex = `0x${"00".repeat(32)}`;

async function resolveEnvironment(chainId: number): Promise<HireEnvironment> {
    let kit: typeof import("@metamask/smart-accounts-kit");
    try {
        kit = await import("@metamask/smart-accounts-kit");
    } catch (cause) {
        throw new DelegationFrameworkMissingError(chainId, cause);
    }
    try {
        // Typed loosely on purpose: the kit's environment carries far more than this needs, and
        // narrowing to the four enforcers keeps a kit upgrade from breaking a type here.
        return kit.getSmartAccountsEnvironment(chainId) as unknown as HireEnvironment;
    } catch (cause) {
        throw new DelegationFrameworkMissingError(chainId, cause);
    }
}

/**
 * A salt the caller did not have to think about.
 *
 * Two delegations with the same delegate, delegator and caveats hash identically, so the second
 * would be indistinguishable from a replay of the first. `rules/metamask-delegation.md` requires a
 * salt or nonce for that reason. Taken from `crypto.getRandomValues`, which exists in every runtime
 * this package targets.
 */
function randomSalt(): bigint {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    let salt = 0n;
    for (const byte of bytes) salt = (salt << 8n) | BigInt(byte);
    return salt;
}

/**
 * Prepare the sub-delegation a buyer signs to hire a seller.
 *
 * @param params.buyer       The buyer's smart account. The **delegator**: the budget is spent from
 *                           its balance, not the seller's.
 * @param params.seller      The hired agent's runtime address. The **delegate**.
 * @param params.budget      Total TRUST the seller may move, in wei. Bounds the whole authority,
 *                           not one call: ten deposits of a tenth each exhaust it exactly as one.
 * @param params.multiVault  The only contract the seller may call.
 * @param params.chainId     Resolves the framework's deployment. Never defaulted — a hire prepared
 *                           for the wrong chain is a signature over caveats that do not exist there
 *                           (`rules/portability.md` point 1).
 * @param params.expiresAt   Unix seconds. Omitted leaves the authority open until revoked, which is
 *                           a choice a caller should make deliberately rather than inherit.
 * @param params.authority   A parent delegation's hash, for a hire chained off an existing
 *                           authority. Defaults to root.
 */
export async function prepareHire(params: {
    buyer: Address;
    seller: Address;
    budget: bigint;
    multiVault: Address;
    chainId: number;
    expiresAt?: number;
    authority?: Hex;
    salt?: bigint;
    environment?: HireEnvironment;
}): Promise<HirePlan> {
    if (params.budget <= 0n) {
        throw new Error("prepareHire: budget must be greater than zero");
    }
    if (params.expiresAt !== undefined && !Number.isSafeInteger(params.expiresAt)) {
        throw new Error("prepareHire: expiresAt must be unix seconds");
    }

    const env = params.environment ?? (await resolveEnvironment(params.chainId));
    const core = await import("@metamask/delegation-core");

    const need = (name: keyof HireEnvironment["caveatEnforcers"]): Address => {
        const address = env.caveatEnforcers[name];
        if (address === undefined) throw new HireBoundMissingError(name, params.chainId);
        return address;
    };

    const bounds: HireBound[] = [
        {
            enforcer: need("NativeTokenTransferAmountEnforcer"),
            terms: core.createNativeTokenTransferAmountTerms({maxAmount: params.budget}) as Hex,
            args: "0x",
            name: "NativeTokenTransferAmountEnforcer",
            describes: "the total TRUST this agent may spend",
        },
        {
            enforcer: need("AllowedTargetsEnforcer"),
            terms: core.createAllowedTargetsTerms({targets: [params.multiVault]}) as Hex,
            args: "0x",
            name: "AllowedTargetsEnforcer",
            describes: "the only contract it may call",
        },
        {
            enforcer: need("AllowedMethodsEnforcer"),
            terms: core.createAllowedMethodsTerms({
                selectors: HIRE_SELECTORS.map((signature) => toFunctionSelector(signature)),
            }) as Hex,
            args: "0x",
            name: "AllowedMethodsEnforcer",
            describes: "deposit and term creation only — never redeem",
        },
    ];

    if (params.expiresAt !== undefined) {
        bounds.push({
            enforcer: need("TimestampEnforcer"),
            // `afterThreshold: 0` is "valid from now". Both bounds are required by the encoder,
            // and a hire has no reason to start in the future.
            terms: core.createTimestampTerms({
                afterThreshold: 0,
                beforeThreshold: params.expiresAt,
            }) as Hex,
            args: "0x",
            name: "TimestampEnforcer",
            describes: "when this authority dies",
        });
    }

    return {
        chainId: params.chainId,
        delegation: {
            delegate: params.seller,
            delegator: params.buyer,
            authority: params.authority ?? ROOT_AUTHORITY,
            caveats: bounds.map(({enforcer, terms, args}) => ({enforcer, terms, args})),
            salt: params.salt ?? randomSalt(),
        },
        bounds,
        delegationManager: env.delegationManager,
        budget: params.budget,
        expiresAt: params.expiresAt ?? null,
    };
}
