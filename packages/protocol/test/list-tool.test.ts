import {describe, expect, it} from "vitest";
import {keccak256, stringToBytes, type Address, type Hex} from "viem";
import {privateKeyToAccount} from "viem/accounts";

import type {MultiVaultReads} from "../src/declare/multivault.js";
import {
    checkListToolLimits,
    type SponsorLimits,
    type SponsorRecord,
} from "../src/sponsor/limits.js";
import {
    canonicalToolUrl,
    chooseRepoSpelling,
    planToolListing,
    signListToolRequest,
    SOURCE_PREDICATE,
    verifyListToolRequest,
} from "../src/sponsor/list-tool.js";

const MILLI = 10n ** 15n;
const MULTIVAULT: Address = "0x2Ece8D4dEdcB9918A398528f3fa4688b1d2CAB91";

function reads(existing: Set<string> = new Set()): MultiVaultReads {
    return {
        address: MULTIVAULT,
        chainId: 13579,
        atomId: async (data: Hex) => keccak256(data),
        tripleId: async (s: Hex, p: Hex, o: Hex) =>
            keccak256(`0x${s.slice(2)}${p.slice(2)}${o.slice(2)}`),
        termExists: async (id: Hex) => existing.has(id.toLowerCase()),
        atomCost: async () => MILLI,
        tripleCost: async () => MILLI,
        minDeposit: async () => MILLI,
    } as unknown as MultiVaultReads; // Only the members `planToolListing` reads.
}

describe("planToolListing", () => {
    it("plans one atom for a tool URL, born at cost + minDeposit", async () => {
        const plan = await planToolListing({url: "https://example.com/mcp", reads: reads()});
        expect(plan.repository).toBeNull();
        expect(plan.calls.map((c) => c.kind)).toEqual(["create-atom"]);
        expect(plan.totalValue).toBe(2n * MILLI);
        expect(plan.toPin.map((t) => t.url)).toEqual(["https://example.com/mcp"]);
    });

    it("plans a skill, its repository and (skill, source, repository)", async () => {
        const plan = await planToolListing({url: "github.com/a/b?skill=c", reads: reads()});
        expect(plan.repository?.url).toBe("https://github.com/a/b");
        expect(plan.calls.map((c) => c.kind)).toEqual(["create-atom", "create-triple"]);
        expect(plan.calls[1]?.data).toContain(SOURCE_PREDICATE.slice(2));
        expect(plan.totalValue).toBe(6n * MILLI);
    });

    it("plans only what is missing, and nothing when everything exists", async () => {
        const first = await planToolListing({url: "github.com/a/b?skill=c", reads: reads()});
        const repoOn = new Set([first.repository!.atomId.toLowerCase()]);
        const partial = await planToolListing({
            url: "github.com/a/b?skill=c",
            reads: reads(repoOn),
        });
        expect(partial.toPin.map((t) => t.url)).toEqual(["https://github.com/a/b?skill=c"]);
        const all = new Set(
            [first.atomId, first.repository!.atomId, first.repository!.sourceTripleId].map((id) =>
                id.toLowerCase(),
            ),
        );
        const none = await planToolListing({url: "github.com/a/b?skill=c", reads: reads(all)});
        expect(none.calls).toHaveLength(0);
    });

    it("throws on a string that is not a tool URL", async () => {
        await expect(planToolListing({url: "not a url", reads: reads()})).rejects.toThrow(
            /not a tool URL/,
        );
    });
});

describe("canonicalToolUrl", () => {
    it("rebuilds a GitHub URL as the seed scripts do, with GitHub's own case when given", () => {
        expect(canonicalToolUrl("github.com/a/b/tree/main?skill=c&x=1")).toBe(
            "https://github.com/a/b?skill=c",
        );
        expect(canonicalToolUrl("https://github.com/a/b.git")).toBe("https://github.com/a/b");
        expect(canonicalToolUrl("https://github.com/wieedze/arp?skill=arp", "Wieedze/ARP")).toBe(
            "https://github.com/Wieedze/ARP?skill=arp",
        );
        expect(canonicalToolUrl("https://Example.com/mcp")).toBe("https://example.com/mcp");
    });
});

