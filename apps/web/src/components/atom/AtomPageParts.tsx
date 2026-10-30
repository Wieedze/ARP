import {useState} from "react";

import {LABEL} from "../../lib/atom-page";

/**
 * The parts the skill page and the repository page share: the install line, the two panels'
 * frame, the record's rows and the section heading. One system, so one copy
 * (`arp-pages/README.md`).
 */

/** An install command and a Copy button. It wraps rather than scrolls. */
export function Install({command}: {command: string}) {
    const [copied, setCopied] = useState(false);
    return (
        <div className="mt-5 flex overflow-hidden rounded-[var(--radius-control)] border border-[color:var(--color-rule-strong)] bg-[color:var(--color-bg)]">
            {/* Wraps rather than scrolls: a scrollbar inside a one-line box read as broken, and a
                long skill name is the common case. */}
            <code className="min-w-0 flex-1 px-3.5 py-[11px] font-mono text-[13px] [overflow-wrap:anywhere]">
                <span className="text-[color:var(--color-steel)]">$ </span>
                {command}
            </code>
            <button
                type="button"
                onClick={() => {
                    void navigator.clipboard?.writeText(command).then(() => {
                        setCopied(true);
                        window.setTimeout(() => setCopied(false), 1500);
                    });
                }}
                // Banged: the unlayered `button { border }` rule beats any utility
                // (`lib/control-class` lists it).
                className="shrink-0 border-0! border-l! border-[color:var(--color-rule-strong)]! bg-transparent px-3.5 font-mono text-[11px] text-[color:var(--color-silver)]! hover:bg-[color:var(--color-raised)]"
            >
                <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
            </button>
        </div>
    );
}

export function Signal({value, what, by}: {value: string; what: string; by: string}) {
    return (
        <div className="flex min-w-0 flex-col gap-0.5">
            <b className="font-mono text-[22px] font-medium leading-[1.1] tracking-[-0.02em] tabular-nums [overflow-wrap:anywhere]">
                {value}
            </b>
            <span className="text-[13px] text-[color:var(--color-silver)]">{what}</span>
            <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-[color:var(--color-steel)]">
                {by}
            </span>
        </div>
    );
}

export function Panel({
    label,
    aside,
    children,
}: {
    label: string;
    aside?: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <div className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-[color:var(--color-rule)] px-[18px] pt-3.5 pb-4">
            <span className={`${LABEL} flex items-center gap-2`}>
                {label}
                {aside}
            </span>
            {children}
        </div>
    );
}

export function ClsRow({term, children}: {term: string; children: React.ReactNode}) {
    return (
        <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 border-t border-[color:var(--color-rule)] py-[7px] text-[13.5px] first:border-t-0">
            <dt className="text-[color:var(--color-steel)]">{term}</dt>
            <dd className="m-0 font-mono text-[13px]">{children}</dd>
        </div>
    );
}

export function Block({
    title,
    label,
    children,
}: {
    title: string;
    label: string;
    children: React.ReactNode;
}) {
    return (
        <section className="mt-[72px]">
            <div className="mb-[22px] flex flex-wrap items-baseline justify-between gap-x-6 gap-y-3 border-b border-[color:var(--color-rule-strong)] pb-3">
                <h2 className="text-[22px] font-bold tracking-[-0.01em]">{title}</h2>
                <span className={LABEL}>{label}</span>
            </div>
            {children}
        </section>
    );
}

export function RecordRow({term, children}: {term: string; children: React.ReactNode}) {
    return (
        <div className="grid grid-cols-[9rem_minmax(0,1fr)] gap-4 border-b border-[color:var(--color-rule)] py-[11px] text-[13px]">
            <dt className="text-[color:var(--color-steel)]">{term}</dt>
            <dd className="m-0 font-mono text-[12.5px] text-[color:var(--color-silver)] [overflow-wrap:anywhere]">
                {children}
            </dd>
        </div>
    );
}
