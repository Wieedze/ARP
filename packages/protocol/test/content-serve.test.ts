import {keccak256, stringToBytes, type Hex} from "viem";
import {privateKeyToAccount} from "viem/accounts";
import {describe, expect, it} from "vitest";

import {contentIndexOf, serveContent, type ContentServeConfig} from "../src/content-serve.js";
import {corroborationOf, receiptMatchesContent, verifyContentReceipt} from "../src/receipt.js";
import type {RepositoryFile} from "../src/content-path.js";

const NODE = privateKeyToAccount(`0x${"33".repeat(32)}`);
const AGENT = privateKeyToAccount(`0x${"44".repeat(32)}`);
const TESTNET = 13579;

const SKILL_ATOM = `0x${"ab".repeat(32)}` as const;
const DUPLICATE_ATOM = `0x${"cd".repeat(32)}` as const;
const CONFLICT_ATOM = `0x${"ef".repeat(32)}` as const;
const GONE_ATOM = `0x${"12".repeat(32)}` as const;
const SERVER_ATOM = `0x${"34".repeat(32)}` as const;

/** Real URLs and real layouts, from `data/measurements/skill-layouts-2026-10-29T2200.json`. */
const INDEX = contentIndexOf([
    {atom: SKILL_ATOM, url: "https://github.com/magentosh/superpowers?skill=product-photography"},
    {atom: DUPLICATE_ATOM, url: "https://github.com/heygen-com/hyperframes?skill=motion-doctrine"},
    {atom: CONFLICT_ATOM, url: "https://github.com/juliusbrussee/caveman?skill=caveman-stats"},
    {atom: GONE_ATOM, url: "https://github.com/mattpocock/skills?skill=to-prd"},
    {atom: SERVER_ATOM, url: "https://github.com/stripe/agent-toolkit"},
]);

const LISTINGS: Record<string, RepositoryFile[]> = {
    "magentosh/superpowers": [
        {path: "guides/photo/product-photography/SKILL.md", sha: "sha-pp"},
        {path: "guides/design/type-pairing/SKILL.md", sha: "sha-tp"},
    ],
    "heygen-com/hyperframes": [
        {path: ".agents/skills/motion-doctrine/SKILL.md", sha: "sha-md"},
        {path: ".claude/skills/motion-doctrine/SKILL.md", sha: "sha-md"},
    ],
    "juliusbrussee/caveman": [
        {path: "plugins/caveman/skills/caveman-stats/SKILL.md", sha: "sha-plugin"},
        {path: "skills/caveman-stats/SKILL.md", sha: "sha-top"},
    ],
    "mattpocock/skills": [{path: "skills/engineering/pr/SKILL.md", sha: "sha-pr"}],
};

const CONTENT = stringToBytes("# Product photography\n\nPut the bottle on the left.\n");
const NONCE = keccak256(stringToBytes("caller-nonce"));

function config(over: Partial<ContentServeConfig> = {}): ContentServeConfig {
    return {
        chainId: TESTNET,
        index: INDEX,
        listing: async (repo) => LISTINGS[repo] ?? [],
        raw: async () => ({code: 200, bytes: CONTENT}),
        signer: {address: NODE.address, signTypedData: (data) => NODE.signTypedData(data)},
        to: AGENT.address,
        nonce: NONCE,
        now: () => 1_793_462_400,
        ...over,
    };
}

describe("contentIndexOf", () => {
    it("skips an entry with no recorded atom id rather than computing one", () => {
        // `calculateAtomId` is a MultiVault read. A module that resolves identities must not depend
        // on a chain being reachable, so an untagged skill is simply absent from the index.
        const index = contentIndexOf([
            {atom: SKILL_ATOM, url: "https://github.com/a/b?skill=c"},
            {atom: null as unknown as Hex, url: "https://github.com/d/e?skill=f"},
        ]);
        expect([...index.keys()]).toEqual([SKILL_ATOM]);
    });

    it("keys on the lowercased id, so a checksummed request still resolves", () => {
        const index = contentIndexOf([
            {atom: `0x${"AB".repeat(32)}` as Hex, url: "https://github.com/a/b?skill=c"},
        ]);
        expect(index.get(SKILL_ATOM)).toBe("https://github.com/a/b?skill=c");
    });
});

