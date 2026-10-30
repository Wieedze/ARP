/** Which domain a catalogued skill belongs to, decided by a table rather than by judgement.
 *
 * Read by `measure/skill-domains.ts`, which reports the classification, and by `seed-skill-tags.ts`,
 * which writes it — one table, so the measurement and the writing cannot disagree.
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
 * ## Two failures this table has already had, both found after it wrote tags
 *
 * **A word in a description is not evidence.** The first version matched every word against the
 * name *and* the description. `writing` then swept in `triage` and `algorithmic-art`, whose
 * descriptions happen to contain it. Hence {@link DomainRule.nameWords}: a word that cannot carry
 * the name alone belongs there or nowhere.
 *
 * **A general word in an early rule beats a specific word in a later one.** First match wins, so
 * ordering is semantics, not housekeeping. Measured 2026-10-29 over the committed 662:
 *
 * ```
 * blockchain ← "token"        24 tags, every one wrong — `caveman` cuts token usage,
 *                             `vercel-cli-with-tokens` is auth, three are design tokens
 * payment ← "subscription"    an Azure subscription is not a payment
 * scraping ← "extract"        extracting a pptx is not scraping the web
 * observability ← "trace"     a "tracer-bullet" ticket, a "traceback"
 * quality ← "review"          beat `infrastructure` on "Build, debug, or review…"
 * ```
 *
 * ~65 of the first 296 tags written were wrong because of this, and a tag is permanent. The fix is
 * both halves together: the general words came out of `words`, and the general **domains** moved
 * below the specific ones.
 */

export type DomainRule = {
    /** The domain atom's label, a plain string. One word, never hyphenated — the user's rule. */
    domain: string;
    /**
     * Matched, lowercased, against the skill's **name and description**. Only for words that are
     * about the subject wherever they appear — `stripe`, `postgres`, `hyperframes`.
     *
     * The test before adding one: could this word appear in a sentence about something else? If
     * yes it belongs in {@link nameWords}. `token`, `contract`, `review`, `schema`, `query`,
     * `extract`, `subscription` and `trace` all failed it, after they had written tags.
     */
    words: readonly string[];
    /**
     * Matched against the **name only**, on a word boundary at the start. For words common enough
     * that a description mentioning them in passing is not evidence.
     */
    nameWords?: readonly string[];
    /** The parent under which this domain sits. `tool` is the root. */
    parent: string;
};

/**
 * Specific first, general last. See the ordering note above — this sequence is load-bearing.
 *
 * `development` is last because its words (`code`, `library`, `framework`) appear in descriptions
 * of almost everything. `blockchain`, `quality` and `observability` sit below the domains whose
 * vocabulary they used to steal.
 */
