import {describe, expect, it} from "vitest";

import {
    frontmatterName,
    fuseSearches,
    groupByContent,
    parseSkillsFind,
    readPulse,
    readSkillFacts,
    type ListedFile,
    type PulseSource,
    type RepositoryListing,
    type SkillSearchResult,
} from "../src/pulse.js";

// Captured from `npx skills find "video editing ffmpeg"`, skills 1.7.6, 2026-11-05.
const FIND_OUTPUT = `
\u001b[38;5;102mInstall with\u001b[0m npx skills add <owner/repo@skill>

skills.volces.com@FFmpeg Video Editing 6 installs
└ https://skills.sh/skills.volces.com/multilingual-video-dubbing-ffmpeg-video-editing

cecil-ia-labs/ffmpeg-dev@ffmpeg-video-editing 1 install
└ https://skills.sh/cecil-ia-labs/ffmpeg-dev/ffmpeg-video-editing

heygen-com/hyperframes@hyperframes 1.4M installs
└ https://skills.sh/heygen-com/hyperframes/hyperframes

101-skills/superpowers@ai-video-generation 958.8K installs
└ https://skills.sh/101-skills/superpowers/ai-video-generation
`;

const result = (source: string, skill: string): SkillSearchResult => ({
    source,
    skill,
    installs: 1,
    installsText: "1",
    url: null,
});

const skillMd = (name: string, body = "Body") => `---\nname: ${name}\n---\n${body}\n`;

function sourceOf(files: Record<string, string>, overrides: Partial<RepositoryListing> = {}): PulseSource {
    const listed: ListedFile[] = Object.entries(files).map(([path, text]) => ({
        path,
        sha: `blob:${text}`,
        size: text.length,
    }));
    const trees = new Map<string, string>();
    for (const {path} of listed) {
        const parts = path.split("/");
        for (let depth = 1; depth < parts.length; depth += 1) {
            const directory = parts.slice(0, depth).join("/");
            trees.set(directory, `tree:${directory}`);
        }
    }
    return {
        listing: async () => ({rootTreeId: "tree:root", files: listed, trees, truncated: false, ...overrides}),
        file: async (_repo, path) => files[path] ?? null,
        repository: async () => ({stars: 5, pushedAt: "2026-11-01T00:00:00Z", archived: false}),
    };
}

describe("parseSkillsFind", () => {
    it("reads names with spaces, thousands and millions, and strips colour", () => {
        const parsed = parseSkillsFind(FIND_OUTPUT);
        expect(parsed.map((row) => [row.source, row.skill, row.installs])).toEqual([
            ["skills.volces.com", "FFmpeg Video Editing", 6],
            ["cecil-ia-labs/ffmpeg-dev", "ffmpeg-video-editing", 1],
            ["heygen-com/hyperframes", "hyperframes", 1_400_000],
            ["101-skills/superpowers", "ai-video-generation", 958_800],
        ]);
        expect(parsed[1]?.url).toBe("https://skills.sh/cecil-ia-labs/ffmpeg-dev/ffmpeg-video-editing");
    });

    it("keeps a result the CLI prints without a count, and does not invent one", () => {
        const [row] = parseSkillsFind("owner/repo@skill\n└ https://skills.sh/owner/repo/skill\n");
        expect(row?.installs).toBeNull();
        expect(row?.skill).toBe("skill");
    });

    it("returns nothing for text that is not a result, including the npx instruction", () => {
        expect(parseSkillsFind("Install with npx skills add <owner/repo@skill>\nNo skills found\n")).toEqual([]);
    });

    it("lists a repeated result once", () => {
        expect(parseSkillsFind("a/b@c 1 install\na/b@c 1 install\n")).toHaveLength(1);
    });
});

describe("fuseSearches", () => {
    const row = (skill: string) => result("a/b", skill);

    it("puts first what several searches rank high, and keeps each skill once", () => {
        const fused = fuseSearches([
            [row("only-first"), row("both")],
            [row("both"), row("only-second")],
        ]);
        expect(fused.map((entry) => entry.skill)).toEqual(["both", "only-first", "only-second"]);
    });

    it("gives one search its own order, and nothing for none", () => {
        expect(fuseSearches([[row("x"), row("y")]]).map((entry) => entry.skill)).toEqual(["x", "y"]);
        expect(fuseSearches([])).toEqual([]);
    });
});

