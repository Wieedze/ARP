import {fireEvent, render, screen} from "@testing-library/react";
import {Link, MemoryRouter, Route, Routes} from "react-router-dom";
import {afterEach, describe, expect, it, vi} from "vitest";

import {ScrollToTop} from "../ScrollToTop";

afterEach(() => vi.restoreAllMocks());

function renderAt(path: string) {
    return render(
        <MemoryRouter initialEntries={[path]}>
            <ScrollToTop />
            <Routes>
                <Route
                    path="/tools"
                    element={
                        <>
                            <Link to="/atom/0xab">open a tool</Link>
                            <Link to="/tools?index=repos">repositories</Link>
                        </>
                    }
                />
                <Route path="/atom/:id" element={<p>atom page</p>} />
            </Routes>
        </MemoryRouter>,
    );
}

describe("ScrollToTop", () => {
    it("opens the next page at its top", () => {
        const scroll = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
        renderAt("/tools");
        scroll.mockClear();
        fireEvent.click(screen.getByText("open a tool"));
        expect(screen.getByText("atom page")).toBeTruthy();
        expect(scroll).toHaveBeenCalledWith({top: 0, left: 0, behavior: "instant"});
    });

    it("leaves the scroll alone when only the query changes", () => {
        const scroll = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
        renderAt("/tools");
        scroll.mockClear();
        fireEvent.click(screen.getByText("repositories"));
        expect(scroll).not.toHaveBeenCalled();
    });
});
