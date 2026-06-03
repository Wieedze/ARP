import {useEffect, useRef, useState} from "react";
import {useAccount, useConnect, useDisconnect} from "wagmi";

/**
 * Wallet connection UI.
 *
 *   - Disconnected: single "Connect wallet" button.
 *   - Connecting: button shows "Connecting…".
 *   - Connected: address truncated in mono, click reveals a small dropdown
 *     with "Copy address" + "Disconnect".
 *
 * No modal, no drawer. The connector list is short on Intuition Testnet
 * (typically just MetaMask `injected` and optionally WalletConnect), so a
 * dropdown is the right surface.
 */
export function WalletConnect() {
    const {address, isConnected, status} = useAccount();
    const {connectors, connect, isPending: isConnectPending} = useConnect();
    const {disconnect} = useDisconnect();

    const [open, setOpen] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        function onClick(e: MouseEvent) {
            if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
        }
        function onKey(e: KeyboardEvent) {
            if (e.key === "Escape") setOpen(false);
        }
        window.addEventListener("mousedown", onClick);
        window.addEventListener("keydown", onKey);
        return () => {
            window.removeEventListener("mousedown", onClick);
            window.removeEventListener("keydown", onKey);
        };
    }, [open]);

    if (isConnectPending || status === "connecting" || status === "reconnecting") {
        return (
            <button type="button" disabled className="px-3 py-1.5 text-[length:var(--text-body-sm)] font-mono">
                Connecting…
            </button>
        );
    }

    if (!isConnected || !address) {
        // Prefer MetaMask if available, otherwise use the first available connector.
        const primary = connectors.find((c) => c.id === "metaMask" || c.id === "injected") ?? connectors[0];
        if (!primary) {
            return (
                <span className="text-[length:var(--text-body-sm)] text-[color:var(--color-fg-40)]">
                    No wallet detected
                </span>
            );
        }
        return (
            <button
                type="button"
                onClick={() => connect({connector: primary})}
                className="px-3 py-1.5 text-[length:var(--text-body-sm)]"
            >
                Connect wallet
            </button>
        );
    }

    const short = `${address.slice(0, 6)}…${address.slice(-4)}`;

    return (
        <div ref={wrapperRef} className="relative">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={open}
                className="flex items-center gap-2 px-3 py-1.5 text-[length:var(--text-body-sm)] font-mono"
            >
                <span className="size-2 bg-[color:var(--color-accent)]" aria-hidden />
                {short}
            </button>
            {open ? (
                <div
                    role="menu"
                    className="absolute right-0 top-full mt-1 w-44 border border-[color:var(--color-border-strong)] bg-[color:var(--color-bg)] text-[length:var(--text-body-sm)]"
                >
                    <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                            navigator.clipboard.writeText(address);
                            setOpen(false);
                        }}
                        className="block w-full border-0 px-3 py-2 text-left hover:text-[color:var(--color-accent)]"
                    >
                        Copy address
                    </button>
                    <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                            disconnect();
                            setOpen(false);
                        }}
                        className="block w-full border-0 px-3 py-2 text-left hover:text-[color:var(--color-accent)]"
                    >
                        Disconnect
                    </button>
                </div>
            ) : null}
        </div>
    );
}
