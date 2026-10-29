/** Which domain a catalogued skill belongs to, decided by a table rather than by judgement.
 *
 * Read by `measure/skill-domains.ts`, which reports the classification, and by whatever writes the
 * `has tag` edges — one table, so the measurement and the writing cannot disagree.
 *
 * ## Why a keyword table and not a model
 *
 * A third party can re-run this file and get the same answer. `docs/14`'s test for a signal is that
 * somebody else can reproduce it, and a tag that only ARP's judgement supports is an assertion —
 * the bottom rung of the ladder the whole project argues against.
 *
 * It is crude, and the crudeness is visible rather than hidden: a skill matching nothing comes back
 * **unclassified** and gets no tag at all, which is the honest outcome and the same discipline
 * `reachability.ts` applies with `no-verdict`.
 *
 * ## Order
 *
 * First match wins, so the specific domains come before the general ones. `development` is last
 * because its words (`code`, `library`, `framework`) appear in descriptions of almost everything.
 */

export type DomainRule = {
    /** The domain atom's label, a plain string. One word, never hyphenated — the user's rule. */
    domain: string;
    /**
     * Matched, lowercased, against the skill's **name and description**. Use only for words that
     * are about the subject wherever they appear — `stripe`, `postgres`, `hyperframes`.
     */
    words: readonly string[];
    /**
     * Matched against the **name only**. For words common enough that a description mentioning
     * them in passing is not evidence.
     *
     * It exists because the first version matched `writing` anywhere and swept in `triage` and
     * `algorithmic-art`, whose descriptions happen to contain the word. A wrong tag is permanent,
     * so a word that cannot carry the name alone belongs here or nowhere.
     */
    nameWords?: readonly string[];
    /** The parent under which this domain sits. `tool` is the root. */
    parent: string;
};

export const SKILL_DOMAINS: readonly DomainRule[] = [
    {
        domain: "payment",
        parent: "tool",
        words: ["payment", "stripe", "paypal", "invoice", "checkout", "billing", "subscription", "paywall"],
    },
    {
        domain: "video",
        parent: "tool",
        // `hyperframes` and the block vocabulary: heygen's 49 blocks carry the stock description
        // "— an installable skill for AI agents.", so only the name identifies them.
        words: ["video", "remotion", "animation", "avatar", "footage", "youtube", "hyperframes", "keyframe"],
        nameWords: ["render", "caption", "motion", "title", "carousel", "cursor", "frame", "overlay", "shard"],
    },
    {
        domain: "blockchain",
        parent: "tool",
        words: ["blockchain", "onchain", "ethereum", "solidity", "wallet", "token", "web3", "contract", "crypto"],
    },
    {domain: "scraping", parent: "tool", words: ["scrap", "crawl", "extract", "parse html", "firecrawl", "apify"]},
    {domain: "browser", parent: "tool", words: ["browser", "playwright", "puppeteer", "chrome", "headless", "selenium"]},
    {
        domain: "database",
        parent: "tool",
        words: ["database", "sql", "postgres", "prisma", "supabase", "mongo", "schema", "migration", "query"],
    },
    {
        domain: "observability",
        parent: "tool",
        words: ["observab", "monitor", "logging", "metric", "trace", "grafana", "alert", "sentry"],
    },
    {
        domain: "marketing",
        parent: "tool",
        // The conversion cluster: 12 skills about signup, onboarding, paywalls and referrals, which
        // is marketing by any reading and needed no new term.
        words: [
            "marketing", "seo", "campaign", "copywriting", "ads", "audience", "newsletter", "growth",
            "brand", "onboarding", "signup", "popup", "referral", "conversion", "product hunt",
            "activation",
        ],
        nameWords: ["cro", "launch", "photography"],
    },
    {
        domain: "design",
        parent: "tool",
        words: ["design", "figma", "ui ", "ux", "typograph", "colou", "color", "layout", "logo", "icon"],
    },
    {
        domain: "quality",
        parent: "tool",
        words: ["test", "lint", "review", "debug", "audit", "coverage", "qualit", "refactor"],
    },
    {
        domain: "infrastructure",
        parent: "tool",
        words: [
            "deploy", "docker", "kubernetes", "terraform", "cloudflare", "aws", "azure",
            "serverless", "infra", "ci/cd", "firebase",
        ],
    },
    {
        domain: "collaboration",
        parent: "tool",
        // 飞书 is Lark's own name, and the 14 `lark-*` skills describe themselves only in Chinese.
        words: [
            "slack", "notion", "jira", "linear", "github issue", "pull request", "team",
            "atlassian", "monday", "lark", "飞书", "obsidian", "calendar", "whiteboard",
        ],
    },
    {
        domain: "automation",
        parent: "tool",
        words: ["automat", "workflow", "zapier", "schedul", "cron", "pipeline", "orchestrat"],
    },
    {
        domain: "writing",
        parent: "tool",
        // **New, 2026-10-29.** Producing prose: the three `writing-*` skills, cold email, a PR body,
        // a commit message. Distinct from `marketing`, which is about reaching somebody, and from
        // `method`, which is about conducting work.
        words: ["cold email", "pr body", "commit message", "conventional commits"],
        nameWords: ["writing", "write", "article", "prose", "caveman", "cave"],
    },
    {
        domain: "method",
        parent: "tool",
        // **New, 2026-10-29.** How a piece of work is conducted — the largest unclassified cluster
        // at ~35 skills and the only one with no home at all. Not a tool and not a technical
        // subject: handing a session over, triaging an inbox, running a retrospective, planning
        // before editing, proving work is done before claiming it.
        //
        // `agent` was the obvious word and was rejected: in this repository an agent is an ERC-8004
        // identity, and one word for two things is how a vocabulary stops being one.
        words: [
            "handoff", "hand the current", "implementation plan", "subagent", "superpowers",
            "overbuilding", "chief of staff", "retrospective", "acceptance condition",
            "router over", "re-pitch",
        ],
        nameWords: [
            "handoff", "triage", "retro", "brainstorm", "spec", "prd", "questionnaire", "plan",
            "implement", "dispatch", "execute", "executing", "investigate", "wayfinder",
            "decision", "teach", "verify", "verification", "authoring", "template", "zoom",
            "wait", "grill", "ask", "manage", "optimize", "worktree", "lean", "sensei", "help",
        ],
    },
    {
        domain: "api",
        parent: "tool",
        words: ["api", "rest", "graphql", "endpoint", "webhook", "openapi", "postman"],
    },
    {
        domain: "development",
        parent: "tool",
        words: ["code", "typescript", "python", "rust", "compil", "sdk", "library", "framework", "git "],
    },
];

/** The domain a skill lands in, or `null` when the table has no word for it. */
export function classifySkill(skill: string, description: string): string | null {
    const name = ` ${skill.replace(/-/g, " ").toLowerCase()} `;
    const both = `${name}${description.toLowerCase()}`;
    const hit = SKILL_DOMAINS.find(
        (rule) =>
            rule.words.some((word) => both.includes(word)) ||
            // Padded, so `plan` matches the skill `writing-plans` and not the word `planet`.
            (rule.nameWords ?? []).some((word) => name.includes(` ${word}`)),
    );
    return hit?.domain ?? null;
}
