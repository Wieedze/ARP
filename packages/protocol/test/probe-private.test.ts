import {describe, expect, it} from "vitest";

import {privateProbeTarget} from "../src/verify/probe.js";

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
