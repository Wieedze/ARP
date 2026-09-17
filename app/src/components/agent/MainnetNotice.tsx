import {INTUITION_MAINNET_CHAIN_ID} from "../../lib/intuition-mainnet";
import {deployments} from "../../lib/deployments";

/**
 * The app spans two networks and confusing them is the sharpest failure mode
 * on this surface (ADR 0017). This bar is the one place in the app that
 * inverts the palette — solid foreground, background-coloured type — because
 * "this is real money" must not read like one more label.
 *
 * It is monochrome on purpose: the alarm colour is reserved for a signature
 * mismatch and nothing else.
 */
export function MainnetNotice() {
    return (
        <p className="bg-[color:var(--color-fg)] text-[color:var(--color-bg)] font-mono uppercase tracking-wider text-[length:var(--text-label)] px-4 py-2">
            Intuition mainnet · chain {INTUITION_MAINNET_CHAIN_ID} · real TRUST
            <span className="normal-case tracking-normal">
                {" — "}ARP's own contracts are on Intuition testnet {deployments.chain.chainId}.
                Nothing on this page is testnet data.
            </span>
        </p>
    );
}
