import {describe, expect, it} from "vitest";

import {
    directoryOf,
    rawContentUrl,
    resolveContentPath,
    skillFilesIn,
    skillRefFromUrl,
    type RepositoryFile,
} from "../src/content-path.js";

const file = (path: string, sha = path): RepositoryFile => ({path, sha});

/**
 * Every listing below is a real repository's, from
 * `measurements/skill-layouts-2026-10-29T2200.json`. Invented ones would agree with whatever the
 * resolver does.
 */
const MAGENTOSH = [
    file("README.md"),
    file("guides/photo/product-photography/SKILL.md"),
    file("guides/photo/product-photography/reference/lighting.md"),
    file("guides/design/type-pairing/SKILL.md"),
];

/** `.agents/` beside `.claude/`, byte-identical. 46 of 662 look like this. */
const HEYGEN = [
    file(".agents/skills/motion-doctrine/SKILL.md", "sha-motion"),
    file(".claude/skills/motion-doctrine/SKILL.md", "sha-motion"),
    file("registry/blocks/canopy-part-title/SKILL.md", "sha-canopy"),
];

/** Two paths whose contents differ. 2 of 662, and the case that must refuse. */
const CAVEMAN = [
    file("plugins/caveman/skills/caveman-stats/SKILL.md", "sha-plugin"),
    file("skills/caveman-stats/SKILL.md", "sha-top"),
    file("plugins/caveman/skills/cavecrew/SKILL.md", "sha-crew"),
    file("plugins/caveman/skills/megacave/SKILL.md", "sha-mega"),
];

describe("skillRefFromUrl", () => {
    it("splits a tool URL into the repository and the skill", () => {
        expect(
            skillRefFromUrl("https://github.com/magentosh/superpowers?skill=product-photography"),
        ).toEqual({repo: "magentosh/superpowers", skill: "product-photography"});
    });

    it("accepts the host-only form the catalogue stores", () => {
        expect(skillRefFromUrl("github.com/obra/superpowers?skill=brainstorming")).toEqual({
            repo: "obra/superpowers",
            skill: "brainstorming",
        });
    });

    it.each([
        ["a repository with no skill", "https://github.com/anthropics/skills"],
        ["another host", "https://gitlab.com/x/y?skill=z"],
        ["an MCP server", "https://mcp.stripe.com"],
        ["an empty skill", "https://github.com/a/b?skill="],
        ["no repository", "https://github.com/onlyowner?skill=x"],
        ["nonsense", "not a url at all"],
    ])("refuses %s", (_case, url) => {
        expect(skillRefFromUrl(url)).toBeNull();
    });
});

describe("skillFilesIn", () => {
    it("keeps only files actually named SKILL.md", () => {
        // `.github/PULL_REQUEST_TEMPLATE/new-skill.md` is in a real catalogued repository and ends
        // with `skill.md`. A suffix test would take it, which is why this compares the basename.
        const listing = [
            file("skills/a/SKILL.md"),
            file(".github/PULL_REQUEST_TEMPLATE/new-skill.md"),
            file("skills/b/skill.md"),
            file("SKILL.md.bak"),
        ];
        expect(skillFilesIn(listing).map((f) => f.path)).toEqual([
            "skills/a/SKILL.md",
            "skills/b/skill.md",
        ]);
    });
});

describe("directoryOf", () => {
    it("is the immediate parent and nothing else", () => {
        expect(directoryOf("plugins/caveman/skills/cavecrew/SKILL.md")).toBe("cavecrew");
        expect(directoryOf("SKILL.md")).toBe("");
    });
});

