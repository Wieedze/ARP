import {render, screen} from "@testing-library/react";
import {MemoryRouter, Route, Routes, useLocation} from "react-router-dom";
import {describe, expect, it} from "vitest";

import {RegisterRedirect} from "./App";

function Where() {
    const {pathname, search} = useLocation();
    return <p data-testid="where">{`${pathname}${search}`}</p>;
}

function landAt(from: string): string {
    render(
        <MemoryRouter initialEntries={[from]}>
            <Routes>
                <Route path="/register" element={<RegisterRedirect />} />
                <Route path="/agent" element={<RegisterRedirect what="agent" />} />
                <Route path="*" element={<Where />} />
            </Routes>
        </MemoryRouter>,
    );
    return screen.getByTestId("where").textContent ?? "";
}

/** `/register` folded into `/start/<profile>` (task 62); an old link lands on the branch it named. */
describe("the old register links", () => {
    it.each([
        ["/register?what=tool", "/start/tool?with=wallet"],
        ["/register?what=agent", "/start/agent"],
        ["/register?what=agent&have=yes", "/start/agent?have=yes"],
        ["/register?what=agent&have=no", "/start/agent?with=wallet"],
        ["/register", "/"],
        ["/agent?have=yes", "/start/agent?have=yes"],
        ["/agent", "/start/agent"],
    ])("%s lands on %s", (from, to) => {
        expect(landAt(from)).toBe(to);
    });
});
