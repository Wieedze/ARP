import {describe, expect, it} from "vitest";

import {fetchableDocumentUrl, nextDocumentHop, privateProbeTarget} from "../src/verify/probe.js";

describe("privateProbeTarget", () => {
    it.each([
        ["loopback", "http://127.0.0.1:3002/"],
        ["loopback, other octet", "http://127.1.2.3/"],
        ["localhost", "http://localhost:8080/admin"],
        ["a localhost subdomain", "https://api.localhost/"],
        ["cloud metadata", "http://169.254.169.254/latest/meta-data/"],
        ["a private 10 net", "http://10.0.0.5/"],
        ["a private 192.168 net", "http://192.168.1.1/"],
        ["the bottom of 172.16/12", "http://172.16.0.1/"],
        ["the top of 172.16/12", "http://172.31.255.254/"],
        ["IPv6 loopback", "http://[::1]:3002/"],
        ["IPv6 unique local", "http://[fd00::1]/"],
        ["a cloud internal name", "http://metadata.google.internal/"],
        ["an mDNS name", "http://printer.local/"],
        ["the zero net", "http://0.0.0.0:3002/"],
        // An IPv4-mapped IPv6 address carries an IPv4 one and reaches loopback. It passed every
        // check until 2026-10-29 because none of them was looking at an IPv6 form.
        ["IPv4-mapped loopback", "http://[::ffff:127.0.0.1]/"],
        ["IPv4-mapped private", "http://[::ffff:169.254.169.254]/"],
        // `URL` normalises these to a dotted quad before the guard sees them, so they are covered
        // and the "easy case only" caveat undersells it. Asserted so a refactor cannot lose it.
        ["decimal loopback", "http://2130706433/"],
        ["short loopback", "http://127.1/"],
        ["octal loopback", "http://0177.0.0.1/"],
    ])("refuses %s", (_case, url) => {
        expect(privateProbeTarget(url)).not.toBeNull();
    });

    it.each([
        ["a public host", "https://api.deep3.ai/.well-known/agent.json"],
        ["a public address", "https://8.8.8.8/"],
        // The boundary that a naive `^172\.` would get wrong, and it would refuse real hosts:
        // 172.15 and 172.32 are public, only 172.16 through 172.31 are not.
        ["172.15, just below the block", "http://172.15.0.1/"],
        ["172.32, just above it", "http://172.32.0.1/"],
        // A perfectly good public hostname that starts with "10.". A prefix test on the string
        // refuses it, which is how this case got written: the first version of the guard did.
        ["a host merely containing a private string", "https://10.example.com/"],
        ["a host that is not an IPv4 literal at all", "https://127.0.0.1.example.com/"],
        ["a port on a public host", "https://example.com:8443/mcp"],
        ["an IPv4-mapped PUBLIC address", "http://[::ffff:8.8.8.8]/"],
    ])("allows %s", (_case, url) => {
        expect(privateProbeTarget(url)).toBeNull();
    });

    it("says nothing about a URL it cannot parse", () => {
        // Not parseable is not private. The caller's own `^https?://` check is what refuses it,
        // and answering "private" here would report the wrong reason.
        expect(privateProbeTarget("not a url")).toBeNull();
    });

    it("names the host it refused, so the message can say which", () => {
        expect(privateProbeTarget("http://169.254.169.254/x")).toBe("169.254.169.254");
    });
});