describe("chooseRepoSpelling", () => {
    it("prefers the spelling on the graph, then GitHub's, then the one asked", () => {
        expect(
            chooseRepoSpelling({
                asked: "Leonxlnx/taste-skill",
                fullName: "Leonxlnx/taste-skill",
                existing: ["leonxlnx/taste-skill"],
            }),
        ).toBe("leonxlnx/taste-skill");
        expect(chooseRepoSpelling({asked: "a/b", fullName: "A/B", existing: ["a/b", "A/B"]})).toBe(
            "a/b",
        );
        expect(chooseRepoSpelling({asked: "x/y", fullName: "A/B", existing: ["a/b", "A/B"]})).toBe(
            "A/B",
        );
        expect(
            chooseRepoSpelling({asked: "wieedze/arp", fullName: "Wieedze/ARP", existing: []}),
        ).toBe("Wieedze/ARP");
        expect(chooseRepoSpelling({asked: "a/b", existing: []})).toBe("a/b");
    });
});

describe("checkListToolLimits", () => {
    const limits = {
        listingsPerAddressPerDay: 1,
        anonymousListingsPerDay: 2,
        categoriesPerDay: 2,
        listingsPerDay: 3,
        dailyBudget: 10n ** 18n,
    } as SponsorLimits; // Only the three members this check reads.
    const at = 20_000 * 86_400_000;
    const record = (subject: Address, key: string): SponsorRecord => ({
        kind: "list-tool",
        subject,
        value: MILLI,
        at,
        key,
    });
    const ZERO: Address = "0x0000000000000000000000000000000000000000";
    const ME: Address = "0x00000000000000000000000000000000000000aa";

    it("counts unsigned listings together, and a signed address on its own", () => {
        const anon = [record(ZERO, "a#0"), record(ZERO, "b#0"), record(ZERO, "b#1")];
        const base = {value: MILLI, now: at, limits};
        expect(checkListToolLimits(anon, {...base, lister: null, listing: "c"}).ok).toBe(false);
        expect(checkListToolLimits(anon, {...base, lister: null, listing: "b"}).ok).toBe(true);
        expect(checkListToolLimits(anon, {...base, lister: ME, listing: "c"}).ok).toBe(true);
        expect(
            checkListToolLimits([record(ME, "d#0")], {...base, lister: ME, listing: "c"}).ok,
        ).toBe(false);
        expect(
            checkListToolLimits([], {...base, lister: ME, listing: "c", value: 2n * 10n ** 18n}).ok,
        ).toBe(false);
    });
});

describe("the list-tool request", () => {
    const account = privateKeyToAccount(`0x${"11".repeat(32)}`);
    const now = 1_800_000_000;
    const request = (over = {}) => ({
        address: account.address,
        url: "https://example.com/mcp",
        nonce: keccak256(stringToBytes("n")),
        expiresAt: now + 600,
        ...over,
    });
    const signer = {
        signTypedData: (data: Parameters<typeof account.signTypedData>[0]) =>
            account.signTypedData(data),
    };

    it("verifies its signer, and refuses an expired or far-off request", async () => {
        const signed = await signListToolRequest(request(), 13579, signer);
        expect(await verifyListToolRequest(signed, now)).toEqual({
            status: "valid",
            address: account.address,
        });
        expect((await verifyListToolRequest(signed, now + 601)).status).toBe("expired");
        const far = await signListToolRequest(request({expiresAt: now + 7_200}), 13579, signer);
        expect((await verifyListToolRequest(far, now)).status).toBe("malformed");
    });

    it("refuses a request whose url was changed after signing", async () => {
        const signed = await signListToolRequest(request(), 13579, signer);
        const tampered = {
            ...signed,
            request: {...signed.request, url: "https://example.com/other"},
        };
        expect((await verifyListToolRequest(tampered, now)).status).toBe("mismatch");
    });
});
