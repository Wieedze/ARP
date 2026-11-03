import {render, screen} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";

import type {EndpointRead} from "../../../services/agent-endpoints";

let read: EndpointRead;

vi.mock("../../../hooks/use-agent-endpoints", () => ({
    useAgentEndpoints: () => ({isPending: false, data: read}),
}));

import {AgentEndpoints} from "../AgentEndpoints";

/** A registration file URI is whatever the agent minted with, so it is only a link when http(s). */
describe("AgentEndpoints, when the document could not be read", () => {
    it("shows a non-http registration URI as text, never as a link", () => {
        read = {
            status: "unreadable",
            url: "javascript:alert(1)",
            href: null,
            detail: "could not be read from a browser",
        };
        render(<AgentEndpoints registrationFile="javascript:alert(1)" />);
        expect(screen.getByText("javascript:alert(1)").closest("a")).toBeNull();
        expect(screen.queryByRole("link")).toBeNull();
    });

    it("links an http(s) registration URI", () => {
        read = {
            status: "unreadable",
            url: "ipfs://bafy",
            href: "https://ipfs.io/ipfs/bafy",
            detail: "the host answered 404",
        };
        render(<AgentEndpoints registrationFile="ipfs://bafy" />);
        expect(screen.getByRole("link")).toHaveAttribute("href", "https://ipfs.io/ipfs/bafy");
    });
});
