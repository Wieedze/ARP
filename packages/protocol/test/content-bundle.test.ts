import {keccak256, sha256, stringToBytes} from "viem";
import {privateKeyToAccount} from "viem/accounts";
import {describe, expect, it} from "vitest";

import {
    bundleManifest,
    bundleMatchesReceipt,
    isSafeRelativePath,
    serveSkillBundle,
    type BundleServeConfig,
} from "../src/content-bundle.js";
import {contentIndexOf} from "../src/content-serve.js";
import type {RepositoryFile} from "../src/content-path.js";
import {verifyContentReceipt} from "../src/receipt.js";

const NODE = privateKeyToAccount(`0x${"33".repeat(32)}`);
const AGENT = privateKeyToAccount(`0x${"44".repeat(32)}`);
const PPTX = `0x${"ab".repeat(32)}` as const;

const INDEX = contentIndexOf([
    {atom: PPTX, url: "https://github.com/anthropics/skills?skill=pptx"},
]);

/** The shape of Anthropic's `pptx`: SKILL.md, scripts beside it, and a neighbour that is not its. */
const LISTINGS: Record<string, RepositoryFile[]> = {
    "anthropics/skills": [
        {path: "skills/pptx/SKILL.md", sha: "a"},
        {path: "skills/pptx/scripts/thumbnail.py", sha: "b"},
        {path: "skills/pptx/scripts/office/validate.py", sha: "c"},
        {path: "skills/pdf/SKILL.md", sha: "d"},
    ],
};

const BODY: Record<string, string> = {
    "skills/pptx/SKILL.md": "# pptx\nRun scripts/thumbnail.py.\n",
    "skills/pptx/scripts/thumbnail.py": "print('thumb')\n",
    "skills/pptx/scripts/office/validate.py": "print('ok')\n",
};

const PIN = "fedcba9876543210fedcba9876543210fedcba98";

function config(over: Partial<BundleServeConfig> = {}): BundleServeConfig {
    return {
        chainId: 13579,
        index: INDEX,
        pin: () => PIN,
        listing: async (repo) => LISTINGS[repo] ?? [],
        raw: async (url) => {
            // Only the pinned commit answers: a fetch at HEAD would be a 404 here.
            const path = decodeURIComponent(url.split(`/${PIN}/`)[1] ?? "");
            const body = BODY[path];
            return body === undefined ? {code: 404, bytes: new Uint8Array()} : {code: 200, bytes: stringToBytes(body)};
        },
        signer: {address: NODE.address, signTypedData: (data) => NODE.signTypedData(data)},
        to: AGENT.address,
        nonce: keccak256(stringToBytes("n")),
        now: () => 1_793_462_400,
        ...over,
    };
}

describe("serveSkillBundle", () => {
    it("serves every file of the skill's directory and none of its neighbours, under one receipt", async () => {
        const answer = await serveSkillBundle(PPTX, config());
        if (answer.status !== "served" || answer.receipt === null) throw new Error(answer.status);
        expect(answer.path).toBe("skills/pptx");
        expect(answer.files.map((file) => file.path).sort()).toEqual([
            "SKILL.md",
            "scripts/office/validate.py",
            "scripts/thumbnail.py",
        ]);
        expect((await verifyContentReceipt(answer.receipt)).status).toBe("valid");
        expect(answer.receipt.receipt.path).toBe("skills/pptx");
        expect(bundleMatchesReceipt(answer.receipt.receipt, answer.files)).toBe(true);
    });

    it("lets a verifier see a changed, missing or added file", async () => {
        const answer = await serveSkillBundle(PPTX, config());
        if (answer.status !== "served" || answer.receipt === null) throw new Error(answer.status);
        const [first, ...rest] = answer.files;
        if (first === undefined) throw new Error("no file");
        const receipt = answer.receipt.receipt;
        expect(bundleMatchesReceipt(receipt, [{...first, bytes: stringToBytes("tampered")}, ...rest])).toBe(false);
        expect(bundleMatchesReceipt(receipt, rest)).toBe(false);
        expect(bundleMatchesReceipt(receipt, [...answer.files, {path: "extra.py", bytes: stringToBytes("x")}])).toBe(false);
        expect(bundleMatchesReceipt(receipt, [...rest, {...first, path: "../SKILL.md"}])).toBe(false);
    });

    it("refuses over the file count and over the total size", async () => {
        expect((await serveSkillBundle(PPTX, config({maxFiles: 2}))).status).toBe("too-many-files");
        expect((await serveSkillBundle(PPTX, config({maxTotal: 40}))).status).toBe("too-large");
    });
});

describe("what a receipt cannot be stretched to cover", () => {
    it("refuses a path with a newline, which could make two sets of files share one manifest", () => {
        const x = stringToBytes("X");
        const e = stringToBytes("E");
        const twoFiles = [
            {path: "a", bytes: x},
            {path: "b", bytes: e},
        ];
        const forged = [{path: `a\n${bundleManifest([{path: "b", bytes: e}]).split("  ")[0]}  b`, bytes: x}];
        const receipt = {
            atom: PPTX,
            url: "u",
            path: "d",
            digest: sha256(stringToBytes(bundleManifest(twoFiles))),
            to: null,
            servedAt: 0,
            nonce: PPTX,
        };
        expect(bundleMatchesReceipt(receipt, twoFiles)).toBe(true);
        expect(bundleMatchesReceipt(receipt, forged)).toBe(false);
    });

    it("refuses two paths that are one file on a case-insensitive disk", () => {
        const files = [
            {path: "SKILL.md", bytes: stringToBytes("a")},
            {path: "skill.md", bytes: stringToBytes("b")},
        ];
        const receipt = {atom: PPTX, url: "u", path: "d", digest: sha256(stringToBytes(bundleManifest(files))), to: null, servedAt: 0, nonce: PPTX};
        expect(bundleMatchesReceipt(receipt, files)).toBe(false);
    });

    it("refuses a single file over the per-file cap", async () => {
        expect((await serveSkillBundle(PPTX, config({cap: 10}))).status).toBe("too-large");
    });
});

describe("the manifest", () => {
    it("is sha256sum's format, sorted by path", () => {
        const manifest = bundleManifest([
            {path: "b.txt", bytes: stringToBytes("b")},
            {path: "a.txt", bytes: stringToBytes("a")},
        ]);
        expect(manifest.split("\n")[0]).toMatch(/^[0-9a-f]{64} {2}a\.txt$/);
        expect(manifest.endsWith("b.txt\n")).toBe(true);
    });

    it("accepts only paths that stay inside the directory", () => {
        expect(isSafeRelativePath("scripts/a.py")).toBe(true);
        for (const bad of ["", "/etc/passwd", "../x", "a/../../x", "a\\b", "a//b", "./a", "a\nb", "a\rb", "a\u0000b"]) {
            expect(isSafeRelativePath(bad)).toBe(false);
        }
    });
});
