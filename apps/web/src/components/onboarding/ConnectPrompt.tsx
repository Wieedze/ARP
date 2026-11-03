import {ProviderNotFoundError, useConnect} from "wagmi";

import {controlClass} from "../../lib/control-class";

/**
 * Where an action needs a wallet and none is connected: the button that connects it. One
 * component, so every gate behaves the same.
 *
 * It connects the wallet directly. It opened the onboarding panel until task 62, whose last line
 * was the wallet; the user, 2026-11-03: _« tu laisses juste connect a wallet sur les actions qui
 * en nécessitent, sinon non »_. So a wallet is asked for only by an action that signs, and the
 * panel is about which path to take (ADR `0128`).
 *
 * **The failure is said under the button.** `lib/wagmi.ts` always configures `injected()`, so a
 * connector exists whether or not a wallet extension does, and only `connect` finds out. With the
 * nav's Connect gone this is the only door to a wallet, and a silent failure here is a dead button
 * on every action that signs (ui-reviewer, task 62).
 */
export function ConnectPrompt({label, className = ""}: {label: string; className?: string}) {
    const {connectors, connect, isPending, error} = useConnect();
    const wallet =
        connectors.find((c) => c.id === "metaMask" || c.id === "injected") ?? connectors[0];
    return (
        <div className={className}>
            <button
                type="button"
                disabled={isPending}
                onClick={() => {
                    if (wallet !== undefined) connect({connector: wallet});
                }}
                className={controlClass}
            >
                {isPending ? "Connecting…" : label}
            </button>
            {/* Rendered while empty, so the live region is in the accessibility tree before its
                text arrives; an empty `<p>` has no height. */}
            <p
                aria-live="polite"
                className="mt-2 text-[length:var(--text-body-sm)] text-[color:var(--color-steel)] empty:mt-0"
            >
                {wallet === undefined || error instanceof ProviderNotFoundError
                    ? "No wallet detected"
                    : error !== null
                      ? shortMessageOf(error)
                      : null}
            </p>
        </div>
    );
}

/** wagmi's own errors carry a one-line `shortMessage`; `message` adds the docs link and version. */
function shortMessageOf(error: Error): string {
    return "shortMessage" in error && typeof error.shortMessage === "string"
        ? error.shortMessage
        : error.message;
}