describe("serveContent", () => {
    it("serves the bytes with a receipt a stranger can check", async () => {
        const answer = await serveContent(SKILL_ATOM, config());
        expect(answer.status).toBe("served");
        if (answer.status !== "served") return;

        expect(answer.path).toBe("guides/photo/product-photography/SKILL.md");
        expect(answer.bytes).toBe(CONTENT);

        // Both halves of the verification, which is what makes the receipt worth signing.
        expect(answer.receipt).not.toBeNull();
        const verdict = await verifyContentReceipt(answer.receipt!);
        expect(verdict).toEqual({status: "valid", signer: NODE.address, namesNobody: false});
        expect(receiptMatchesContent(answer.receipt!.receipt, CONTENT)).toBe(true);

        // And what it is worth to a reader. **Not `second-party` by default**: this node generated
        // its own key, so its address differs from the agent's while the same hand could hold
        // both, and nothing in the receipt tells that apart. The reader says which signers it
        // accepts, and only then is it two parties (ADR `0080` constraint 4).
        expect(corroborationOf(answer.receipt!.receipt, NODE.address, AGENT.address)).toEqual({
            status: "unknown-signer",
            signer: NODE.address,
        });
        expect(
            corroborationOf(answer.receipt!.receipt, NODE.address, AGENT.address, [NODE.address]),
        ).toEqual({status: "second-party", signer: NODE.address});
    });

    it("names the path it served, not just the repository", async () => {
        // 46 of 662 catalogued skills exist at several byte-identical paths. Without the path a
        // verifier cannot find the bytes the digest is over.
        const answer = await serveContent(DUPLICATE_ATOM, config());
        expect(answer.status === "served" && answer.receipt?.receipt.path).toBe(
            ".agents/skills/motion-doctrine/SKILL.md",
        );
        expect(answer.status === "served" && answer.alsoAt).toEqual([
            ".claude/skills/motion-doctrine/SKILL.md",
        ]);
    });

    it("refuses two paths whose contents differ", async () => {
        // Serving either would be a claim about which one the agent read, carried under a
        // signature. 2 of 662 are in this state.
        const answer = await serveContent(CONFLICT_ATOM, config());
        expect(answer).toEqual({
            status: "ambiguous",
            ref: {repo: "juliusbrussee/caveman", skill: "caveman-stats"},
            paths: [
                "plugins/caveman/skills/caveman-stats/SKILL.md",
                "skills/caveman-stats/SKILL.md",
            ],
        });
    });

    it("says absent for a skill the repository no longer carries", async () => {
        // 139 of 662. It is a per-skill liveness signal and not a failure of the endpoint.
        const answer = await serveContent(GONE_ATOM, config());
        expect(answer).toEqual({
            status: "absent",
            ref: {repo: "mattpocock/skills", skill: "to-prd"},
        });
    });

    it("says a catalogued tool has no file rather than reaching for one", async () => {
        const answer = await serveContent(SERVER_ATOM, config());
        expect(answer).toEqual({
            status: "not-a-file",
            url: "https://github.com/stripe/agent-toolkit",
        });
    });

    it.each([
        ["too short", "0xab"],
        ["not hex", `0x${"zz".repeat(32)}`],
        ["no prefix", "ab".repeat(32)],
        ["empty", ""],
    ])("refuses an atom id that is %s before looking anything up", async (_case, atomId) => {
        let asked = 0;
        const answer = await serveContent(
            atomId,
            config({
                listing: async (repo) => {
                    asked += 1;
                    return LISTINGS[repo] ?? [];
                },
            }),
        );
        expect(answer).toEqual({status: "bad-atom-id"});
        expect(asked, "nothing should be looked up for a malformed id").toBe(0);
    });

    it("says unknown for an id the catalogue does not carry", async () => {
        const answer = await serveContent(`0x${"99".repeat(32)}`, config());
        expect(answer).toEqual({status: "unknown-atom"});
    });

    it("never lets the request choose where the fetch goes", async () => {
        // The SSRF shape for a proxy like this one. The outbound URL is built from the catalogue's
        // own URL and the repository's own listing; no part of the request reaches it.
        const seen: string[] = [];
        await serveContent(
            SKILL_ATOM,
            config({
                raw: async (url) => {
                    seen.push(url);
                    return {code: 200, bytes: CONTENT};
                },
            }),
        );
        expect(seen).toEqual([
            "https://raw.githubusercontent.com/magentosh/superpowers/HEAD/guides/photo/product-photography/SKILL.md",
        ]);
    });

    it("refuses a listing path that escapes the repository", async () => {
        // The listing is GitHub's, so this is defence in depth and not a reachable input today.
        const answer = await serveContent(
            SKILL_ATOM,
            config({
                listing: async () => [
                    {path: "../../etc/product-photography/SKILL.md", sha: "sha-x"},
                ],
            }),
        );
        expect(answer.status).toBe("unsafe-path");
    });

    it("reports the origin's own status rather than its own", async () => {
        const answer = await serveContent(
            SKILL_ATOM,
            config({raw: async () => ({code: 404, bytes: new Uint8Array()})}),
        );
        expect(answer.status === "upstream" && answer.code).toBe(404);
    });

    it("refuses a file over the cap, so one request cannot exhaust the host", async () => {
        const answer = await serveContent(
            SKILL_ATOM,
            config({cap: 8, raw: async () => ({code: 200, bytes: CONTENT})}),
        );
        expect(answer.status === "too-large" && answer.cap).toBe(8);
    });

    it("serves an unauthenticated fetch, with a receipt that corroborates nobody", async () => {
        // `docs/tasks/31` §5.3: the index stays open to anyone and the receipt is what has a price.
        const answer = await serveContent(SKILL_ATOM, config({to: null}));
        expect(answer.status).toBe("served");
        if (answer.status !== "served") return;
        const verdict = await verifyContentReceipt(answer.receipt!);
        expect(verdict.status === "valid" && verdict.namesNobody).toBe(true);
    });

    it("serves the bytes when there is no signer at all", async () => {
        // A node with no key is a useful node: the content path still works and the declaration
        // falls back to being worth what it was worth before.
        const answer = await serveContent(SKILL_ATOM, config({signer: null}));
        expect(answer.status === "served" && answer.receipt).toBeNull();
        expect(answer.status === "served" && answer.bytes).toBe(CONTENT);
    });

    it("signs for the bytes it served, not for the bytes it expected", async () => {
        // The digest comes from the response. If it were computed from anything else, a receipt
        // would attest content nobody received and `receiptMatchesContent` would be a tautology.
        const other = stringToBytes("# Something else entirely\n");
        const answer = await serveContent(
            SKILL_ATOM,
            config({raw: async () => ({code: 200, bytes: other})}),
        );
        expect(answer.status).toBe("served");
        if (answer.status !== "served") return;
        expect(receiptMatchesContent(answer.receipt!.receipt, other)).toBe(true);
        expect(receiptMatchesContent(answer.receipt!.receipt, CONTENT)).toBe(false);
    });

    it("makes two identical requests produce one receipt", async () => {
        // The caller supplies the nonce, so a replay is the same record rather than a second one.
        const first = await serveContent(SKILL_ATOM, config());
        const second = await serveContent(SKILL_ATOM, config());
        expect(first.status === "served" && first.receipt?.signature).toBe(
            second.status === "served" ? second.receipt?.signature : undefined,
        );
    });

    it("asks for a listing once per request and caches nothing itself", async () => {
        let calls = 0;
        const own = config({
            listing: async (repo) => {
                calls += 1;
                return LISTINGS[repo] ?? [];
            },
        });
        await serveContent(SKILL_ATOM, own);
        await serveContent(SKILL_ATOM, own);
        // Two requests, two listings: the cache is the caller's, so a test can see what was asked.
        expect(calls).toBe(2);
    });
});
