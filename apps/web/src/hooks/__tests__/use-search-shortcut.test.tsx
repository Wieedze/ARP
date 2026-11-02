import {fireEvent, render, screen} from "@testing-library/react";
import {MemoryRouter, useLocation} from "react-router-dom";
import {describe, expect, it} from "vitest";

import {isTypingTarget, useSearchShortcut} from "../use-search-shortcut";

describe("isTypingTarget", () => {
    it("is true in a field, where / is a character", () => {
        expect(isTypingTarget(document.createElement("input"))).toBe(true);
        expect(isTypingTarget(document.createElement("textarea"))).toBe(true);
    });

    it("is false on the page itself", () => {
        expect(isTypingTarget(document.body)).toBe(false);
        expect(isTypingTarget(null)).toBe(false);
    });
});

/** The hook under a router, with the location printed so a test can read where it went. */
function Probe({withSearchField = false}: {withSearchField?: boolean}) {
    useSearchShortcut();
    const location = useLocation();
    return (
        <>
            <p data-testid="where">{`${location.pathname}${location.search}`}</p>
            <input aria-label="Other field" />
            {withSearchField ? <input type="search" aria-label="Search agents and tools" /> : null}
        </>
    );
}

const at = (path: string, withSearchField = false) =>
    render(
        <MemoryRouter initialEntries={[path]}>
            <Probe withSearchField={withSearchField} />
        </MemoryRouter>,
    );
const where = () => screen.getByTestId("where").textContent;

describe("useSearchShortcut (task 48)", () => {
    it("opens the search from another page", () => {
        at("/tools");
        fireEvent.keyDown(window, {key: "/"});
        expect(where()).toBe("/search");
    });

    it("leaves a browser shortcut alone", () => {
        at("/tools");
        fireEvent.keyDown(window, {key: "/", ctrlKey: true});
        fireEvent.keyDown(window, {key: "/", metaKey: true});
        fireEvent.keyDown(window, {key: "/", altKey: true});
        expect(where()).toBe("/tools");
    });

    it("leaves a / typed into a field alone", () => {
        at("/tools");
        fireEvent.keyDown(screen.getByLabelText("Other field"), {key: "/"});
        expect(where()).toBe("/tools");
    });

    it("focuses the field on a blank search instead of navigating", () => {
        at("/search", true);
        fireEvent.keyDown(window, {key: "/"});
        expect(where()).toBe("/search");
        expect(screen.getByLabelText("Search agents and tools")).toHaveFocus();
    });
});
