import {describe, expect, it} from "vitest";

import {
    parseSessionLog,
    refForInvocation,
    resolveInvocations,
    type CataloguedSkill,
} from "../src/session.js";

/** Six repositories carry `product-photography` with byte-identical files. Measured 2026-10-29. */
const CATALOGUE: CataloguedSkill[] = [
    {
        repo: "magentosh/superpowers",
        skill: "product-photography",
        url: "https://github.com/magentosh/superpowers?skill=product-photography",
        atom: "0xaa",
    },
    {
        repo: "101-skills/superpowers",
        skill: "product-photography",
        url: "https://github.com/101-skills/superpowers?skill=product-photography",
        atom: "0xbb",
    },
    {
        repo: "obra/superpowers",
        skill: "brainstorming",
        url: "https://github.com/obra/superpowers?skill=brainstorming",
        atom: "0xcc",
    },
];

const line = (over: Record<string, unknown> = {}) =>
    JSON.stringify({
        at: "2026-10-29T18:00:00.000Z",
        session: "s1",
        kind: "skill",
        name: "product-photography",
        source: null,
        ref: null,
        ...over,
    });

describe("parseSessionLog", () => {
    it("reads one invocation per line", () => {
        const log = parseSessionLog(`${line()}\n${line({name: "brainstorming"})}\n`);
        expect(log.map((row) => row.name)).toEqual(["product-photography", "brainstorming"]);
    });

    it("loses a corrupt line rather than the whole record", () => {
        // A hook appends while a session runs. A half-written line at the end is the normal way
        // this file ends, and throwing there would discard everything before it.
        const log = parseSessionLog(`${line()}\n{"at":"2026-\n`);
        expect(log).toHaveLength(1);
    });

    it("skips a shape it does not recognise instead of inventing fields", () => {
        expect(parseSessionLog(`{"kind":"skill"}\n{"name":"x","kind":"wat"}\n`)).toEqual([]);
    });
});

describe("refForInvocation", () => {
    const fetched = [
        {
            skill: "product-photography",
            atom: "0xaa",
            url: "https://github.com/magentosh/superpowers?skill=product-photography",
            at: "2026-10-29T18:00:00.000Z",
        },
        {
            skill: "brainstorming",
            atom: "0xcc",
            url: "https://github.com/obra/superpowers?skill=brainstorming",
            at: "2026-10-29T18:01:00.000Z",
        },
    ];

    it("resolves a name the local record settles", () => {
        // This is how `ref` stops being empty: the agent FETCHED one of the six, and the fetch
        // recorded which. A name on its own never could.
        expect(refForInvocation("product-photography", null, fetched)).toBe("0xaa");
    });

    it("takes the bare half of a plugin-qualified name", () => {
        expect(refForInvocation("superpowers:brainstorming", null, fetched)).toBe("0xcc");
    });

    it("refuses when two different atoms were fetched under one name", () => {
        // Not "the most recent". Which one the agent then invoked is unknowable, and a heuristic
        // here would write an edge about a repository it may never have touched — with a position
        // behind it. Null sends it back to `resolveInvocations`, which names every candidate.
        const both = [
            ...fetched,
            {
                skill: "product-photography",
                atom: "0xbb",
                url: "https://github.com/101-skills/superpowers?skill=product-photography",
                at: "2026-10-29T19:00:00.000Z",
            },
        ];
        expect(refForInvocation("product-photography", null, both)).toBeNull();
    });

    it("lets a source break what two fetches could not", () => {
        const both = [
            ...fetched,
            {
                skill: "product-photography",
                atom: "0xbb",
                url: "https://github.com/101-skills/superpowers?skill=product-photography",
                at: "2026-10-29T19:00:00.000Z",
            },
        ];
        const source = "~/.claude/plugins/101-skills/superpowers/skills/product-photography";
        expect(refForInvocation("product-photography", source, both)).toBe("0xbb");
    });

    it("accepts two fetches of the same atom as one answer", () => {
        // Fetching twice is not an ambiguity. It is the same tool, asked for twice.
        const twice = [fetched[0]!, {...fetched[0]!, at: "2026-10-29T20:00:00.000Z"}];
        expect(refForInvocation("product-photography", null, twice)).toBe("0xaa");
    });

    it("is null for a name nothing fetched", () => {
        expect(refForInvocation("never-asked-for", null, fetched)).toBeNull();
        expect(refForInvocation("product-photography", null, [])).toBeNull();
    });
});

describe("resolveInvocations", () => {
    it("refuses a name several repositories carry", () => {
        // The defect this exists to prevent: picking one would write an edge about a repository
        // the agent may never have touched, with a position behind it. A false claim that cost
        // something is worse on this ladder than no claim at all.
        const [only] = resolveInvocations(parseSessionLog(line()), CATALOGUE);
        expect(only?.status).toBe("ambiguous");
        expect(only?.status === "ambiguous" && only.candidates).toHaveLength(2);
    });

    it("resolves exactly when the log carries an atom id", () => {
        const [only] = resolveInvocations(parseSessionLog(line({ref: "0xbb"})), CATALOGUE);
        expect(only?.status).toBe("resolved");
        expect(only?.status === "resolved" && only.repo).toBe("101-skills/superpowers");
    });

    it("resolves on a URL too, because an id is a pure function of one", () => {
        const ref = "https://github.com/magentosh/superpowers?skill=product-photography";
        const [only] = resolveInvocations(parseSessionLog(line({ref})), CATALOGUE);
        expect(only?.status === "resolved" && only.atomId).toBe("0xaa");
    });

    it("resolves a name only one repository carries", () => {
        const [only] = resolveInvocations(
            parseSessionLog(line({name: "brainstorming"})),
            CATALOGUE,
        );
        expect(only?.status === "resolved" && only.repo).toBe("obra/superpowers");
    });

    it("narrows an ambiguous name when the runtime gave a source", () => {
        const log = parseSessionLog(line({source: "~/.claude/plugins/magentosh/superpowers/x"}));
        const [only] = resolveInvocations(log, CATALOGUE);
        expect(only?.status === "resolved" && only.repo).toBe("magentosh/superpowers");
    });

    it("says unknown for a skill the catalogue has never seen", () => {
        const [only] = resolveInvocations(parseSessionLog(line({name: "nothing-here"})), CATALOGUE);
        expect(only?.status).toBe("unknown");
    });

    it("never resolves an MCP server, because its key is not a repository", () => {
        // `mcp__arp__…` gives whatever the operator typed into their settings. Nothing maps that
        // to a repository, and a guess here would be a claim about somebody else's code.
        const log = parseSessionLog(line({kind: "mcp", name: "arp"}));
        const [only] = resolveInvocations(log, CATALOGUE);
        expect(only?.status).toBe("unknown");
    });

    it("counts repeats without letting them weigh anything", () => {
        // Forty calls is not forty times the evidence. The count is reported because a reader
        // deciding whether to declare wants it, and it feeds no weight (ADR `0046`).
        const log = parseSessionLog([line({ref: "0xaa"}), line({ref: "0xaa"})].join("\n"));
        const resolved = resolveInvocations(log, CATALOGUE);
        expect(resolved).toHaveLength(1);
        expect(resolved[0]?.calls).toBe(2);
    });

    it("keeps two different atoms apart even under one name", () => {
        const log = parseSessionLog([line({ref: "0xaa"}), line({ref: "0xbb"})].join("\n"));
        expect(resolveInvocations(log, CATALOGUE)).toHaveLength(2);
    });
});