describe("frontmatterName", () => {
    it("reads a quoted name", () => {
        expect(frontmatterName(`---\nname: "Video Editor"\n---\n`)).toBe("Video Editor");
    });

    it("does not read a name from the body", () => {
        expect(frontmatterName("---\ndescription: x\n---\nname: later\n")).toBeNull();
        expect(frontmatterName("name: no frontmatter\n")).toBeNull();
    });
});

describe("readSkillFacts", () => {
    const facts = readSkillFacts(
        [
            "---\nname: x\nallowed-tools: Bash(belt *)\n---",
            "Run `belt login`, then set ELEVENLABS_API_KEY or YOUR_TOKEN. See pricing and Credits.",
            "https://inference.sh/docs https://github.com/a/b https://example.com/x https://portrait.jpg",
        ].join("\n"),
        [
            {path: "x/SKILL.md", sha: "1", size: 100},
            {path: "x/run.py", sha: "2", size: 50},
        ],
    );

    it("names keys and never reads a value", () => {
        expect(facts.keys).toEqual(["ELEVENLABS_API_KEY", "YOUR_TOKEN"]);
    });

    it("keeps real hosts only", () => {
        expect(facts.hosts).toEqual(["inference.sh"]);
    });

    it("counts files, bytes, scripts, and carries the declared CLI", () => {
        expect([facts.files, facts.bytes, facts.scripts]).toEqual([2, 150, 1]);
        expect(facts.requires.cli).toEqual(["belt"]);
        expect(facts.paidWords).toEqual(["pricing", "credits"]);
    });
});

describe("runsAbsentFiles", () => {
    const listed = [
        {path: ".claude/skills/x/SKILL.md", sha: "1", size: 1},
        {path: ".claude/skills/x/scripts/cut.mjs", sha: "2", size: 1},
    ];

    it("names a script the instructions run and the repository does not hold", () => {
        const facts = readSkillFacts("node scripts/transcribe.mjs raw.mp4", listed);
        expect(facts.runsAbsentFiles).toEqual(["scripts/transcribe.mjs"]);
    });

    it("does not name a script the repository holds, whatever the layout", () => {
        expect(readSkillFacts("node scripts/cut.mjs a.json", listed).runsAbsentFiles).toEqual([]);
        expect(readSkillFacts("python3 ./.claude/skills/x/scripts/cut.mjs", listed).runsAbsentFiles).toEqual([]);
    });

    it("leaves out a placeholder and a path outside the repository", () => {
        const text = "python path/to/script.py\nnode /usr/lib/x.js\nbash ~/.claude/run.sh\npython your_script.py";
        expect(readSkillFacts(text, listed).runsAbsentFiles.filter((name) => name !== "your_script.py")).toEqual([]);
    });
});

