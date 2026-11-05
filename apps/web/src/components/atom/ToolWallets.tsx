import {Block} from "./AtomPageParts";
import {useToolWallets} from "../../hooks/use-tool-wallets";
import {useChainChoice} from "../../lib/chain-choice";
import {linkClass} from "../../lib/control-class";
import {formatTrust, truncateMiddle} from "../../services/trust-format";

/**
 * The wallets behind a tool's Signals figure: who the sponsor deposited for, and how much (ADR `0143`).
 * Absent rather than empty when there are none, and while the read runs: no other section on the
 * page depends on it.
 */
export function ToolWallets({atomId}: {atomId: string}) {
    const chain = useChainChoice();
    const wallets = useToolWallets(atomId).data ?? [];
    if (wallets.length === 0) return null;
    return (
        <Block title="Wallets" label="Who the sponsor deposited for">
            <ul>
                {wallets.map((wallet) => (
                    <li
                        key={wallet.account}
                        className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-t border-[color:var(--color-rule)] py-2"
                    >
                        <a
                            href={`${chain.explorerUrl}/address/${wallet.account}`}
                            target="_blank"
                            rel="noreferrer"
                            className={`font-mono text-[length:var(--text-body-sm)] ${linkClass}`}
                        >
                            {truncateMiddle(wallet.account, 10, 6)}
                        </a>
                        <span className="font-mono tabular-nums text-[length:var(--text-body-sm)]">
                            {`${formatTrust(wallet.assets)} ${chain.symbol}`}
                        </span>
                    </li>
                ))}
            </ul>
        </Block>
    );
}
