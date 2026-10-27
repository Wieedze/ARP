import {useChainChoice, useSetChain} from "../../lib/chain-choice";

/**
 * Which chain the page reads from. ADR `0059`.
 *
 * A segmented pair rather than a switch: a switch has an implied "off", and neither chain is off.
 * The selected side takes the accent, which is the same device every other selected state on this
 * surface uses (ADR `0057` §2).
 *
 * **It moves reads, not writes**, and the module note on `chain-choice.ts` says why. A reader on
 * testnet who opens a stake form still meets the mainnet guard, which is correct until the write
 * path is made chain-aware deliberately.
 */
export function ChainToggle() {
    const {isMainnet} = useChainChoice();
    const setMainnet = useSetChain();

    return (
        <div
            role="group"
            aria-label="Which chain to read"
            className="inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.1em]"
        >
            {[
                {label: "Mainnet", value: true},
                {label: "Testnet", value: false},
            ].map((option) => {
                const selected = option.value === isMainnet;
                return (
                    <button
                        key={option.label}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setMainnet(option.value)}
                        // `text-…!` and `border-…!` because `index.css`'s unlayered `button` rule
                        // beats both utilities — `lib/control-class.ts` has the full table.
                        className={`px-2 py-1 ${
                            selected
                                ? "border-[color:var(--color-accent)]! text-[color:var(--color-accent)]!"
                                : "border-[color:var(--color-rule)]! text-[color:var(--color-steel)]!"
                        }`}
                    >
                        {option.label}
                    </button>
                );
            })}
        </div>
    );
}
