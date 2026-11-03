import {useEffect, useRef, useState, type ReactNode} from "react";
import {Link} from "react-router-dom";
import {useConnect} from "wagmi";

import {START_PATHS, rememberProfile, startPathTo} from "../../lib/start-paths";
import {controlClass} from "../../lib/control-class";
import {OnboardingContext} from "./onboarding-context";

/**
 * The onboarding panel and its provider (task 53, ADR `0114`). Connecting means choosing a path
 * and connecting one's agent; a wallet is the last line, for whoever wants to sign.
 *
 * A full-page sheet on the page's own ground, not a translucent overlay: `rules/ui.md` allows no
 * shadow and no glow, and a sheet needs neither.
 */
export function OnboardingProvider({children}: {children: ReactNode}) {
    const [isOpen, setIsOpen] = useState(false);
    return (
        <OnboardingContext.Provider value={{open: () => setIsOpen(true)}}>
            {children}
            {isOpen && <OnboardingPanel onClose={() => setIsOpen(false)} />}
        </OnboardingContext.Provider>
    );
}

function OnboardingPanel({onClose}: {onClose: () => void}) {
    const first = useRef<HTMLAnchorElement>(null);
    const {connectors, connect} = useConnect();
    const wallet =
        connectors.find((c) => c.id === "metaMask" || c.id === "injected") ?? connectors[0];

    useEffect(() => {
        first.current?.focus();
        function onKey(event: KeyboardEvent) {
            if (event.key === "Escape") onClose();
        }
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="onboarding-title"
            className="fixed inset-0 z-50 overflow-y-auto bg-[color:var(--color-ground)]"
        >
            <div className="mx-auto flex max-w-4xl flex-col gap-10 px-6 py-16">
                <div className="flex items-start justify-between gap-6">
                    <h2
                        id="onboarding-title"
                        className="type-face text-[clamp(32px,4vw,48px)] leading-none"
                    >
                        What brings you here?
                    </h2>
                    <button type="button" onClick={onClose} className={controlClass}>
                        Close
                    </button>
                </div>
                <div className="grid gap-5 md:grid-cols-3">
                    {START_PATHS.map((path, index) => (
                        // The `!` on the focus radius: `index.css`'s unlayered `a:focus-visible`
                        // rule sets `border-radius: 1px` and beats any utility.
                        <Link
                            key={path.profile}
                            ref={index === 0 ? first : undefined}
                            to={startPathTo(path.profile)}
                            onClick={() => {
                                rememberProfile(path.profile);
                                onClose();
                            }}
                            className={`flex min-h-36 flex-col gap-6 rounded-[var(--radius-card)] border p-5 hover:bg-[var(--color-raised)] focus-visible:rounded-[var(--radius-card)]! ${
                                path.primary
                                    ? "border-[color:var(--color-accent)]"
                                    : "border-[color:var(--color-rule)]"
                            }`}
                        >
                            <span className="type-face text-[20px]">{path.title}</span>
                            <span className="mt-auto font-mono text-[length:var(--text-label)] uppercase tracking-[0.08em] text-[color:var(--color-steel)]">
                                {path.atHand}
                            </span>
                        </Link>
                    ))}
                </div>
                <div className="flex flex-wrap items-center gap-4 border-t border-[color:var(--color-rule)] pt-6">
                    {wallet === undefined ? (
                        <span className="text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]">
                            No wallet detected
                        </span>
                    ) : (
                        <button
                            type="button"
                            onClick={() => {
                                connect({connector: wallet});
                                onClose();
                            }}
                            className={controlClass}
                        >
                            I have a wallet
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
