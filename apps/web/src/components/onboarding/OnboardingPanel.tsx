import {useCallback, useEffect, useMemo, useRef, useState, type ReactNode} from "react";
import {createPortal} from "react-dom";
import {Link, useLocation} from "react-router-dom";

import {START_PATHS, rememberProfile, startPathTo} from "../../lib/start-paths";
import {controlClass} from "../../lib/control-class";
import {OnboardingContext} from "./onboarding-context";

/**
 * The onboarding panel and its provider (task 53, ADR `0114`). It asks which path to take, and
 * nothing else: the wallet line left it in task 62, and a wallet is now asked for only by an action
 * that signs (`ConnectPrompt`, ADR `0128`).
 *
 * A full-page sheet on the page's own ground, not a translucent overlay: `rules/ui.md` allows no
 * shadow and no glow, and a sheet needs neither.
 *
 * **It is modal for real**, not only by `aria-modal`. It renders outside `#root` through a portal,
 * and while it is open `#root` is `inert`, so Tab and a screen reader's browse mode cannot reach
 * the page hidden under it. The page does not scroll, `body[data-modal="open"]` tells the landing's
 * `SceneDeck` to leave the wheel alone (its listeners are on `window`, which `inert` does not
 * stop), and on close the focus goes back to whatever opened the sheet.
 *
 * **It closes when the page it leads to is on screen, not when a path is clicked.** Closing on
 * click showed the landing for a moment (user, 2026-11-03), and closing on the location change
 * still showed the route's "loading your path…" fallback for about 280ms: `RouteTransition` keys
 * every route on `location.key`, so even a preloaded lazy page suspends once (ui-reviewer, task
 * 62). So `StartPage` calls `landed` from its mount effect. Any other location change closes the
 * sheet too, so it is never left open over a page that does not call `landed`.
 */
export function OnboardingProvider({children}: {children: ReactNode}) {
    const {key, pathname} = useLocation();
    const [openOn, setOpenOn] = useState<string | null>(null);
    const isOpen = openOn !== null && (openOn === key || pathname.startsWith("/start/"));
    const opener = useRef<HTMLElement | null>(null);
    // Set by a path's link: the sheet then closes on a new page, and the focus is not sent back.
    const leaving = useRef(false);

    const open = useCallback(() => {
        opener.current =
            document.activeElement instanceof HTMLElement ? document.activeElement : null;
        leaving.current = false;
        void import("../../pages/StartPage");
        setOpenOn(key);
    }, [key]);
    const close = useCallback(() => setOpenOn(null), []);
    const value = useMemo(() => ({open, landed: close}), [open, close]);

    useEffect(() => {
        if (!isOpen) return;
        const root = document.getElementById("root");
        root?.setAttribute("inert", "");
        root?.setAttribute("aria-hidden", "true");
        document.body.dataset.modal = "open";
        // The root element, not `body`: `index.css` sets `html, body { overflow-x: clip }`, so the
        // body's overflow is never handed to the viewport and `body { overflow: hidden }` leaves
        // the window scrolling. Measured in Chromium by ui-reviewer, task 53.
        const html = document.documentElement;
        const overflow = html.style.overflow;
        html.style.overflow = "hidden";
        return () => {
            root?.removeAttribute("inert");
            root?.removeAttribute("aria-hidden");
            delete document.body.dataset.modal;
            html.style.overflow = overflow;
            // Back to the opener only when the sheet was dismissed; a path leaves for a new page.
            if (!leaving.current) opener.current?.focus();
        };
    }, [isOpen]);

    return (
        <OnboardingContext.Provider value={value}>
            {children}
            {isOpen &&
                createPortal(
                    <OnboardingPanel
                        onClose={close}
                        onLeave={() => {
                            leaving.current = true;
                        }}
                    />,
                    document.body,
                )}
        </OnboardingContext.Provider>
    );
}

function OnboardingPanel({onClose, onLeave}: {onClose: () => void; onLeave: () => void}) {
    const first = useRef<HTMLAnchorElement>(null);

    // Once, on mount: a re-render must not pull the focus back to the first path.
    useEffect(() => {
        first.current?.focus();
    }, []);

    useEffect(() => {
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
            className="fixed inset-0 z-50 flex overflow-y-auto overscroll-contain bg-[color:var(--color-ground)]"
        >
            <button
                type="button"
                onClick={onClose}
                // Ground, banged over the unlayered `button { background: transparent }`: on a
                // short screen the sheet scrolls and Close would otherwise sit on a card.
                className={`fixed top-6 right-6 z-10 bg-[color:var(--color-ground)]! ${controlClass}`}
            >
                Close
            </button>
            {/* `m-auto` in a flex parent: centred while it fits, scrolled from the top when not. */}
            <div className="m-auto flex w-full max-w-4xl flex-col gap-10 px-6 py-20">
                <h2
                    id="onboarding-title"
                    className="type-face text-center text-[clamp(32px,4vw,48px)] leading-none"
                >
                    What brings you here?
                </h2>
                <div className="grid gap-5 md:grid-cols-3">
                    {START_PATHS.map((path, index) => (
                        // The `!` on the focus radius: `index.css`'s unlayered `a:focus-visible`
                        // rule sets `border-radius: 1px` and beats any utility.
                        <Link
                            key={path.profile}
                            ref={index === 0 ? first : undefined}
                            to={startPathTo(path.profile)}
                            // No `onClose`: the sheet closes when the path's page is on screen.
                            onClick={() => {
                                rememberProfile(path.profile);
                                onLeave();
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
            </div>
        </div>
    );
}
