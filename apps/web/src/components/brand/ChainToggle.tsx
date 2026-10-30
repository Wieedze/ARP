import {useChainChoice, useSetChain} from "../../lib/chain-choice";

/**
 * Which chain the page reads and writes. ADR `0059`, widened to writes by ADR `0061`.
 *
 * ## One button, not two
 *
 * It was a segmented pair — MAINNET | TESTNET, both always drawn — on the argument that a switch
 * has an implied "off" and neither chain is off. That argument still holds and the pair still lost:
 * two labelled buttons are ~190px, and the nav's right column also carries two links and a wallet
 * address. It overflowed, wrapped the address onto a second line, and pushed the centred mark off
 * centre — the exact failure the mark was moved left to avoid in the first place (user, with a
 * screenshot, 2026-10-27).
 *
 * So: one button that **names the chain you are on** and switches on click. The implied-off problem
 * is answered by the label rather than by the geometry — it never reads "off", it reads "Mainnet"
 * or "Testnet", and the accent means the same thing it means everywhere else on this surface
 * (ADR `0057` §2): this is the live one.
 *
 * `aria-label` carries the verb the label omits, so a screen reader is told it is a control and
 * what it will do, not just which chain is current.
 */
export function ChainToggle() {
    const {isMainnet, label} = useChainChoice();
    const setMainnet = useSetChain();
    const other = isMainnet ? "Testnet" : "Mainnet";

    return (
        <button
            type="button"
            onClick={() => setMainnet(!isMainnet)}
            aria-label={`Reading ${label}. Switch to ${other}.`}
            title={`Switch to ${other}`}
            // `text-…!` and `border-…!` because `index.css`'s unlayered `button` rule beats both
            // utilities — `lib/control-class.ts` has the full table.
            className="inline-flex h-7 items-center gap-2 rounded-[var(--radius-control)] border-[color:var(--color-rule-strong)]! px-2.5 font-mono text-[11px] uppercase tracking-[0.1em] text-[color:var(--color-fg)]!"
        >
            <span
                aria-hidden="true"
                className={`h-[6px] w-[6px] rounded-full ${
                    isMainnet
                        ? "bg-[color:var(--color-accent)]"
                        : "border border-[color:var(--color-steel)]"
                }`}
            />
            {label}
        </button>
    );
}
