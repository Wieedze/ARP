import {describe, expect, it, vi} from "vitest";
import {screen} from "@testing-library/react";

import {renderWithProviders} from "../../test/render";
import type {ToolRow} from "../../services/tool-catalog";
import {rankTools, skillUsageByRepo} from "../../services/tool-catalog";
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
        expect(header?.textContent).toBe("ToolUsageDeclaredSupport");
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

    it("reads the Declared column down in order under Most declared", () => {
        // The sort and the column name the same count. Edge counts are chosen to disagree with it,
        // so a sort on edges would print 3 above 6.
        const rows = [
            row({
                key: "0x01",
                name: "wide",
                declarations: 3,
                provenDeposits: 0,
                declaredDeposits: 3,
            }),
            row({
                key: "0x02",
                name: "deep",
                declarations: 2,
                provenDeposits: 0,
                declaredDeposits: 6,
            }),
            row({
                key: "0x03",
                name: "mid",
                declarations: 5,
                provenDeposits: 0,
                declaredDeposits: 4,
            }),
        ];
        const ranked = rankTools(rows, "declared", () => ({
            liveness: "alive",
            installs: null,
            stars: null,
        }));
        renderWithProviders(<ToolCatalogList rows={ranked} curveId={1} />);
        const figures = screen
            .getAllByRole("link")
            .map((link) => /(\d+)declared/.exec(link.textContent ?? "")?.[1])
            .map(Number);
        expect(figures).toEqual([6, 4, 3]);
    });

    it("says where a declared row came from without the word its Declared column uses", () => {
        renderWithProviders(<ToolCatalogList rows={[row()]} curveId={1} />);
        expect(screen.getByText(/named by agents/i)).toBeTruthy();
        expect(screen.queryByText(/declared by agents/i)).toBeNull();
    });

    it("shows a repository's skills' use on its row, beside its own empty columns (task 58)", () => {
        const repo = row({key: "0xrr", name: "anthropics/skills", label: "github.com/anthropics/skills", declarations: 0, provenDeposits: 0, declaredDeposits: 0});
        const skills = [
            row({key: "0x1", name: "pptx", source: "anthropics/skills", declarations: 2, provenDeposits: 2, declaredDeposits: 1}),
            row({key: "0x2", name: "pdf", source: "anthropics/skills", declarations: 1, provenDeposits: 1, declaredDeposits: 1}),
            row({key: "0x3", name: "docx", source: "anthropics/skills", declarations: 0, provenDeposits: 0, declaredDeposits: 0}),
        ];
        renderWithProviders(
            <ToolCatalogList rows={[repo]} curveId={1} showStars repoUsage={skillUsageByRepo([repo, ...skills])} />,
        );
        const link = screen.getByRole("link");
        expect(link.textContent).toContain("2 skills declared");
        expect(link.textContent).toContain("3 usage");
        // Its own columns stay its own: nothing was declared about the repository itself.
        expect(link.textContent).not.toContain("3usage");
    });

    it("says nothing about a repository none of whose skills was declared", () => {
        const repo = row({key: "0xrr", name: "acme/skills", label: "github.com/acme/skills", declarations: 0, provenDeposits: 0, declaredDeposits: 0});
        renderWithProviders(<ToolCatalogList rows={[repo]} curveId={1} showStars repoUsage={skillUsageByRepo([repo])} />);
        expect(screen.getByRole("link").textContent).not.toContain("skills declared");
    });
});
