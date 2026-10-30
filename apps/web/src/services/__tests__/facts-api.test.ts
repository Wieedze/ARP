import {describe, expect, it} from "vitest";

import {dayOf, fetchFacts} from "../facts-api";

const answer = {
    read: {
        skills: {oldest: "2026-10-30T09:18:25.589Z", newest: "2026-10-30T09:23:13.982Z"},
        repos: {oldest: null, newest: null},
        paths: {oldest: null, newest: null},
    },
    skills: {
        "github.com/o/r?skill=x": {
            description: "d",
            installs: 7,
            fetchedAt: "2026-10-30T09:18:25.589Z",
        },
    },
    repos: {},
    paths: {},
};

const respond =
    (body: unknown, status = 200): typeof fetch =>
    async () =>
        new Response(JSON.stringify(body), {status, headers: {"content-type": "application/json"}});

describe("fetchFacts", () => {
    it("reads <base>/facts, with or without a trailing slash", async () => {
        const seen: string[] = [];
        const fetcher: typeof fetch = async (url) => {
            seen.push(String(url));
            return respond(answer)(url);
        };
        await fetchFacts("http://localhost:8787/", fetcher);
        expect(seen).toEqual(["http://localhost:8787/facts"]);
    });

    it("returns the document when it has the shape", async () => {
        const facts = await fetchFacts("http://api", respond(answer));
        expect(facts.skills["github.com/o/r?skill=x"]?.installs).toBe(7);
    });

    it("refuses a non-OK answer, a wrong shape, and an empty cache — the caller falls back", async () => {
        await expect(fetchFacts("http://api", respond(answer, 503))).rejects.toThrow(/503/);
        await expect(fetchFacts("http://api", respond({skills: []}))).rejects.toThrow(
            /not a facts/,
        );
        await expect(fetchFacts("http://api", respond({...answer, skills: {}}))).rejects.toThrow(
            /nothing yet/,
        );
    });
});

describe("dayOf", () => {
    it("is the date part of an instant, or null", () => {
        expect(dayOf("2026-10-30T09:18:25.589Z")).toBe("2026-10-30");
        expect(dayOf(null)).toBeNull();
    });
});
