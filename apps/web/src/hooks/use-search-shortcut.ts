import {useEffect} from "react";
import {useLocation, useNavigate} from "react-router-dom";

/** Whether a key press belongs to a field the reader is typing in, where `/` is a character. */
export function isTypingTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

/**
 * `/` opens the search from any page (task 48), the convention of most indexes. Ignored while the
 * reader is typing in a field, and with a modifier held, so it never eats a character or a browser
 * shortcut.
 */
export function useSearchShortcut() {
    const navigate = useNavigate();
    const {pathname, search} = useLocation();
    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
            if (isTypingTarget(event.target)) return;
            event.preventDefault();
            // Already on a blank search, navigating changes nothing and the field keeps its blur:
            // give it the focus instead. Elsewhere the page opens with the field focused.
            if (pathname === "/search" && search === "") {
                document.querySelector<HTMLInputElement>('input[type="search"]')?.focus();
                return;
            }
            navigate("/search");
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [navigate, pathname, search]);
}