describe("resolveContentPath", () => {
    it("finds the one file in a layout no formula would have guessed", () => {
        // `guides/photo/<skill>/SKILL.md` is one of 19 layouts, and 8 of 31 repositories use more
        // than one of them, which is why the listing is read instead of a path being composed.
        const resolved = resolveContentPath(
            {repo: "magentosh/superpowers", skill: "product-photography"},
            MAGENTOSH,
        );
        expect(resolved).toEqual({
            status: "resolved",
            path: "guides/photo/product-photography/SKILL.md",
            alsoAt: [],
            exact: true,
        });
    });

    it("serves one of two identical copies and names the other", () => {
        const resolved = resolveContentPath(
            {repo: "heygen-com/hyperframes", skill: "motion-doctrine"},
            HEYGEN,
        );
        expect(resolved).toEqual({
            status: "resolved",
            path: ".agents/skills/motion-doctrine/SKILL.md",
            alsoAt: [".claude/skills/motion-doctrine/SKILL.md"],
            exact: true,
        });
    });

    it("refuses two paths whose contents differ", () => {
        // Serving either would be a claim about which one the agent read, carried under the node's
        // signature. `session.ts` refuses an ambiguous name for the same reason.
        expect(
            resolveContentPath({repo: "juliusbrussee/caveman", skill: "caveman-stats"}, CAVEMAN),
        ).toEqual({
            status: "ambiguous",
            paths: [
                "plugins/caveman/skills/caveman-stats/SKILL.md",
                "skills/caveman-stats/SKILL.md",
            ],
        });
    });

    it("never takes a plugin directory for a skill", () => {
        // The defect in the first run of `scripts/measure/skill-layouts.ts`: matching any segment
        // made every file under `plugins/caveman/` a candidate for the skill `caveman`. There is no
        // `caveman/SKILL.md` in that repository, so the answer is absent — and a loose match would
        // have resolved it to `cavecrew`, silently, under the wrong atom's name.
        expect(
            resolveContentPath({repo: "juliusbrussee/caveman", skill: "caveman"}, CAVEMAN),
        ).toEqual({status: "absent"});
    });

    it("says absent for a skill whose file is not in the repository", () => {
        // 139 of 662 catalogued skills are in this state, and 95 of those sit in a repository with
        // nothing uncatalogued the name could have been renamed to. `tasks/31` §5.1.
        expect(
            resolveContentPath({repo: "magentosh/superpowers", skill: "to-prd"}, MAGENTOSH),
        ).toEqual({status: "absent"});
    });

    it("falls back to a case-folded directory and says it was not exact", () => {
        const listing = [file("skills/Product-Photography/SKILL.md")];
        const resolved = resolveContentPath({repo: "x/y", skill: "product-photography"}, listing);
        expect(resolved).toEqual({
            status: "resolved",
            path: "skills/Product-Photography/SKILL.md",
            alsoAt: [],
            exact: false,
        });
    });

    it("prefers an exact directory over a case-folded one", () => {
        // Two directories differing only in case is a plausible repository and an implausible
        // intention. Taking both would report an ambiguity the author does not have.
        const listing = [
            file("skills/Caveman/SKILL.md", "sha-upper"),
            file("skills/caveman/SKILL.md", "sha-lower"),
        ];
        const resolved = resolveContentPath({repo: "x/y", skill: "caveman"}, listing);
        expect(resolved).toEqual({
            status: "resolved",
            path: "skills/caveman/SKILL.md",
            alsoAt: [],
            exact: true,
        });
    });

    it("says absent on an empty listing rather than throwing", () => {
        expect(resolveContentPath({repo: "x/y", skill: "z"}, [])).toEqual({status: "absent"});
    });
});

describe("rawContentUrl", () => {
    it("points at the origin, because ARP hosts nothing", () => {
        expect(
            rawContentUrl(
                {repo: "magentosh/superpowers", skill: "product-photography"},
                "guides/photo/product-photography/SKILL.md",
            ),
        ).toBe(
            "https://raw.githubusercontent.com/magentosh/superpowers/HEAD/guides/photo/product-photography/SKILL.md",
        );
    });

    it("keeps the separators and escapes the segments", () => {
        expect(rawContentUrl({repo: "a/b", skill: "c d"}, "skills/c d/SKILL.md")).toBe(
            "https://raw.githubusercontent.com/a/b/HEAD/skills/c%20d/SKILL.md",
        );
    });

    it("pins to a commit when one is given", () => {
        expect(rawContentUrl({repo: "a/b", skill: "c"}, "x/SKILL.md", "abc123")).toBe(
            "https://raw.githubusercontent.com/a/b/abc123/x/SKILL.md",
        );
    });
});