export const SKILL_DOMAINS: readonly DomainRule[] = [
    {
        domain: "payment",
        parent: "tool",
        // `subscription` removed: four Azure skills are about an Azure subscription.
        words: ["payment", "stripe", "paypal", "invoice", "checkout", "billing", "paywall"],
    },
    {
        domain: "video",
        parent: "tool",
        // heygen's 49 blocks carry the stock description "— an installable skill for AI agents.",
        // so only the name identifies them. `animation` is a name word: nine of emilkowalski's UI
        // motion skills describe themselves with it and belong to `design`.
        words: ["video", "remotion", "hyperframes", "keyframe", "footage", "youtube"],
        nameWords: ["render", "caption", "motion", "title", "carousel", "cursor", "frame", "overlay", "shard", "animation", "avatar"],
    },
    {
        domain: "image",
        parent: "tool",
        // **New, 2026-10-29.** Generating and editing stills: RunComfy's and Black Forest Labs'
        // families, inpainting, outpainting, relighting, product photography. Below `video` on
        // purpose — `image-to-video` is a video skill and matches `video` first.
        // `runcomfy` was here for one revision and is a **platform, not a domain** — it hosts
        // music as well, so it took `ai-music` and `ace-step` off `audio`. A host's name is never
        // a subject.
        words: ["image generation", "inpainting", "outpainting", "flux", "midjourney", "stable diffusion", "nano banana"],
        nameWords: ["image", "photo", "relight", "upscale", "thumbnail", "imagegen"],
    },
    {
        domain: "audio",
        parent: "tool",
        // **New, 2026-10-29.** Music and speech: ElevenLabs, ACE Step, the RunComfy music family.
        words: ["elevenlabs", "music generation", "text to speech", "voiceover", "sound effect", "instrumental"],
        nameWords: ["audio", "music", "voice", "speech", "sound"],
    },
    {
        domain: "document",
        parent: "tool",
        // **New, 2026-10-29.** Office formats as objects to read and write — Anthropic's `pptx`,
        // `pdf` and `docx`, and co-authoring. Distinct from `writing`, which is about prose.
        words: ["pptx", "docx", "xlsx", "powerpoint", "spreadsheet", ".potx", "pdf file"],
        nameWords: ["pdf", "docx", "pptx", "xlsx", "document", "slide"],
    },
    {
        domain: "scraping",
        parent: "tool",
        // `extract` is a name word: extracting a pptx, a pdf or a domain language is not scraping.
        words: ["scrap", "crawl", "firecrawl", "apify"],
        nameWords: ["extract", "scrape"],
    },
    {
        domain: "browser",
        parent: "tool",
        words: ["playwright", "puppeteer", "headless browser", "selenium"],
        nameWords: ["browser", "chrome"],
    },
    {
        domain: "database",
        parent: "tool",
        // `schema` and `query` are name words: SEO schema markup, image-edit "schemas", Azure cost
        // queries and Kusto all matched them in prose.
        words: ["database", "postgres", "prisma", "supabase", "mongo", " sql"],
        nameWords: ["schema", "query", "migration", "sql"],
    },
    {
        domain: "design",
        parent: "tool",
        words: ["figma", "typograph", "design system", "design token"],
        nameWords: ["design", "ux", "colour", "color", "layout", "logo", "icon", "theme"],
    },
    {
        domain: "collaboration",
        parent: "tool",
        // 飞书 is Lark's own name, and the 14 `lark-*` skills describe themselves only in Chinese.
        words: ["slack", "notion", "jira", "linear", "atlassian", "monday", "飞书", "obsidian"],
        nameWords: ["lark", "calendar", "whiteboard", "meeting"],
    },
    {
        domain: "marketing",
        parent: "tool",
        // The conversion cluster — signup, onboarding, paywalls, referrals — is marketing by any
        // reading and needed no new term.
        words: ["marketing", "seo", "campaign", "copywriting", "newsletter", "onboarding", "referral", "product hunt"],
        nameWords: ["cro", "launch", "photography", "signup", "popup", "ads", "audience", "growth", "brand"],
    },
    {
        domain: "blockchain",
        parent: "tool",
        // Moved below `database`, `design` and `collaboration`, and `token` and `contract` removed
        // outright: all 24 tags they produced were wrong.
        words: ["blockchain", "onchain", "on-chain", "ethereum", "solidity", "web3", "smart contract", "erc-20", "erc-721"],
        nameWords: ["wallet", "crypto", "nft", "defi"],
    },
    {
        domain: "infrastructure",
        parent: "tool",
        // Moved above `quality` and `observability`, which were taking its skills on "review" and
        // "trace". `azure` and `vercel` are here because that is what those skills are about.
        words: ["deploy", "docker", "kubernetes", "terraform", "cloudflare", "aws", "azure", "serverless", "ci/cd", "firebase", "hosting", "vercel"],
        nameWords: ["infra", "cli"],
    },
    {
        domain: "observability",
        parent: "tool",
        words: ["observab", "logging", "grafana", "sentry", "telemetry"],
        nameWords: ["monitor", "metric", "trace", "alert", "log"],
    },
    {
        domain: "quality",
        parent: "tool",
        // `review` and `test` are name words: "Build, debug, or review …" was taking eight
        // Cloudflare skills and three deploy skills off `infrastructure`.
        words: ["linting", "unit test", "code coverage", "static analysis"],
        nameWords: ["test", "lint", "review", "debug", "audit", "coverage", "quality", "refactor", "eval"],
    },
    {
        domain: "writing",
        parent: "tool",
        words: ["cold email", "pr body", "commit message", "conventional commits"],
        nameWords: ["writing", "write", "article", "prose", "caveman", "cave", "edit"],
    },
    {
        domain: "method",
        parent: "tool",
        // How a piece of work is conducted — the largest cluster with no home. `agent` was the
        // obvious word and was rejected: here an agent is an ERC-8004 identity, and one word for
        // two things is how a vocabulary stops being one.
        words: ["handoff", "hand the current", "implementation plan", "subagent", "superpowers", "overbuilding", "chief of staff", "retrospective", "acceptance condition", "router over", "re-pitch"],
        nameWords: ["handoff", "triage", "retro", "brainstorm", "spec", "prd", "questionnaire", "plan", "implement", "dispatch", "execute", "executing", "investigate", "wayfinder", "decision", "teach", "verify", "verification", "authoring", "template", "zoom", "wait", "grill", "ask", "manage", "optimize", "worktree", "lean", "sensei", "help", "ticket", "issue"],
    },
    {
        domain: "website",
        parent: "tool",
        // Restored 2026-10-29. It was in the measurement's table, absent from this one, and nothing
        // recorded the drop — so `html`, `css` and `landing` routed nowhere for one run.
        words: ["landing page", "static site", "next.js", "nextjs", "tailwind"],
        nameWords: ["website", "html", "css", "landing", "frontend", "react"],
    },
    {
        domain: "api",
        parent: "tool",
        words: ["rest api", "graphql", "webhook", "openapi", "postman"],
        nameWords: ["api", "endpoint", "rest"],
    },
    {
        domain: "automation",
        parent: "tool",
        words: ["zapier", "cron", "orchestrat"],
        nameWords: ["automation", "workflow", "schedule", "pipeline"],
    },
    {
        domain: "development",
        parent: "tool",
        words: ["typescript", "python", "rust ", "sdk"],
        nameWords: ["code", "compile", "library", "framework", "git"],
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
