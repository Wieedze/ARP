import {fireEvent, screen} from "@testing-library/react";
import {describe, expect, it} from "vitest";

import {renderWithProviders} from "../../../test/render";
import {NavLink, NavSplit} from "../NavSplit";

function nav() {
    return renderWithProviders(
        <NavSplit
            left={<NavLink to="/tools">Tools</NavLink>}
            right={<NavLink to="/register">Register</NavLink>}
        />,
    );
}

describe("the phone nav (task 48)", () => {
    it("keeps the items behind a Menu button until it is opened", () => {
        nav();
        const menu = screen.getByRole("button", {name: "Menu"});
        expect(menu).toHaveAttribute("aria-expanded", "false");
        expect(screen.queryByRole("navigation", {name: "Main"})).toBeNull();
        fireEvent.click(menu);
        // One name; the state is aria-expanded's to carry.
        expect(menu).toHaveAttribute("aria-expanded", "true");
        const opened = screen.getByRole("navigation", {name: "Main"});
        expect(opened).toHaveTextContent("Tools");
        expect(opened).toHaveTextContent("Register");
    });

    it("closes on Escape and gives the focus back to the Menu button", () => {
        nav();
        const menu = screen.getByRole("button", {name: "Menu"});
        fireEvent.click(menu);
        fireEvent.keyDown(window, {key: "Escape"});
        expect(screen.queryByRole("navigation", {name: "Main"})).toBeNull();
        expect(menu).toHaveFocus();
    });

    it("closes on a link to the page already open", () => {
        nav();
        fireEvent.click(screen.getByRole("button", {name: "Menu"}));
        const opened = screen.getByRole("navigation", {name: "Main"});
        const register = Array.from(opened.querySelectorAll("a")).at(-1);
        if (register === undefined) throw new Error("no link in the menu");
        fireEvent.click(register);
        fireEvent.click(register);
        expect(screen.queryByRole("navigation", {name: "Main"})).toBeNull();
    });

    it("closes when one of its links opens another page", () => {
        nav();
        fireEvent.click(screen.getByRole("button", {name: "Menu"}));
        const opened = screen.getByRole("navigation", {name: "Main"});
        const [tools] = Array.from(opened.querySelectorAll("a"));
        if (tools === undefined) throw new Error("no link in the menu");
        fireEvent.click(tools);
        expect(screen.queryByRole("navigation", {name: "Main"})).toBeNull();
    });
});
