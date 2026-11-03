import {describe, expect, it} from "vitest";

import type {FetchLike} from "@arp-protocol/graphql";
import {
    guardedFetchText,
    privateAddress,
    privateProbeTarget,
    probeEndpoint,
} from "../src/verify/probe.js";
import type {DeclaredEndpoint} from "../src/verify/types.js";

function endpoint(url: string, protocol: "mcp" | "a2a" | null = null): DeclaredEndpoint {
    return {
        declaredUnder: "endpoints",
        name: protocol,
        protocol,
        version: null,
        capabilities: [],
        classification: {status: "probeable", url, declared: url},
    };
}

/** Answers each URL from a table and records what was asked for. */
function routed(routes: Record<string, () => Response>): {fetch: FetchLike; asked: string[]} {
    const asked: string[] = [];
    return {
        asked,
        fetch: async (input, init) => {
            asked.push(`${init?.method ?? "GET"} ${input} redirect=${String(init?.redirect)}`);
            const route = routes[input];
            if (route === undefined) throw new Error(`no route for ${input}`);
            return route();
        },
    };
}

const redirect =
    (location: string, status = 302) =>
    () =>
        new Response(null, {status, headers: {location}});

describe("privateProbeTarget — the ranges the first version missed", () => {
    it.each([
        ["IPv6 unspecified", "http://[::]/"],
        ["IPv6 link-local", "http://[fe80::1]/"],
        ["IPv6 link-local, upper end of /10", "http://[febf::1]/"],
        ["IPv6 unique local fc00::/7, fc half", "http://[fc00::1]/"],
        ["IPv4-compatible loopback", "http://[::7f00:1]/"],
        ["IPv4-compatible loopback, dotted", "http://[::127.0.0.1]/"],
        ["IPv4-mapped loopback, fully written", "http://[0:0:0:0:0:ffff:7f00:1]/"],
        ["NAT64 to loopback", "http://[64:ff9b::127.0.0.1]/"],
        ["NAT64 to metadata", "http://[64:ff9b::a9fe:a9fe]/"],
        ["NAT64 local-use", "http://[64:ff9b:1::8.8.8.8]/"],
        ["6to4 wrapping 10/8", "http://[2002:a00:1::]/"],
        ["IPv6 multicast", "http://[ff02::1]/"],
        ["carrier-grade NAT, bottom", "http://100.64.0.1/"],
        ["carrier-grade NAT, top", "http://100.127.255.254/"],
        ["the zero net, not just 0.0.0.0", "http://0.1.2.3/"],
        ["link-local, other host", "http://169.254.1.1/"],
        ["IPv4 multicast", "http://224.0.0.1/"],
        ["IPv4 reserved", "http://240.0.0.1/"],
        ["broadcast", "http://255.255.255.255/"],
        ["localhost with a trailing dot", "http://localhost./"],
    ])("refuses %s", (_case, url) => {
        expect(privateProbeTarget(url)).not.toBeNull();
    });

    it.each([
        ["just below carrier-grade NAT", "http://100.63.255.255/"],
        ["just above carrier-grade NAT", "http://100.128.0.1/"],
        ["a public IPv6 address", "http://[2606:4700:4700::1111]/"],
        ["NAT64 to a public address", "http://[64:ff9b::8.8.8.8]/"],
        ["IPv4-compatible public", "http://[::8.8.8.8]/"],
        ["fe00::, just below link-local", "http://[fe00::1]/"],
        ["a 6to4 public address", "http://[2002:808:808::]/"],
    ])("allows %s", (_case, url) => {
        expect(privateProbeTarget(url)).toBeNull();
    });

    it("judges a resolver's literal answer without brackets", () => {
        expect(privateAddress("127.0.0.1")).toBe(true);
        expect(privateAddress("::1")).toBe(true);
        expect(privateAddress("fe80::1%eth0")).toBe(true);
        expect(privateAddress("93.184.216.34")).toBe(false);
        expect(privateAddress("example.com")).toBe(false);
    });
});

