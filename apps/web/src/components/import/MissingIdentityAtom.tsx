import type {Hex} from "viem";

import type {IdentityAtomPlan} from "@arp-protocol/core";

import {controlClass} from "../../lib/control-class";
import type {ChainChoice} from "../../lib/chain-choice";
import {formatTrust, truncateMiddle} from "../../services/trust-format";
import {writeError, writePlan, writeResult, writeStatus, type WriteState} from "./import-phase";
import {Failure, Field} from "./ImportStep";

/**
 * The mirror has not written this agent's atom, so ARP writes it.
 *
 * Not a duplicate: the recipe in `@arp-protocol/core` reproduces the mirror's bytes exactly —
 * verified against agent 8453:6649, whose atom Intuition's own ingestion minted — so the derived
 * atom is the one the mirror would write (ADR `0047`).
 */
export function MissingIdentityAtom(props: {
    write: WriteState<IdentityAtomPlan, Hex[]>;
    onTargetChain: boolean;
    chain: ChainChoice;
    walletChainId: number | undefined;
    isSwitching: boolean;
    onSwitchChain: () => void;
    onPlan: () => void;
    onPublish: () => void;
}) {
    const plan = writePlan(props.write);
    const txs = writeResult(props.write);
    const status = writeStatus(props.write);
    const error = writeError(props.write);
    return (
        <div className="max-w-[64ch]">
            <p className="font-medium">
                The Intuition graph does not list this agent yet, so its public record has to be
                written.
            </p>
            <p className="mt-3 text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]">
                Not a duplicate — this is the same id the mirror would write, sooner.
            </p>

            {plan === null ? (
                <button
                    type="button"
                    onClick={props.onPlan}
                    disabled={status === "pending"}
                    className={`mt-6 ${controlClass}`}
                >
                    {status === "pending" ? "Pricing…" : "Price the public record"}
                </button>
            ) : (
                <>
                    <p className="mt-6 font-mono text-[length:var(--text-body-sm)] tabular-nums">
                        total — {formatTrust(plan.totalValue)} {props.chain.symbol}
                    </p>
                    {/* ADR `0103`: atoms, the edge and the shares stay checkable, collapsed. */}
                    <details className="mt-4">
                        <summary className="cursor-pointer text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]">
                            Verify
                        </summary>
                        <Field
                            label={`Identity atom${plan.existing.identityAtom ? ", already on the graph" : ", to be created"}`}
                            value={plan.uris.identity}
                        />
                        <Field
                            label={`CAIP-19 atom${plan.existing.caipAtom ? ", already on the graph" : ", to be created"}`}
                            value={plan.uris.caip}
                        />
                        <Field
                            label={`same as edge${plan.existing.triple ? ", already on the graph" : ", to be created"}`}
                            value={plan.tripleId}
                        />
                        <div className="mt-4 border-t border-[color:var(--color-rule)] pt-4">
                            {plan.calls.map((call) => (
                                <p
                                    key={call.data}
                                    className="font-mono text-[length:var(--text-body-sm)] tabular-nums"
                                >
                                    {call.kind} — {formatTrust(call.value)} {props.chain.symbol},{" "}
                                    {call.preview === undefined
                                        ? "no preview"
                                        : `${formatTrust(call.preview.shares)} shares`}
                                </p>
                            ))}
                        </div>
                    </details>
                    {/* Said because the atom works without it and a reader will wonder why the name
                        is a hash. Pinning the same bytes later yields the same id, so it is
                        retroactive rather than a missed window. */}
                    <p className="mt-4 text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]">
                        The record is created unpinned, so readers see its id rather than its name
                        until someone pins the document. Anyone can, at any time, and the id does
                        not change — the same bytes always hash to the same CID.
                    </p>
                </>
            )}

            {error !== null ? <Failure message={error} /> : null}

            {plan !== null && txs === null ? (
                !props.onTargetChain ? (
                    <div className="mt-6">
                        <p className="text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]">
                            Your wallet is on chain {props.walletChainId ?? "unknown"}. The write
                            lands on {props.chain.chain.name} ({props.chain.chainId}).
                        </p>
                        <button
                            type="button"
                            onClick={props.onSwitchChain}
                            disabled={props.isSwitching}
                            className={`mt-3 ${controlClass}`}
                        >
                            {props.isSwitching
                                ? "Switching…"
                                : `Switch to ${props.chain.chain.name}`}
                        </button>
                    </div>
                ) : plan.calls.length === 0 ? (
                    <p className="mt-6 text-[length:var(--text-body-sm)]">
                        The record and its link are already public. There is nothing to send.
                    </p>
                ) : (
                    <button
                        type="button"
                        onClick={props.onPublish}
                        disabled={status === "pending"}
                        className={`mt-6 ${controlClass}`}
                    >
                        {status === "pending"
                            ? "Waiting for your wallet…"
                            : `Write the public record — ${formatTrust(plan.totalValue)} ${props.chain.symbol}`}
                    </button>
                )
            ) : null}

            {txs !== null ? (
                <div className="mt-6">
                    <p className="font-medium">The agent has a public record.</p>
                    <p className="mt-2 text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]">
                        Price the link above to tie it to your agent wallet.
                    </p>
                    {txs.map((hash, index) => (
                        <Field
                            key={hash}
                            label={`Transaction ${index + 1}`}
                            value={truncateMiddle(hash, 14, 10)}
                            href={`${props.chain.explorerUrl}/tx/${hash}`}
                        />
                    ))}
                </div>
            ) : null}
        </div>
    );
}
