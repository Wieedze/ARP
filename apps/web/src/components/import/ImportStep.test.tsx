import {render, screen} from "@testing-library/react";
import {describe, expect, it} from "vitest";

import {Step} from "./ImportStep";

/**
 * A locked step dims its rule and nothing else: the ordinal and the prose stay readable before the
 * step unlocks. The colour tokens are the only thing happy-dom can see of that, so they are what is
 * asserted.
 */
describe("Step", () => {
    it("dims a locked step's rule and keeps its ordinal at the open step's colour", () => {
        render(
            <>
                <Step index={1} title="Open" status="idle">
                    <p>Readable before the step unlocks.</p>
                </Step>
                <Step index={2} title="Locked" status="idle" disabled>
                    <p>Also readable before the step unlocks.</p>
                </Step>
            </>,
        );

        const open = screen.getByRole("region", {name: "Open"});
        const locked = screen.getByRole("region", {name: "Locked"});
        expect(open.className).toContain("border-l-[color:var(--color-rule-strong)]");
        expect(locked.className).toContain("border-l-[color:var(--color-rule)]");

        expect(screen.getByText("Step 2").className).toBe(screen.getByText("Step 1").className);
        expect(screen.getByText("Step 2").className).toContain("var(--color-steel)");
    });
});
