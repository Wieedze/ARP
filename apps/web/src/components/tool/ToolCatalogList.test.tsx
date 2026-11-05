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
    declarers: [],
    sponsoredDeposits: 3,
    wallets: 2,
    supportTrust: "1.0000",
    opposeTrust: null,
    stakers: null,
    ...overrides,
});

describe("ToolCatalogList", () => {
    it("heads the figures Signals, Wallets, Support, and no longer Declared, Paid for or Claims", () => {
        const {container} = renderWithProviders(<ToolCatalogList rows={[row()]} curveId={1} />);
        const header = container.querySelector("[aria-hidden]");
        expect(header?.textContent).toBe("ToolSignalsWalletsSupport");
        expect(screen.queryByText(/paid for/i)).toBeNull();
    });

    it("gives each figure its own label", () => {
        renderWithProviders(<ToolCatalogList rows={[row()]} curveId={1} />);
        const link = screen.getByRole("link");
        // A screen reader gets the label beside each figure, since the header is hidden from it.
        expect(link.textContent).toContain("3signals2wallets");
    });

    it("leaves a zero or an unknown blank rather than printing it", () => {
        renderWithProviders(
            <ToolCatalogList
                rows={[
                    row({key: "0xbb", sponsoredDeposits: 0}),
                    row({
                        key: "0xcc",
                        provenance: "registered",
                        sponsoredDeposits: null,
                    }),
                ]}
                curveId={1}
            />,
        );
        const [first, second] = screen.getAllByRole("link");
        // No figure, no label: below `sm` a lone "signals" would read as naming the Support amount.
        expect(first?.textContent).not.toMatch(/signals/);
        expect(second?.textContent).not.toMatch(/signals/);
    });

    it("reads the Signals column down in order under Most signals", () => {
        // Edge counts are chosen to disagree with it, so a sort on edges would print 3 above 6.
        const rows = [
            row({key: "0x01", name: "wide", declarations: 3, sponsoredDeposits: 3}),
            row({key: "0x02", name: "deep", declarations: 2, sponsoredDeposits: 6}),
            row({key: "0x03", name: "mid", declarations: 5, sponsoredDeposits: 4}),
        ];
        const ranked = rankTools(rows, "signals", () => ({
            liveness: "alive",
            installs: null,
            stars: null,
        }));
        renderWithProviders(<ToolCatalogList rows={ranked} curveId={1} />);
        const figures = screen
            .getAllByRole("link")
            .map((link) => /(\d+)signals/.exec(link.textContent ?? "")?.[1])
            .map(Number);
        expect(figures).toEqual([6, 4, 3]);
    });

    it("says where a declared row came from in its own words", () => {
        renderWithProviders(<ToolCatalogList rows={[row()]} curveId={1} />);
        expect(screen.getByText(/named by agents/i)).toBeTruthy();
        expect(screen.queryByText(/declared by agents/i)).toBeNull();
    });

    it("shows on a repository row how many agents use its skills, each once (task 58)", () => {
        const repo = row({
            key: "0xrr",
            name: "anthropics/skills",
            label: "github.com/anthropics/skills",
            declarations: 0,
            sponsoredDeposits: 0,
        });
        const skills = [
            row({
                key: "0x1",
                name: "pptx",
                source: "anthropics/skills",
                declarations: 2,
                declarers: ["0xa", "0xb"],
            }),
            row({
                key: "0x2",
                name: "pdf",
                source: "anthropics/skills",
                declarations: 1,
                declarers: ["0xa"],
            }),
            row({
                key: "0x3",
                name: "docx",
                source: "anthropics/skills",
                declarations: 0,
                declarers: [],
            }),
        ];
        renderWithProviders(
            <ToolCatalogList
                rows={[repo]}
                curveId={1}
                showStars
                repoUsage={skillUsageByRepo([repo, ...skills])}
            />,
        );
        expect(screen.getByRole("img", {name: "2 agents use its skills"})).toBeTruthy();
        expect(screen.getByRole("link").textContent).not.toMatch(/skills? declared|usage\b/i);
    });

    it("says nothing about a repository none of whose skills was declared", () => {
        const repo = row({
            key: "0xrr",
            name: "acme/skills",
            label: "github.com/acme/skills",
            declarations: 0,
            sponsoredDeposits: 0,
        });
        renderWithProviders(
            <ToolCatalogList
                rows={[repo]}
                curveId={1}
                showStars
                repoUsage={skillUsageByRepo([repo])}
            />,
        );
        expect(screen.queryByRole("img", {name: /use its skills/})).toBeNull();
    });

    it("names one agent in the singular", () => {
        const repo = row({
            key: "0xrr",
            name: "acme/skills",
            label: "github.com/acme/skills",
            declarations: 0,
            sponsoredDeposits: 0,
        });
        const skill = row({
            key: "0x1",
            name: "one",
            source: "acme/skills",
            declarations: 1,
            declarers: ["0xa"],
        });
        renderWithProviders(
            <ToolCatalogList
                rows={[repo]}
                curveId={1}
                showStars
                repoUsage={skillUsageByRepo([repo, skill])}
            />,
        );
        expect(screen.getByRole("img", {name: "1 agent uses its skills"}).textContent).toBe("1");
    });
});
