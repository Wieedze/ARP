import {fireEvent, screen} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";

import type {CohortView} from "../services/agent-cohort";
import type {ToolCatalogView, ToolRow} from "../services/tool-catalog";
import {renderWithProviders} from "../test/render";
import {SearchPage} from "./SearchPage";

const tool = (name: string, label: string): ToolRow => ({
    key: `0x${name}`,
    provenance: "registered",
    name,
    isUnnamed: false,
    source: "obra/superpowers",
    label,
    href: `/atom/0x${name}`,
    declarations: 0,
    declarers: [],
    provenDeposits: null,
    declaredDeposits: null,
    supportTrust: "0.001",
    opposeTrust: null,
    stakers: 0,
});

const CATALOG: ToolCatalogView = {
    rows: [
        tool("writing-plans", "github.com/obra/superpowers?skill=writing-plans"),
        tool("brainstorming", "github.com/obra/superpowers?skill=brainstorming"),
    ],
    truncated: false,
    curveId: 1,
};

const agents = (names: string[]): CohortView => ({
    sourceId: "test",
    order: "evidence-quantity",
    total: names.length,
    rangeLabel: "",
    limit: 10,
    offset: 0,
    hasPrevious: false,
    hasNext: false,
    rows: names.map((name) => ({
        key: name,
        sigilId: "0x01",
        name,
        isFallbackMetadata: false,
        imageUrl: null,
        modules: [],
        href: "/agent/8453/1380",
        identityProblem: null,
        statementCount: 3,
        marketCap: null,
        marketCapExact: null,
        positions: "",
        isUnsupported: true,
    })),
});

vi.mock("../hooks/use-agent-cohort", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../hooks/use-agent-cohort")>()),
    useAgentSearch: (name: string) => ({
        data: agents(name.toLowerCase().includes("dackie") ? ["Captain Dackie"] : []),
        error: null,
    }),
}));
vi.mock("../hooks/use-tool-catalog", () => ({
    useToolCatalog: () => ({data: CATALOG, error: null}),
}));
vi.mock("../hooks/use-skill-facts", () => ({
    useSkillFacts: () => ({factFor: () => null, repoFactFor: () => null}),
}));

const search = (text: string) => {
    const box = screen.getByRole("searchbox", {name: "Search agents and tools"});
    fireEvent.change(box, {target: {value: text}});
    fireEvent.submit(screen.getByRole("search"));
};

describe("the search page (task 48)", () => {
    it("shows nothing before a query", () => {
        renderWithProviders(<SearchPage />);
        expect(screen.queryByRole("heading", {name: /Agents/})).toBeNull();
    });

    it("finds an agent by name and tools by name in one search", () => {
        renderWithProviders(<SearchPage />);
        search("dackie");
        expect(screen.getByText("Captain Dackie")).toBeInTheDocument();
        expect(screen.getByRole("heading", {name: "Tools · 0"})).toBeInTheDocument();
        search("writing");
        expect(screen.getByText("writing-plans")).toBeInTheDocument();
        expect(screen.queryByText("brainstorming")).toBeNull();
        expect(screen.getByText(/No agent by that name/)).toBeInTheDocument();
    });

    it("offers to open an agent typed by its ids", () => {
        renderWithProviders(<SearchPage />);
        search("8453/1380");
        expect(screen.getByRole("link", {name: "Open agent 8453/1380 →"})).toHaveAttribute(
            "href",
            "/agent/8453/1380",
        );
    });
});
