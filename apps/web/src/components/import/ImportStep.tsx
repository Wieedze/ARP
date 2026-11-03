import type {ReactNode} from "react";

import {linkClass} from "../../lib/control-class";
import type {StepStatus} from "./import-phase";

export const labelClass =
    "block font-mono uppercase tracking-wider text-[length:var(--text-label)] text-[color:var(--color-steel)]";

/**
 * One step, with its result in a live region mounted from the first render and
 * refilled in place.
 *
 * An inactive step dims its rule and its ordinal and nothing else. The prose
 * inside says what the step is about to do — what will be signed, what the
 * write costs — and is written to be read *before* the step unlocks, so fading
 * it below AA would hide it exactly when it is wanted. The disabled buttons
 * carry the state for assistive tech; the wrapper does not pretend to.
 */
export function Step({
    index,
    title,
    status,
    disabled = false,
    children,
    result,
}: {
    index: number;
    title: string;
    status: StepStatus;
    disabled?: boolean;
    children: ReactNode;
    result?: ReactNode;
}) {
    return (
        <section
            aria-labelledby={`import-step-${index}`}
            className={`mb-14 pl-5 border-l ${
                disabled
                    ? "border-l-[color:var(--color-rule)]"
                    : "border-l-[color:var(--color-rule-strong)]"
            }`}
        >
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <span
                    className={`font-mono uppercase tracking-wider text-[length:var(--text-label)] ${
                        disabled
                            ? "text-[color:var(--color-steel)]"
                            : "text-[color:var(--color-steel)]"
                    }`}
                >
                    Step {index}
                </span>
                <h2 id={`import-step-${index}`} className="font-medium">
                    {title}
                </h2>
                {status === "done" ? (
                    <span className="font-mono text-[length:var(--text-label)] text-[color:var(--color-steel)]">
                        done
                    </span>
                ) : null}
            </div>
            <div className="mt-5">{children}</div>
            <div aria-live="polite">{result}</div>
        </section>
    );
}

export function Field({label, value, href}: {label: string; value: string; href?: string}) {
    return (
        <div className="mt-4">
            <span className={labelClass}>{label}</span>
            {href === undefined ? (
                <p className="mt-1 font-mono text-[length:var(--text-body-sm)] break-all">
                    {value}
                </p>
            ) : (
                <a
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className={`mt-1 block font-mono text-[length:var(--text-body-sm)] break-all ${linkClass}`}
                >
                    {value}
                </a>
            )}
        </div>
    );
}

/**
 * A caught error, set apart by a rule rather than by a colour.
 *
 * Not `--color-alarm`: ADR 0018 scopes that hue to a signature `mismatch` and
 * its row, and nothing else. A rejected wallet prompt or a slow RPC is a
 * recoverable operation failing, not a provider caught misrepresenting a
 * signature, and painting both the same colour is what makes the rare one stop
 * meaning anything.
 */
export function Failure({message}: {message: string}) {
    return (
        <p className="mt-5 max-w-[64ch] text-[length:var(--text-body-sm)] border-l border-l-[color:var(--color-rule-strong)] pl-4">
            {message}
        </p>
    );
}
