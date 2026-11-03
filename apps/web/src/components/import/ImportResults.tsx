import {
    ARP_IMPORT_CONTEXT,
    type ImportConsent,
    type ImportLinkPlan,
    type OwnershipVerdict,
} from "../../services/agent-import";
import {formatTrust, truncateMiddle} from "../../services/trust-format";
import type {LinkTxs, ProvenAgent} from "./import-phase";
import {Field} from "./ImportStep";

/** The registry's answer when it is not yours, or not there. Named, not softened. */
export function Refusal({verdict}: {verdict: OwnershipVerdict}) {
    if (verdict.status === "not-found") {
        return (
            <div className="mt-6 max-w-[64ch]">
                <p className="font-medium">No such agent in that registry.</p>
                <p className="mt-2 text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]">
                    Token {verdict.ref.tokenId} on chain {verdict.ref.chainId} has never been
                    minted. Check the chain as well as the id — the same number is a different agent
                    on each one.
                </p>
            </div>
        );
    }
    if (verdict.status === "owner-mismatch") {
        return (
            <div className="mt-6 max-w-[64ch]">
                <p className="font-medium">That agent belongs to another address.</p>
                <p className="mt-2 text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]">
                    The registry names the owner below. Connect that wallet to import it.
                </p>
                <Field label="Owner" value={verdict.owner} />
                <Field label="Connected" value={verdict.connected} />
            </div>
        );
    }
    return null;
}

export function Proof({proven}: {proven: ProvenAgent}) {
    return (
        <div className="mt-8 max-w-[64ch]">
            <p className="font-medium">
                {proven.atom?.label ?? `Agent ${proven.chainId}:${proven.tokenId}`} is yours.
            </p>
            <Field label="Identity" value={proven.caip19} />
            <Field label="Owner, per the registry" value={proven.owner} />
            <Field
                label="Your agent wallet, which will give support"
                value={proven.operatingAccount}
            />
            {/* ADR `0103`: the atom id stays checkable, collapsed. */}
            <details className="mt-4">
                <summary className="cursor-pointer text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]">
                    Verify
                </summary>
                {proven.atom === null ? (
                    <Field label="Canonical Intuition atom" value="not mirrored — see step 3" />
                ) : (
                    // A term id is not an address, and nothing in the explorer resolves one.
                    <Field label="Canonical Intuition atom" value={proven.atom.atomId} />
                )}
            </details>
        </div>
    );
}

export function ConsentPreview({consent}: {consent: ImportConsent}) {
    return (
        <dl className="max-w-[64ch] border-t border-[color:var(--color-rule)] pt-4">
            {[
                ["agent", consent.agent],
                ["operator", consent.operator],
                ["operatingAccount", consent.operatingAccount],
                ["context", ARP_IMPORT_CONTEXT],
            ].map(([term, value]) => (
                <div key={term} className="flex flex-wrap gap-x-4 py-1">
                    <dt className="w-40 shrink-0 font-mono text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]">
                        {term}
                    </dt>
                    <dd className="font-mono text-[length:var(--text-body-sm)] break-all">
                        {value}
                    </dd>
                </div>
            ))}
            <div className="flex flex-wrap gap-x-4 py-1">
                <dt className="w-40 shrink-0 font-mono text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]">
                    nonce
                </dt>
                <dd className="font-mono text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]">
                    drawn when you sign
                </dd>
            </div>
        </dl>
    );
}

export function LinkPlan({plan}: {plan: ImportLinkPlan}) {
    return (
        <div className="max-w-[64ch]">
            <p className="font-mono text-[length:var(--text-body-sm)] tabular-nums">
                total — {formatTrust(plan.totalCost)} {plan.chain.symbol}
            </p>
            {/* ADR `0103`: the atoms, the edge and their costs stay checkable, collapsed. */}
            <details className="mt-4">
                <summary className="cursor-pointer text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]">
                    Verify
                </summary>
                <Field label="Subject — the agent's canonical atom" value={plan.agentAtomId} />
                <Field label="Predicate — Intuition's same as" value={plan.predicateId} />
                <Field
                    label={`Object — your account${plan.accountAtomExists ? ", already on the graph" : ", to be created"}`}
                    value={plan.accountAtomUri}
                />
                <div className="mt-6 border-t border-[color:var(--color-rule)] pt-4">
                    <p className="font-mono text-[length:var(--text-body-sm)] tabular-nums">
                        {plan.accountAtomExists
                            ? `account atom — already published, 0 ${plan.chain.symbol}`
                            : `account atom — ${formatTrust(plan.atomAssets)} ${plan.chain.symbol}`}
                    </p>
                    <p className="mt-1 font-mono text-[length:var(--text-body-sm)] tabular-nums">
                        {plan.tripleExists
                            ? `same-as edge — already published, 0 ${plan.chain.symbol}`
                            : `same-as edge — ${formatTrust(plan.tripleAssets)} ${plan.chain.symbol}`}
                    </p>
                </div>
            </details>
        </div>
    );
}

export function Published({txs, explorerUrl}: {txs: LinkTxs; explorerUrl: string}) {
    return (
        <div className="mt-6 max-w-[64ch]">
            <p className="font-medium">The link is public.</p>
            <p className="mt-2 text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]">
                Support sent from that wallet now counts for this agent, which is what agent
                reputation is read from.
            </p>
            {txs.atomTx !== undefined ? (
                <Field
                    label="Wallet record"
                    value={truncateMiddle(txs.atomTx, 14, 10)}
                    href={`${explorerUrl}/tx/${txs.atomTx}`}
                />
            ) : null}
            {txs.tripleTx !== undefined ? (
                <Field
                    label="Link"
                    value={truncateMiddle(txs.tripleTx, 14, 10)}
                    href={`${explorerUrl}/tx/${txs.tripleTx}`}
                />
            ) : null}
        </div>
    );
}
