import type {FreshnessVerdict, SignatureVerdict} from "@arp-protocol/erc8004";

import {describeFreshness, describeSignature} from "../../services/trust-format";

/**
 * The two verdicts the connector produced, rendered exactly as it produced
 * them. There is no branch anywhere below that promotes an `unverified` into
 * anything warmer, and `mismatch` is the only thing in the panel allowed to
 * use the alarm colour.
 */

const SIGNATURE_TONE: Record<string, string> = {
    verified: "text-[color:var(--color-accent)] border-[color:var(--color-accent)]",
    mismatch:
        "text-[color:var(--color-alarm)] border-[color:var(--color-alarm)] bg-[color:var(--color-alarm-dim)]",
    unverified: "text-[color:var(--color-fg-60)] border-[color:var(--color-border-strong)]",
};

export function SignatureLine({verdict}: {verdict: SignatureVerdict}) {
    const copy = describeSignature(verdict);
    return (
        <div>
            <span
                className={`inline-block px-2 py-0.5 border font-mono uppercase tracking-wider text-[length:var(--text-label)] ${SIGNATURE_TONE[copy.tone]}`}
            >
                {copy.label}
            </span>
            <p className="mt-2 text-[length:var(--text-body-sm)] text-[color:var(--color-fg-60)] max-w-[52ch]">
                {copy.detail}
            </p>
            {copy.tone === "unverified" ? (
                <p className="mt-1 text-[length:var(--text-body-sm)] text-[color:var(--color-fg-60)] max-w-[52ch]">
                    Unverified means the signature could not be checked — not that the provider did
                    anything wrong.
                </p>
            ) : null}
            {copy.tone === "mismatch" ? (
                <p className="mt-1 text-[length:var(--text-body-sm)] text-[color:var(--color-alarm)] max-w-[52ch]">
                    Treat this document as untrusted until the provider explains it.
                </p>
            ) : null}
        </div>
    );
}

export function FreshnessLine({verdict}: {verdict: FreshnessVerdict}) {
    const copy = describeFreshness(verdict);
    return (
        <div>
            <span className="font-mono uppercase tracking-wider text-[length:var(--text-label)] text-[color:var(--color-fg-60)]">
                {copy.label}
            </span>
            <p className="mt-1 text-[length:var(--text-body-sm)] text-[color:var(--color-fg-60)] max-w-[52ch]">
                {copy.detail}
            </p>
        </div>
    );
}
