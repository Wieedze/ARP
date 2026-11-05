import {render, screen} from "@testing-library/react";
import {MemoryRouter, Route, Routes} from "react-router-dom";
import {beforeEach, describe, expect, it, vi} from "vitest";

import type {PulseRead} from "../hooks/use-pulse";
import type {PulseView} from "../services/pulse";
import {PulsePage} from "./PulsePage";

let read: PulseRead;
vi.mock("../hooks/use-pulse", () => ({usePulse: () => read}));

const pulse: PulseView["pulse"] = {
    source: "a/b",
    skill: "cut-silences",
    installs: null,
    installsText: null,
    url: null,
    status: "read",
    path: "skills/cut-silences/SKILL.md",
    alsoAt: [],
    differsAt: [],
    contentId: "d896bd88",
    skillMdSha: "blob",
    repository: {stars: 12, pushedAt: "2026-11-01T00:00:00Z", archived: false},
    files: 2,
    bytes: 2048,
    scripts: 1,
    keys: ["ELEVENLABS_API_KEY"],
    paidWords: [],
    hosts: [],
    runsAbsentFiles: ["scripts/transcribe-elevenlabs.mjs"],
    keysInScriptsItRuns: [],
    requires: {cli: [], runs: ["ffmpeg"], login: null, description: null},
};

const open = () =>
    render(
        <MemoryRouter initialEntries={["/pulse/a/b/cut-silences"]}>
            <Routes>
                <Route path="/pulse/:owner/:repo/:skill" element={<PulsePage />} />
            </Routes>
        </MemoryRouter>,
    );

describe("PulsePage", () => {
    beforeEach(() => {
        read = {status: "pending"};
    });

    it("announces the read while it runs", () => {
        open();
        expect(screen.getByRole("status", {name: "Reading this skill"})).toBeTruthy();
    });

    it("shows what the file mentions, including a script it does not ship", () => {
        read = {status: "ok", view: {pulse, atomId: "0x1", usage: null}};
        open();
        expect(screen.getByText("ELEVENLABS_API_KEY")).toBeTruthy();
        expect(screen.getByText("scripts/transcribe-elevenlabs.mjs")).toBeTruthy();
    });

    it("says unknown, not unused, when nobody declared", () => {
        read = {
            status: "ok",
            view: {pulse, atomId: "0x1", usage: {declarations: [], agents: 0, wallets: 0, byDomain: {}, byOutcome: {}, byOthers: [], truncated: false}},
        };
        open();
        expect(screen.getByText(/Unknown, not unused/)).toBeTruthy();
    });

    it("does not read a failed graph as nobody declaring", () => {
        read = {status: "ok", view: {pulse, atomId: "0x1", usage: null}};
        open();
        expect(screen.getByText(/did not answer/)).toBeTruthy();
        expect(screen.queryByText(/not unused/)).toBeNull();
    });

    it("shows who wrote what, with outcomes and domains", () => {
        const declaration = {tripleId: "0x2", agent: {atomId: "0x3", label: "agent six"}, writer: "0x4", declaredAt: null, domains: ["video"], outcomes: ["failed"]};
        read = {
            status: "ok",
            view: {pulse, atomId: "0x1", usage: {declarations: [declaration], agents: 1, wallets: 1, byDomain: {video: 1}, byOutcome: {failed: 1}, byOthers: [], truncated: false}},
        };
        open();
        expect(screen.getByText(/1, by 1 agent and 1 wallet/)).toBeTruthy();
        expect(screen.getByText(/agent six · failed · video/)).toBeTruthy();
    });

    it("shows a line another wallet wrote apart, and says when the read is a floor", () => {
        const declaration = {tripleId: "0x2", agent: {atomId: "0x3", label: "agent six"}, writer: "0x4", declaredAt: null, domains: [], outcomes: []};
        read = {
            status: "ok",
            view: {
                pulse,
                atomId: "0x1",
                usage: {
                    declarations: [declaration],
                    agents: 1,
                    wallets: 1,
                    byDomain: {},
                    byOutcome: {},
                    byOthers: [{tripleId: "0x5", writer: "0xOther", predicate: "outcome", value: "failed"}],
                    truncated: true,
                },
            },
        };
        open();
        expect(screen.getByText(/failed \(0xOther\)/)).toBeTruthy();
        expect(screen.getByText(/so these are a floor/)).toBeTruthy();
        expect(screen.getByText(/at least 1, by 1 agent/)).toBeTruthy();
    });

    it("says what it needs is unknown when the file was not read", () => {
        read = {
            status: "ok",
            view: {
                pulse: {source: "a/b", skill: "x", installs: null, installsText: null, url: null, status: "not_github"},
                atomId: "0x1",
                usage: null,
            },
        };
        open();
        expect(screen.getByText(/What it needs is unknown/)).toBeTruthy();
    });
});
