import {fireEvent, screen, within} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";

import type {CohortRow, CohortView} from "../services/agent-cohort";
import {renderWithProviders} from "../test/render";
import {AgentDirectory} from "./AgentDirectory";

const navigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => ({
    ...(await importOriginal<typeof import("react-router-dom")>()),
    useNavigate: () => navigate,
}));

const row = (overrides: Partial<CohortRow>): CohortRow => ({
    key: "k",
    sigilId: "0x01",
    name: "Agent",
    isFallbackMetadata: false,
    imageUrl: null,
    modules: [],
    href: "/agent/8453/1",
    identityProblem: null,
    statementCount: 3,
    marketCap: "6.337 TRUST",
    marketCapExact: "6.3369302 TRUST",
    positions: "1 support",
    isUnsupported: false,
    ...overrides,
});

const VIEW: CohortView = {
    sourceId: "test",
    order: "evidence-quantity",
    total: 2,
    rangeLabel: "1–2 of 2",
    limit: 25,
    offset: 0,
    hasPrevious: false,
    hasNext: false,
    rows: [
        row({key: "a", name: "Captain Dackie"}),
        row({
            key: "b",
            name: "Jeed",
            marketCap: "<0.00000001 TRUST",
            positions: "0 supports",
            isUnsupported: true,
        }),
    ],
};

vi.mock("../hooks/use-agent-cohort", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../hooks/use-agent-cohort")>()),
    useAgentCohort: () => ({
        data: VIEW,
        error: null,
        isPlaceholderData: false,
        refetch: async () => undefined,
    }),
}));
// The capability results read the graph; only the filter input matters here.
vi.mock("../components/agent/CapabilitySearch", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../components/agent/CapabilitySearch")>()),
    CapabilityResults: ({domain}: {domain: string}) => <p>results for {domain}</p>,
}));

function closest(element: HTMLElement, selector: string): HTMLElement {
    const found = element.closest<HTMLElement>(selector);
    if (found === null) throw new Error(`no ${selector} around the element`);
    return found;
}

const searchFor = (text: string) => {
    const box = screen.getByRole("searchbox");
    fireEvent.change(box, {target: {value: text}});
    fireEvent.submit(closest(box, "form"));
};

describe("the agent index", () => {
    it("opens an agent typed as chain/token, and a bare token on Base", () => {
        navigate.mockClear();
        renderWithProviders(<AgentDirectory />);
        searchFor("56/12");
        expect(navigate).toHaveBeenLastCalledWith("/agent/56/12");
        searchFor("1380");
        expect(navigate).toHaveBeenLastCalledWith("/agent/8453/1380");
    });

    it("filters by capability for anything that is not an id", () => {
        navigate.mockClear();
        renderWithProviders(<AgentDirectory />);
        searchFor("MCP Server");
        expect(navigate).not.toHaveBeenCalled();
        expect(screen.getByText("results for MCP Server")).toBeInTheDocument();
    });

    it("leaves the support cell empty when nobody supports, and says so to a screen reader", () => {
        renderWithProviders(<AgentDirectory />);
        const jeed = closest(screen.getByText("Jeed"), "li");
        expect(within(jeed).queryByText(/TRUST/)).toBeNull();
        expect(within(jeed).getByText("no support")).toBeInTheDocument();
        const dackie = closest(screen.getByText("Captain Dackie"), "li");
        expect(within(dackie).getByText(/6\.337 TRUST/)).toBeInTheDocument();
    });

    it("has no separate lookup form any more", () => {
        renderWithProviders(<AgentDirectory />);
        expect(screen.queryByText(/Or open one/)).toBeNull();
    });
});
