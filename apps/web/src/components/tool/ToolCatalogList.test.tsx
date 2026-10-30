import {describe, expect, it, vi} from "vitest";
import {screen} from "@testing-library/react";

import {renderWithProviders} from "../../test/render";
import type {ToolRow} from "../../services/tool-catalog";
import {ToolCatalogList} from "./ToolCatalogList";

/**
 * The `/tools` columns as a reader gets them (task 42).
 *
 * The skill facts live beside the chain and load from a chunk of their own; they are faked here
 * because nothing in these assertions is about them.
 */
vi.mock("../../hooks/use-skill-facts", () => ({
    useSkillFacts: () => ({factFor: () => null, repoFactFor: () => null}),
}));

const row = (overrides: Partial<ToolRow> = {}): ToolRow => ({
    key: "0xaa",
    provenance: "declared",
    name: "slither",
    isUnnamed: false,
    source: null,
    label: null,
    href: "/atom/0xaa",
    declarations: 4,
    provenDeposits: 3,
    declaredDeposits: 7,
    supportTrust: "1.0000",
    opposeTrust: null,
    stakers: null,
    ...overrides,
});

describe("ToolCatalogList", () => {
    it("heads the figures Usage then Declared, and no longer Paid for or Claims", () => {
        const {container} = renderWithProviders(<ToolCatalogList rows={[row()]} curveId={1} />);
        const header = container.querySelector("[aria-hidden]");
        expect(header?.textContent).toBe("ToolUsageDeclaredStaked");
        expect(screen.queryByText(/paid for/i)).toBeNull();
    });

    it("puts the proven figure before the declared one, each with its own label", () => {
        renderWithProviders(<ToolCatalogList rows={[row()]} curveId={1} />);
        const link = screen.getByRole("link");
        // A screen reader gets the label beside each figure, since the header is hidden from it.
        expect(link.textContent).toContain("3usage7declared");
    });

    it("leaves a zero or an unknown blank rather than printing it", () => {
        renderWithProviders(
            <ToolCatalogList
                rows={[
                    row({key: "0xbb", provenDeposits: 0, declaredDeposits: 2}),
                    row({
                        key: "0xcc",
                        provenance: "registered",
                        provenDeposits: null,
                        declaredDeposits: null,
                    }),
                ]}
                curveId={1}
            />,
        );
        const [first, second] = screen.getAllByRole("link");
        expect(first?.textContent).toContain("usage2declared");
        expect(second?.textContent).toContain("usagedeclared");
        expect(second?.textContent).not.toMatch(/\d(usage|declared)/);
    });
});
