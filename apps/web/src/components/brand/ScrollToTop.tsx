import {useLayoutEffect} from "react";
import {useLocation, useNavigationType} from "react-router-dom";

/**
 * A new page opens at its top.
 *
 * `BrowserRouter` keeps the window's scroll across a route change, so a row clicked far down the
 * agents or tools list opened the next page at that same depth, and its title was never seen (user,
 * 2026-10-29).
 *
 * **On the path, not the query**: `?index=repos` or `?what=agent` switch a view inside one page and
 * must not throw the reader back up. **Not on `POP`**: Back returns to where the reader was, which
 * the browser restores on its own.
 */
export function ScrollToTop() {
    const {pathname} = useLocation();
    const navigationType = useNavigationType();
    useLayoutEffect(() => {
        if (navigationType === "POP") return;
        window.scrollTo({top: 0, left: 0, behavior: "instant"});
        // `navigationType` is read at the moment the path changes; it is not a trigger of its own.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pathname]);
    return null;
}
