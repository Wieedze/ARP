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
    provenDeposits: null,
    supportTrust: "0.001",
    opposeTrust: null,
    stakers: 0,
});

const CATALOG: ToolCatalogView = {
    rows: [
        tool("writing-plans", "github.com/obra/superpowers?skill=writing-plans"),
        tool("brainstorming", "github.com/obra/superpowers?skill=brainstorming"),
        tool("wide-plans", "github.com/obra/superpowers?skill=wide-plans"),
        {...tool("zeta-plans", "github.com/owner/zeta-plans"), source: null},
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
    useReadsUsage: () => false,
    useToolCatalog: () => ({data: CATALOG, error: null}),
}));
vi.mock("../hooks/use-skill-facts", () => ({
    useSkillFacts: () => ({
        factFor: (label: string | null) =>
            label?.endsWith("wide-plans") === true ? {description: "", installs: 9} : null,
        repoFactFor: (label: string | null) =>
            label?.endsWith("zeta-plans") === true
                ? {stars: 5, archived: false, gone: false}
                : null,
    }),
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

    it("orders by installs where Usage cannot be read, then stars, then the name", () => {
        renderWithProviders(<SearchPage />);
        search("plans");
        const names = screen.getAllByRole("link").map((link) => link.textContent ?? "");
        const at = (name: string) => names.findIndex((text) => text.includes(name));
        expect(at("wide-plans")).toBeGreaterThanOrEqual(0);
        expect(at("wide-plans")).toBeLessThan(at("zeta-plans"));
        expect(at("zeta-plans")).toBeLessThan(at("writing-plans"));
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
