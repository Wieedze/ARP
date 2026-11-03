import {fireEvent, screen} from "@testing-library/react";
import {describe, expect, it} from "vitest";

import {renderWithProviders} from "../../../test/render";
import {NavAction, NavLink, NavSplit} from "../NavSplit";

function nav(onAction: () => void = () => undefined, at = "/") {
    return renderWithProviders(
        <NavSplit
            left={<NavLink to="/tools">Tools</NavLink>}
            right={
                <>
                    <NavLink to="/activity">Activity</NavLink>
                    <NavAction section="/start" onClick={onAction}>
                        Get started
                    </NavAction>
                </>
            }
        />,
        {route: {path: "*", at}},
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
        expect(opened).toHaveTextContent("Get started");
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
        const activity = Array.from(opened.querySelectorAll("a")).at(-1);
        if (activity === undefined) throw new Error("no link in the menu");
        fireEvent.click(activity);
        fireEvent.click(activity);
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

    it("closes when Get started opens the panel", () => {
        let opened = 0;
        nav(() => (opened += 1));
        fireEvent.click(screen.getByRole("button", {name: "Menu"}));
        const menu = screen.getByRole("navigation", {name: "Main"});
        const action = Array.from(menu.querySelectorAll("button")).find(
            (button) => button.textContent === "Get started",
        );
        if (action === undefined) throw new Error("no Get started in the menu");
        fireEvent.click(action);
        expect(opened).toBe(1);
        expect(screen.queryByRole("navigation", {name: "Main"})).toBeNull();
    });
});

describe("Get started in the nav (task 62)", () => {
    it("is lit on the path it opened", () => {
        nav(undefined, "/start/agent");
        const lit = screen
            .getAllByRole("button", {name: "Get started"})
            .filter((button) => button.getAttribute("aria-current") === "page");
        expect(lit.length).toBeGreaterThan(0);
    });

    it("is not lit elsewhere", () => {
        nav(undefined, "/tools");
        for (const button of screen.getAllByRole("button", {name: "Get started"}))
            expect(button).not.toHaveAttribute("aria-current");
    });
});