describe("guardedFetchText", () => {
    it("never lets the runtime follow a redirect", async () => {
        const {fetch, asked} = routed({"https://public.test/": () => new Response("ok")});
        await guardedFetchText(fetch, "https://public.test/", {}, {timeoutMs: 1_000});
        expect(asked).toEqual(["GET https://public.test/ redirect=manual"]);
    });

    it("refuses a public first hop redirecting to cloud metadata, and sends nothing there", async () => {
        const {fetch, asked} = routed({
            "https://public.test/": redirect("http://169.254.169.254/latest/meta-data/"),
        });
        const answer = await guardedFetchText(
            fetch,
            "https://public.test/",
            {},
            {timeoutMs: 1_000},
        );
        expect(answer.status).toBe("refused");
        expect(asked).toHaveLength(1);
    });

    it("follows a redirect to another public host", async () => {
        const {fetch} = routed({
            "https://public.test/": redirect("https://other.test/doc", 301),
            "https://other.test/doc": () => new Response("the document"),
        });
        const answer = await guardedFetchText(
            fetch,
            "https://public.test/",
            {},
            {timeoutMs: 1_000},
        );
        expect(answer).toMatchObject({
            status: "ok",
            text: "the document",
            url: "https://other.test/doc",
        });
    });

    it("turns a POST answered with 302 into a bodiless GET, and keeps a POST across a 307", async () => {
        const {fetch, asked} = routed({
            "https://a.test/": redirect("https://b.test/", 302),
            "https://b.test/": () => new Response("b"),
            "https://c.test/": redirect("https://d.test/", 307),
            "https://d.test/": () => new Response("d"),
        });
        await guardedFetchText(
            fetch,
            "https://a.test/",
            {method: "POST", body: "{}"},
            {timeoutMs: 1_000},
        );
        await guardedFetchText(
            fetch,
            "https://c.test/",
            {method: "POST", body: "{}"},
            {timeoutMs: 1_000},
        );
        expect(asked).toEqual([
            "POST https://a.test/ redirect=manual",
            "GET https://b.test/ redirect=manual",
            "POST https://c.test/ redirect=manual",
            "POST https://d.test/ redirect=manual",
        ]);
    });

    it("gives up after the hop limit", async () => {
        const {fetch} = routed({
            "https://loop.test/a": redirect("https://loop.test/b"),
            "https://loop.test/b": redirect("https://loop.test/a"),
        });
        const answer = await guardedFetchText(
            fetch,
            "https://loop.test/a",
            {},
            {timeoutMs: 1_000, maxHops: 3},
        );
        expect(answer.status).toBe("refused");
        if (answer.status !== "refused") return;
        expect(answer.reason).toContain("more than 3 redirects");
    });

    it("refuses a name that resolves to a private address, when given a resolver", async () => {
        const {fetch, asked} = routed({"https://rebind.test/": () => new Response("secret")});
        const answer = await guardedFetchText(
            fetch,
            "https://rebind.test/",
            {},
            {timeoutMs: 1_000, resolveHost: async () => ["10.0.0.7"]},
        );
        expect(answer.status).toBe("refused");
        expect(asked).toHaveLength(0);
    });

    it("lets a rig probe its own private endpoint when asked to", async () => {
        const {fetch} = routed({"http://127.0.0.1:3002/": () => new Response("rig")});
        const answer = await guardedFetchText(
            fetch,
            "http://127.0.0.1:3002/",
            {},
            {timeoutMs: 1_000, allowPrivate: true},
        );
        expect(answer.status).toBe("ok");
    });
});

describe("probeEndpoint — redirects and private targets", () => {
    it("reports a redirect to a private address as refused, with no body excerpt", async () => {
        const {fetch, asked} = routed({
            "https://public.test/": redirect("http://127.0.0.1:8080/admin"),
        });
        const outcome = await probeEndpoint(endpoint("https://public.test/"), {fetch});
        expect(outcome.status).toBe("inconclusive");
        if (outcome.status !== "inconclusive") return;
        expect(outcome.code).toBe("refused");
        expect(outcome.observed).toBe("");
        expect(asked).toHaveLength(1);
    });

    it("refuses a private target outright, unless the caller allows it", async () => {
        const {fetch, asked} = routed({"http://127.0.0.1:3002/": () => new Response("rig")});
        const refused = await probeEndpoint(endpoint("http://127.0.0.1:3002/"), {fetch});
        expect(refused).toMatchObject({status: "inconclusive", code: "refused"});
        expect(asked).toHaveLength(0);

        const allowed = await probeEndpoint(endpoint("http://127.0.0.1:3002/"), {
            fetch,
            allowPrivate: true,
        });
        expect(allowed).toMatchObject({status: "confirmed", code: "live"});
    });
});
