import type {EvidenceWeight, ReviewerBasis} from "../../services/agent-trust";

import {WEIGHT_CAPTION} from "./evidence-scale";

/**
 * One tick per reviewer, up to a saturation point.
 *
 * Two reviewers is two hairlines against a lot of empty space; 1,445 is a solid
 * rail. The exact number is always in the caption underneath — the rail is the
 * thing you read before you read anything, and the number is the thing you
 * check afterwards.
 */
const MAX_TICKS = 48;

function formatCount(value: number): string {
    return value.toLocaleString("en-US");
}

export function EvidenceRail({basis, weight}: {basis: ReviewerBasis; weight: EvidenceWeight}) {
    if (basis.kind === "not-published") {
        return (
            <p className="mt-3 text-[length:var(--text-body-sm)] text-[color:var(--color-fg-60)] max-w-[46ch]">
                {WEIGHT_CAPTION.unknown}
            </p>
        );
    }

    const ticks = Math.min(basis.total, MAX_TICKS);
    const parts = [`${formatCount(basis.total)} reviewer${basis.total === 1 ? "" : "s"}`];
    if (basis.comparative !== null) parts.push(`${formatCount(basis.comparative)} comparative`);
    if (basis.nonComparative !== null) {
        parts.push(`${formatCount(basis.nonComparative)} non-comparative`);
    }

    return (
        <div className="mt-3">
            <div className="flex items-end gap-[2px] h-3" aria-hidden="true">
                {Array.from({length: ticks}, (_, index) => (
                    <span key={index} className="w-px h-full bg-[color:var(--color-fg-60)]" />
                ))}
                {ticks === 0 ? (
                    <span className="w-6 h-px bg-[color:var(--color-border-strong)]" />
                ) : null}
            </div>
            <p className="mt-2 font-mono text-[length:var(--text-body-sm)]">{parts.join(" · ")}</p>
            <p className="mt-1 text-[length:var(--text-body-sm)] text-[color:var(--color-fg-60)] max-w-[46ch]">
                {WEIGHT_CAPTION[weight]}
            </p>
        </div>
    );
}
