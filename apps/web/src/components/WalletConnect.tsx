import {useEffect, useRef, useState} from "react";
import {useNavigate} from "react-router-dom";
import {useAccount, useConnect, useDisconnect} from "wagmi";

/**
 * Wallet connection UI.
 *
 *   - Disconnected: single "Connect wallet" button.
 *   - Connecting: button shows "Connecting…".
 *   - Connected: address truncated in mono, click reveals a small menu:
 *     "Copy address", "Account" (opens `/account`, the delegations and settings), "Disconnect"
 *     (user, 2026-10-30, `docs/tasks/35` §0).
 *
 * No modal, no drawer. The connector list is short on Intuition Testnet
 * (typically just MetaMask `injected` and optionally WalletConnect), so a
 * dropdown is the right surface.
 */
// The unlayered `button` rule in `index.css` sets border, radius and background, and beats every
// Tailwind utility for them, so each one is forced with `!`. Hover is a background change only
// (`rules/ui.md`), and with no border the focus ring is an outline.
const MENU_ITEM =
    "block w-full rounded-none! border-0! px-3 py-2 text-left hover:bg-[color:var(--color-raised)]! focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-[color:var(--color-accent)]";

export function WalletConnect() {
    const {address, isConnected, status} = useAccount();
    const {connectors, connect, isPending: isConnectPending} = useConnect();
    const {disconnect} = useDisconnect();
    const navigate = useNavigate();

    const [open, setOpen] = useState(false);
    const [copyFailed, setCopyFailed] = useState(false);
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
            <button
                type="button"
                disabled
                className="h-7 px-2.5 font-mono text-[11px] uppercase tracking-[0.1em]"
            >
                Connecting…
            </button>
        );
    }

    if (!isConnected || !address) {
        // Prefer MetaMask if available, otherwise use the first available connector.
        const primary =
            connectors.find((c) => c.id === "metaMask" || c.id === "injected") ?? connectors[0];
        if (!primary) {
            return (
                <span className="text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]">
                    No wallet detected
                </span>
            );
        }
        return (
            <button
                type="button"
                onClick={() => connect({connector: primary})}
                className="h-7 px-2.5 font-mono text-[11px] uppercase tracking-[0.1em]"
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
                onClick={() => {
                    setCopyFailed(false);
                    setOpen((v) => !v);
                }}
                aria-haspopup="menu"
                aria-expanded={open}
                className="flex h-7 items-center gap-2 rounded-[var(--radius-control)] px-2.5 font-mono text-[11px]"
            >
                <span
                    className="size-[6px] rounded-full bg-[color:var(--color-accent)]"
                    aria-hidden
                />
                {short}
            </button>
            {open ? (
                <div className="absolute right-0 top-full mt-1 w-44 border border-[color:var(--color-rule-strong)] bg-[color:var(--color-ground)] text-[length:var(--text-body-sm)]">
                    <div role="menu">
                        <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                                setCopyFailed(false);
                                // The menu closes only once the address is on the clipboard; a refused
                                // write, or no clipboard at all (insecure context), keeps it open.
                                Promise.resolve()
                                    .then(() => navigator.clipboard.writeText(address))
                                    .then(
                                        () => setOpen(false),
                                        () => setCopyFailed(true),
                                    );
                            }}
                            className={MENU_ITEM}
                        >
                            Copy address
                        </button>
                        <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                                setOpen(false);
                                navigate("/account");
                            }}
                            className={MENU_ITEM}
                        >
                            Account
                        </button>
                        <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                                disconnect();
                                setOpen(false);
                            }}
                            className={MENU_ITEM}
                        >
                            Disconnect
                        </button>
                    </div>
                    {/* Outside `role="menu"`, whose owned children may only be menu items. */}
                    {copyFailed ? (
                        <p
                            role="alert"
                            className="border-t border-[color:var(--color-rule)] px-3 py-2 text-[color:var(--color-steel)]"
                        >
                            Copy failed
                        </p>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}
