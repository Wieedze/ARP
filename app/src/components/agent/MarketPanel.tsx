import type {MarketSide} from "@arp-protocol/erc8004";

import type {TrustRow} from "../../services/agent-trust";
import type {ClaimVaults, VaultPosition} from "../../services/trust-stake";
import {describeStakers, formatTrust, truncateMiddle} from "../../services/trust-format";

/**
 * The live market on one `has trust provider` claim.
 *
 * Two numbers come from two places. Balances are read from the MultiVault,
 * because that is the vault a deposit lands in and it is correct before the
 * indexer is. Position counts come from the indexer, because the contract does
 * not expose them. Neither is presented as the other.
 *
 * Position count and distinct stakers appear on every side, always. These
 * vaults hold one or two positions each; a bare market cap would suggest a
 * depth of opinion that does not exist here.
 */

function SideColumn({
    title,
    side,
    vault,
    isLoading,
}: {
    title: string;
    side: MarketSide | null;
    vault: VaultPosition | undefined;
    isLoading: boolean;
}) {
    const onChainAssets = vault?.totalAssets ?? null;
    // `marketCap` is the curve's own vault, which is what `getVault` returns and
    // what a deposit joins. `totalAssets` on a MarketSide is the term-level
    // total, which folds in the triple's underlying atom vaults and runs three
    // orders of magnitude higher — showing it here would overstate the claim.
    const indexerAssets = side?.marketCap ?? null;

    return (
        <div className="border-t border-[color:var(--color-border)] pt-3">
            <p className="font-mono uppercase tracking-wider text-[length:var(--text-label)] text-[color:var(--color-fg-60)]">
                {title}
            </p>
            <p className="mt-2 font-mono text-[length:var(--text-body)]">
                {onChainAssets !== null
                    ? `${formatTrust(onChainAssets)} TRUST`
                    : isLoading
                      ? "reading vault…"
                      : indexerAssets !== null
                        ? `${formatTrust(indexerAssets)} TRUST`
                        : "—"}
            </p>
            <p className="mt-1 text-[length:var(--text-body-sm)] text-[color:var(--color-fg-60)]">
                {side === null ? "no market data" : describeStakers(side)}
            </p>
            {vault !== undefined && vault.shares !== null && vault.shares > 0n ? (
                <p className="mt-2 font-mono text-[length:var(--text-body-sm)] text-[color:var(--color-accent)]">
                    your position: {formatTrust(vault.shares)} shares
                </p>
            ) : null}
            {vault !== undefined ? (
                <p className="mt-2 font-mono text-[length:var(--text-body-sm)] text-[color:var(--color-fg-60)] break-all">
                    {truncateMiddle(vault.termId, 10, 8)}
                </p>
            ) : null}
        </div>
    );
}

export function MarketPanel({
    row,
    vaults,
    isLoading,
    error,
}: {
    row: TrustRow;
    vaults: ClaimVaults | undefined;
    isLoading: boolean;
    error: Error | null;
}) {
    if (row.tripleId === null) {
        return (
            <p className="text-[length:var(--text-body-sm)] text-[color:var(--color-fg-60)] max-w-[52ch]">
                {row.providerClaim === null ? (
                    <>
                        No <span className="font-mono">has trust provider</span> edge backs this
                        assessment, so there is no vault and nothing to take a position on.
                    </>
                ) : (
                    <>
                        This provider edge's identifier is not a 32-byte term id, so no vault can be
                        addressed from it. Nothing is staked here and nothing can be.
                    </>
                )}
            </p>
        );
    }

    return (
        <div>
            <div className="grid sm:grid-cols-2 gap-x-8 gap-y-4">
                <SideColumn
                    title="Support"
                    side={row.market?.support ?? null}
                    vault={vaults?.support}
                    isLoading={isLoading}
                />
                <SideColumn
                    title="Opposition"
                    side={row.market?.opposition ?? null}
                    vault={vaults?.opposition}
                    isLoading={isLoading}
                />
            </div>
            {error !== null ? (
                <p className="mt-3 text-[length:var(--text-body-sm)] text-[color:var(--color-fg-60)]">
                    Vault balances could not be read: {error.message}. The indexer figures above are
                    what is left.
                </p>
            ) : null}
        </div>
    );
}