describe("readPulse", () => {
    it("finds a skill whose directory does not carry its name, as an installer would", async () => {
        const source = sourceOf({"skills/other/SKILL.md": skillMd("other"), "skills/renamed/SKILL.md": skillMd("wanted")});
        const pulse = await readPulse(result("a/b", "wanted"), source);
        expect(pulse.status).toBe("read");
        if (pulse.status === "read") {
            expect(pulse.path).toBe("skills/renamed/SKILL.md");
            expect(pulse.contentId).toBe("tree:skills/renamed");
        }
    });

    it("does not take a directory whose frontmatter names something else", async () => {
        const source = sourceOf({"wanted/SKILL.md": skillMd("different")});
        expect(await readPulse(result("a/b", "wanted"), source)).toMatchObject({status: "absent", skillFiles: 1});
    });

    it("names the other copies when several files are identical", async () => {
        const text = skillMd("wanted");
        const source = sourceOf({".agents/skills/wanted/SKILL.md": text, ".claude/skills/wanted/SKILL.md": text});
        const pulse = await readPulse(result("a/b", "wanted"), source);
        expect(pulse).toMatchObject({status: "read", alsoAt: [".claude/skills/wanted/SKILL.md"]});
    });

    it("refuses to choose between differing files off the installer's order", async () => {
        const source = sourceOf({"a/b/c/d/wanted/SKILL.md": skillMd("wanted", "one"), "e/f/g/h/wanted/SKILL.md": skillMd("wanted", "two")});
        expect(await readPulse(result("a/b", "wanted"), source)).toMatchObject({
            status: "ambiguous",
            paths: ["a/b/c/d/wanted/SKILL.md", "e/f/g/h/wanted/SKILL.md"],
        });
    });

    it("takes what the installer takes when a translation differs, and names the other", async () => {
        // The shape of affaan-m/ecc, the first result of "video editing" on 2026-11-05.
        const source = sourceOf({
            "docs/zh-CN/skills/wanted/SKILL.md": skillMd("wanted", "traduit"),
            "skills/wanted/SKILL.md": skillMd("wanted", "original"),
        });
        expect(await readPulse(result("a/b", "wanted"), source)).toMatchObject({
            status: "read",
            path: "skills/wanted/SKILL.md",
            differsAt: ["docs/zh-CN/skills/wanted/SKILL.md"],
        });
    });

    it("matches a name the way the installer does, across case and spaces", async () => {
        const source = sourceOf({"x/SKILL.md": skillMd("FFmpeg Video Editor")});
        expect((await readPulse(result("a/b", "ffmpeg-video-editor"), source)).status).toBe("read");
    });

    it("finds a second copy that sits in a later batch, so a difference is not missed", async () => {
        const files: Record<string, string> = {"first/SKILL.md": skillMd("wanted", "one")};
        for (let index = 0; index < 30; index += 1) files[`f${index}/SKILL.md`] = skillMd(`f${index}`);
        files["last/SKILL.md"] = skillMd("wanted", "two");
        expect(await readPulse(result("a/b", "wanted"), sourceOf(files))).toMatchObject({differsAt: ["last/SKILL.md"]});
    });

    it("finds a key in a script its instructions run, when its own file names none", async () => {
        // The shape of nateherkai/herk-edit-kit's cut-silences, 2026-11-05.
        const source = sourceOf({
            ".claude/skills/wanted/SKILL.md": skillMd("wanted", "node scripts/transcribe-elevenlabs.mjs raw.mp4"),
            "scripts/transcribe-elevenlabs.mjs": "let k = env.ELEVENLABS_API_KEY; if (!k) die()",
        });
        const pulse = await readPulse(result("a/b", "wanted"), source);
        expect(pulse).toMatchObject({
            status: "read",
            keys: [],
            runsAbsentFiles: [],
            keysInScriptsItRuns: [{file: "scripts/transcribe-elevenlabs.mjs", keys: ["ELEVENLABS_API_KEY"]}],
        });
    });

    it("gives a root skill the repository's tree id", async () => {
        const pulse = await readPulse(result("a/b", "wanted"), sourceOf({"SKILL.md": skillMd("wanted"), "README.md": "x"}));
        expect(pulse).toMatchObject({status: "read", contentId: "tree:root", files: 2});
    });

    it("does not claim absent from a truncated listing", async () => {
        const source = sourceOf({"x/SKILL.md": skillMd("x")}, {truncated: true});
        expect(await readPulse(result("a/b", "wanted"), source)).toMatchObject({
            status: "incomplete",
            reason: "truncated_listing",
        });
    });

    it("says each failure rather than reading as an empty skill", async () => {
        const failing = (failure: "unreachable" | "rate_limited"): PulseSource => ({
            ...sourceOf({}),
            listing: async () => failure,
        });
        expect((await readPulse(result("a/b", "x"), failing("rate_limited"))).status).toBe("rate_limited");
        expect((await readPulse(result("a/b", "x"), failing("unreachable"))).status).toBe("repository_unreachable");
        expect((await readPulse(result("skills.volces.com", "x"), sourceOf({}))).status).toBe("not_github");
    });
});

describe("groupByContent", () => {
    it("puts identical directories from two repositories together, largest group first", async () => {
        const text = skillMd("wanted");
        const one = await readPulse(result("a/b", "wanted"), sourceOf({"wanted/SKILL.md": text}));
        const two = await readPulse(result("c/d", "wanted"), sourceOf({"wanted/SKILL.md": text}));
        const three = await readPulse(result("e/f", "other"), sourceOf({"other/SKILL.md": skillMd("other")}));
        const failed = await readPulse(result("skills.volces.com", "x"), sourceOf({}));
        const groups = groupByContent([three, one, two, failed]);
        expect(groups.map((group) => group.members.length)).toEqual([2, 1]);
        expect(groups[0]?.members.map((member) => member.source)).toEqual(["a/b", "c/d"]);
    });
});
