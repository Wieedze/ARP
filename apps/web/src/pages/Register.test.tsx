import {fireEvent, screen} from "@testing-library/react";
import {describe, expect, it} from "vitest";

import {renderWithProviders} from "../test/render";
import {Register} from "./Register";

const tile = (name: RegExp) => screen.getByRole("button", {name});

describe("the register page", () => {
    it("offers two tiles, each naming what its branch asks for", () => {
        renderWithProviders(<Register />);
        expect(tile(/An agent/)).toHaveTextContent("ERC-8004 identity · wallet");
        expect(tile(/A tool/)).toHaveTextContent("URL · wallet");
        expect(tile(/An agent/)).toHaveAttribute("aria-pressed", "false");
        expect(tile(/A tool/)).toHaveAttribute("aria-pressed", "false");
    });

    it("marks the chosen tile and only that one", () => {
        renderWithProviders(<Register />);
        fireEvent.click(tile(/A tool/));
        expect(tile(/A tool/)).toHaveAttribute("aria-pressed", "true");
        expect(tile(/An agent/)).toHaveAttribute("aria-pressed", "false");
        fireEvent.click(tile(/An agent/));
        expect(tile(/An agent/)).toHaveAttribute("aria-pressed", "true");
        expect(tile(/A tool/)).toHaveAttribute("aria-pressed", "false");
    });
});