describe("fetchableDocumentUrl", () => {
    it.each([
        ["a local file", "file:///etc/passwd"],
        ["a local file with no host", "file://./secret"],
        ["ftp", "ftp://example.com/x"],
        ["a jar url", "jar:file:///tmp/a.jar!/b"],
        ["a bare path", "/etc/passwd"],
        ["a relative path", "../../etc/passwd"],
        ["a windows path", "C:\\Windows\\win.ini"],
        ["javascript", "javascript:alert(1)"],
        ["nothing", ""],
    ])("refuses %s", (_case, published) => {
        // The live defect: `arp_agent_endpoints` passed a `tokenURI`'s `registrationFile` straight
        // to `fetch`, and Bun's `fetch` reads `file:` — 200 and the file's contents, measured.
        // `privateProbeTarget` delegates this check to its caller and one caller did not do it.
        const answer = fetchableDocumentUrl(published);
        expect(answer.status).toBe("refuse");
    });

    it.each([
        ["loopback", "http://127.0.0.1:8080/agent.json"],
        ["cloud metadata", "http://169.254.169.254/latest/meta-data/"],
        ["IPv4-mapped loopback", "http://[::ffff:127.0.0.1]/agent.json"],
    ])("refuses %s, which is the other half of the guard", (_case, published) => {
        expect(fetchableDocumentUrl(published).status).toBe("refuse");
    });

    it("fetches a public http(s) document unchanged", () => {
        const answer = fetchableDocumentUrl("https://api.deep3.ai/.well-known/agent.json");
        expect(answer).toEqual({
            status: "fetch",
            url: "https://api.deep3.ai/.well-known/agent.json",
        });
    });

    it("rewrites an ipfs document onto the gateway", () => {
        expect(fetchableDocumentUrl("ipfs://bafkreistub")).toEqual({
            status: "fetch",
            url: "https://ipfs.io/ipfs/bafkreistub",
        });
    });

    it("checks the scheme on what was published, not on what it built", () => {
        // The gateway URL is always https, so checking after the rewrite would pass anything that
        // reached the rewrite. The order is the guard.
        expect(fetchableDocumentUrl("ipfs://../../etc/passwd").status).toBe("fetch");
        expect(fetchableDocumentUrl("file:///etc/passwd").status).toBe("refuse");
    });

    it("lets a rig reach its own private endpoint when it says so", () => {
        expect(
            fetchableDocumentUrl("http://127.0.0.1:3002/agent.json", {allowPrivate: true}),
        ).toEqual({status: "fetch", url: "http://127.0.0.1:3002/agent.json"});
    });

    it("still refuses a bad scheme even with allowPrivate", () => {
        // `ARP_ALLOW_PRIVATE_PROBE` is about addresses. It is not a licence to read the disk.
        expect(fetchableDocumentUrl("file:///etc/passwd", {allowPrivate: true}).status).toBe(
            "refuse",
        );
    });
});

describe("nextDocumentHop", () => {
    const FROM = "https://attacker.example/card.json";

    it("refuses a redirect to a private address", () => {
        // Measured 2026-10-29: a caller-controlled PUBLIC host answering
        // `302 Location: http://169.254.169.254/latest/meta-data/` returned the private body,
        // because `fetch` follows redirects and the guard had already said yes to hop one. No DNS
        // control needed, so the "resolves to a private address" caveat does not cover it.
        const answer = nextDocumentHop(FROM, "http://169.254.169.254/latest/meta-data/");
        expect(answer.status).toBe("refuse");
        expect(answer.status === "refuse" && answer.reason).toContain("169.254.169.254");
    });

    it("refuses a redirect to a scheme it would not have fetched", () => {
        expect(nextDocumentHop(FROM, "file:///etc/passwd").status).toBe("refuse");
    });

    it("follows a redirect to another public document", () => {
        expect(nextDocumentHop(FROM, "https://elsewhere.example/agent.json")).toEqual({
            status: "fetch",
            url: "https://elsewhere.example/agent.json",
        });
    });

    it("resolves a relative Location against the hop it came from", () => {
        // A relative Location cannot move the host, so it is always safe — but it has to be
        // resolved or the next check runs on a string that is not a URL.
        expect(nextDocumentHop(FROM, "/.well-known/agent.json")).toEqual({
            status: "fetch",
            url: "https://attacker.example/.well-known/agent.json",
        });
    });

    it("refuses a Location that is not a URL at all", () => {
        expect(nextDocumentHop(FROM, "http://[not a host]/").status).toBe("refuse");
    });

    it("names the hop in the reason, because the caller sees only the first url", () => {
        const answer = nextDocumentHop(FROM, "http://127.0.0.1:8080/admin");
        expect(answer.status === "refuse" && answer.reason).toContain("127.0.0.1:8080/admin");
    });

    it("lets a rig redirect to its own private endpoint when it says so", () => {
        expect(
            nextDocumentHop(FROM, "http://127.0.0.1:3002/agent.json", {allowPrivate: true}).status,
        ).toBe("fetch");
    });
});
