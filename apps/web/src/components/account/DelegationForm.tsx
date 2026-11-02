import {useId, useState} from "react";
import {getAddress, isAddress, type Hex} from "viem";

import {controlClass, primaryControlClass} from "../../lib/control-class";
import {parseCapInput} from "../../services/delegation";

/**
 * The caveat form: who may act, how much it may spend, over what window. It was `/rig` step 4 and
 * is the only form in the app that builds a delegation, so it is a component of its own rather than
 * a block inside a page.
 *
 * Two steps. The first chooses; the second names the chain the signature is for and asks again, so
 * nothing is signed by the click that filled the form (`rules/portability.md`: the chain rides on
 * the thing being signed).
 */
const PERIODS: readonly {label: string; seconds: bigint}[] = [
    {label: "1h", seconds: 3_600n},
    {label: "1d", seconds: 86_400n},
    {label: "7d", seconds: 604_800n},
];

export type DelegationRequest = {delegate: Hex; cap: bigint; periodSeconds: bigint};

const FIELD =
    "block w-full max-w-[34rem] rounded-[var(--radius-control)] border border-[color:var(--color-rule-strong)] bg-transparent px-3 py-1.5 font-mono text-[length:var(--text-body-sm)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[color:var(--color-accent)]";
const LABEL =
    "mb-1 block font-mono text-[10px] uppercase tracking-[0.08em] text-[color:var(--color-steel)]";

export function DelegationForm({
    suggestedDelegate,
    chainName,
    chainId,
    symbol,
    pending,
    onSign,
}: {
    suggestedDelegate: string | null;
    chainName: string;
    chainId: number;
    symbol: string;
    pending: boolean;
    onSign: (request: DelegationRequest) => void;
}) {
    const ids = {delegate: useId(), cap: useId()};
    const [delegate, setDelegate] = useState(suggestedDelegate ?? "");
    const [capInput, setCapInput] = useState("1");
    const [periodSeconds, setPeriodSeconds] = useState<bigint>(86_400n);
    const [request, setRequest] = useState<DelegationRequest | null>(null);
    const [error, setError] = useState<string | null>(null);

    function review() {
        const trimmed = delegate.trim();
        if (!isAddress(trimmed, {strict: false})) {
            setError("Delegate must be an address");
            return;
        }
        const cap = parseCapInput(capInput);
        if ("error" in cap) {
            setError(cap.error);
            return;
        }
        setError(null);
        // Checksummed, so the signed struct carries one spelling whatever case was typed.
        setRequest({delegate: getAddress(trimmed), cap: cap.cap, periodSeconds});
    }

    if (request !== null) {
        return (
            <div className="max-w-[40rem] space-y-3" aria-live="polite">
                <p className="text-[length:var(--text-body-sm)]">
                    Sign on {chainName} ({chainId}):{" "}
                    <span className="font-mono">{capInput.trim()}</span> {symbol} per{" "}
                    {PERIODS.find((p) => p.seconds === request.periodSeconds)?.label ?? "period"} to{" "}
                    <span className="font-mono break-all">{request.delegate}</span>.
                </p>
                <div className="flex gap-3">
                    <button
                        type="button"
                        className={primaryControlClass}
                        disabled={pending}
                        onClick={() => onSign(request)}
                    >
                        {pending ? "Signing…" : "Sign in wallet"}
                    </button>
                    <button
                        type="button"
                        className={controlClass}
                        disabled={pending}
                        onClick={() => setRequest(null)}
                    >
                        Back
                    </button>
                </div>
            </div>
        );
    }

    return (
        <form
            className="space-y-5"
            onSubmit={(event) => {
                event.preventDefault();
                review();
            }}
        >
            <div>
                <label htmlFor={ids.delegate} className={LABEL}>
                    Delegate
                </label>
                <input
                    id={ids.delegate}
                    className={FIELD}
                    value={delegate}
                    onChange={(event) => setDelegate(event.target.value)}
                    placeholder="0x…"
                    spellCheck={false}
                    autoComplete="off"
                />
            </div>
            <div>
                <label htmlFor={ids.cap} className={LABEL}>
                    Cap per period ({symbol})
                </label>
                <input
                    id={ids.cap}
                    className={`${FIELD} max-w-[10rem]`}
                    value={capInput}
                    inputMode="decimal"
                    onChange={(event) => setCapInput(event.target.value)}
                />
            </div>
            <fieldset>
                <legend className={LABEL}>Window</legend>
                <div className="flex gap-2">
                    {PERIODS.map(({label, seconds}) => {
                        const active = periodSeconds === seconds;
                        return (
                            <label
                                key={label}
                                className={`cursor-pointer rounded-[var(--radius-control)] border px-3 py-1 font-mono text-[length:var(--text-body-sm)] has-[:focus-visible]:outline has-[:focus-visible]:outline-1 has-[:focus-visible]:outline-[color:var(--color-accent)] ${
                                    active
                                        ? "border-[color:var(--color-accent)] text-[color:var(--color-accent)]"
                                        : "border-[color:var(--color-rule-strong)] text-[color:var(--color-steel)]"
                                }`}
                            >
                                <input
                                    type="radio"
                                    name="delegation-period"
                                    className="sr-only"
                                    checked={active}
                                    onChange={() => setPeriodSeconds(seconds)}
                                />
                                {label}
                            </label>
                        );
                    })}
                </div>
            </fieldset>
            {error === null ? null : (
                <p role="alert" className="font-mono text-[length:var(--text-body-sm)]">
                    {error}
                </p>
            )}
            <button type="submit" className={controlClass}>
                Review
            </button>
        </form>
    );
}
