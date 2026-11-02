import {fireEvent, screen} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";

import type {ToolCatalogView, ToolRow} from "../services/tool-catalog";
import {renderWithProviders} from "../test/render";
import {ToolCatalog} from "./ToolCatalog";

const row = (index: number, source: string | null): ToolRow => ({
    key: `0x${index.toString(16).padStart(64, "0")}`,
    provenance: "registered",
    name: `tool-${index}`,
    isUnnamed: false,
    source,
    label: `tool-${index}`,
    href: `/atom/0x${index}`,
    declarations: 0,
    provenDeposits: null,
    declaredDeposits: null,
    supportTrust: "0.001",
    opposeTrust: null,
    stakers: 0,
});

// 60 skills (they carry a repository) and 30 repositories, so both indexes span pages.
const VIEW: ToolCatalogView = {
    rows: [
        ...Array.from({length: 60}, (_, index) => row(index, "owner/skills")),
        ...Array.from({length: 30}, (_, index) => row(100 + index, null)),
    ],
    truncated: false,
    curveId: 1,
};
// The "video" domain holds the first 30 skills.
const VIDEO = new Set(VIEW.rows.slice(0, 30).map((entry) => entry.key.toLowerCase()));

vi.mock("../hooks/use-tool-catalog", () => ({
    useToolCatalog: () => ({data: VIEW, error: null, refetch: async () => undefined}),
}));
vi.mock("../hooks/use-domain-tree", () => ({
    useDomainTree: () => ({tree: undefined, options: [{label: "video", depth: 0}], error: null}),
}));
vi.mock("../hooks/use-tag-index", () => ({
    useTagIndex: () => ({
        index: {
            byDomain: new Map(),
            countFor: () => VIDEO.size,
            idsUnder: (domains: readonly string[]) => (domains.length === 0 ? null : VIDEO),
        },
        isLoading: false,
        error: null,
    }),
}));
vi.mock("../hooks/use-skill-facts", () => ({
    useSkillFacts: () => ({factFor: () => null, repoFactFor: () => null}),
}));

const range = () => screen.getByRole("navigation", {name: "Tool pages"}).querySelector("p");
const next = () => fireEvent.click(screen.getByRole("button", {name: "Next →"}));

describe("the tools page", () => {
    it("shows 25 rows at a time and steps through them", () => {
        renderWithProviders(<ToolCatalog />);
        expect(range()).toHaveTextContent("1–25 of 60");
        expect(
            screen.getAllByRole("listitem").filter((item) => item.querySelector("a")),
        ).toHaveLength(25);
        expect(screen.getByRole("button", {name: "← Previous"})).toBeDisabled();
        next();
        next();
        expect(range()).toHaveTextContent("51–60 of 60");
        expect(screen.getByRole("button", {name: "Next →"})).toBeDisabled();
    });

    it("goes back to the first page when the order changes", () => {
        renderWithProviders(<ToolCatalog />);
        next();
        expect(range()).toHaveTextContent("26–50 of 60");
        fireEvent.click(screen.getByRole("button", {name: "Most installs"}));
        expect(range()).toHaveTextContent("1–25 of 60");
    });

    it("goes back to the first page when the index changes", () => {
        renderWithProviders(<ToolCatalog />);
        next();
        fireEvent.click(screen.getByRole("button", {name: /Repositories/}));
        expect(range()).toHaveTextContent("1–25 of 30");
    });

    it("goes back to the first page when a domain is picked or cleared", () => {
        renderWithProviders(<ToolCatalog />);
        next();
        fireEvent.click(screen.getByRole("button", {name: /^video/}));
        expect(range()).toHaveTextContent("1–25 of 30");
        next();
        fireEvent.click(screen.getByRole("button", {name: "Clear"}));
        expect(range()).toHaveTextContent("1–25 of 60");
    });
});
