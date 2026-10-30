import {Link} from "react-router-dom";
import type {Hex} from "viem";

import {ClaimField} from "../components/atom/ClaimField";
import {Group} from "../components/atom/ClaimList";
import {Hint} from "../components/brand/Hint";
import {AtomMarket} from "../components/market/AtomMarket";
import {DeclareUse} from "../components/usage/DeclareUse";
import {useAtomStanding} from "../hooks/use-atom-standing";
import {useDomainTree} from "../hooks/use-domain-tree";
import {useSkillFacts} from "../hooks/use-skill-facts";
import {useSkillMd, type SkillMdRead} from "../hooks/use-skill-md";
import {useChainChoice} from "../lib/chain-choice";
import {linkClass} from "../lib/control-class";
import {actionCardClass} from "../lib/surface-class";
import {parseToolLabel} from "../lib/tool-label";
import {
    LIVENESS_OBJECTS,
    predicateLabelOf,
    type AtomView,
    type ClaimView,
} from "../services/atom-standing-view";
import {splitFirstSentence} from "../services/skill-md";
import {intuitionPortalUrl, truncateMiddle} from "../services/trust-format";
import {Block, ClsRow, Install, Panel, RecordRow, Signal} from "../components/atom/AtomPageParts";
import {formatDay, githubApiUrlOf, LABEL} from "../lib/atom-page";

/**
 * `/atom/:atomId` when the atom is a skill: `github.com/<owner>/<repo>?skill=<name>` (ADR `0077`).
 *
 * The build contract is `arp-skill-page/SKILL-PAGE.md`. Top to bottom: what the skill is (its name,
 * its SKILL.md, the line that installs it), what is written about it on chain and what is measured
 * about it elsewhere, its own market, every claim about it, and the record.
 *
 * Two markets, never summed (ADR `0056`): the skill's own vault in the lead, the vaults on the
 * claims about it under Relations. No score and no stars of ours (ADR `0046`); GitHub's stars are
 * labelled as GitHub's.
 *
 * No section about other skills with the same name: the same name in another repository is another
 * skill. The identical-pack story belongs on the repository's page.
 */
export function SkillPage({
    view,
    atomId,
    modules,
    onDeclared,
}: {
    view: AtomView;
    atomId: Hex;
    modules: Record<string, string[]>;
    onDeclared: () => void;
}) {
    const parsed = view.label === null ? null : parseToolLabel(view.label);
    const repo = parsed?.kind === "skill" ? `${parsed.owner}/${parsed.repo}` : null;
    const skill = parsed?.kind === "skill" ? parsed.skill : view.title;
    const source = view.claims.find((claim) => claim.predicate === "source") ?? null;
    const md = useSkillMd(view.label);

    return (
        <article className="mt-8">
            <header>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 font-mono text-[12px] text-[color:var(--color-steel)]">
                    <span className="rounded-[var(--radius-tag)] border border-[color:var(--color-rule-strong)] px-[7px] py-[2px] text-[10px] uppercase tracking-[0.1em] text-[color:var(--color-fg)]">
                        Skill
                    </span>
                    {source === null ? (
                        repo === null ? null : (
                            <span>{repo}</span>
                        )
                    ) : (
                        <Link to={`/atom/${source.objectAtomId}`} className={linkClass}>
                            {source.object}
                        </Link>
                    )}
                    {view.browseUrl === null ? null : (
                        <a
                            href={view.browseUrl}
                            target="_blank"
                            rel="noreferrer"
                            className={linkClass}
                        >
                            {`${new URL(view.browseUrl).hostname} ↗`}
                        </a>
                    )}
                </div>
                <h1 className="type-title mt-[18px] [overflow-wrap:anywhere]">{skill}</h1>

                {/* Two columns from `lg`: what the skill is on the left, what is known about it on
                    the right. Stacked, the right half of a wide screen stood empty beside a
                    46rem column (the user, 2026-10-29, with a screenshot). */}
                <div className="mt-6 grid items-start gap-x-12 gap-y-7 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,26rem)]">
                    <div className="min-w-0">
                        <Description label={view.label} md={md} repo={repo} />
                        {repo === null ? null : (
                            <Install command={`npx skills add ${repo} --skill ${skill}`} />
                        )}
                    </div>
                    <div className="grid gap-4 max-lg:[grid-template-columns:repeat(auto-fit,minmax(min(100%,22rem),1fr))]">
                        <Classification view={view} source={source} />
                        <ExternalSignals view={view} source={source} />
                    </div>
                </div>
            </header>

            {/* The lead: the skill's own market and its curves. */}
            <div className={`mt-14 ${actionCardClass}`}>
                <AtomMarket
                    atomTermId={atomId}
                    name={skill}
                    nameIsId={false}
                    backHeading="Take a position"
                    heading={null}
                />
            </div>
            <div className="mt-10 max-w-[48rem]">
                <DeclareUse object={atomId} objectLabel={skill} onDeclared={onDeclared} />
            </div>

            <Block title="Relations" label="Every claim about this skill">
                <ClaimField
                    groups={view.groups}
                    subject={skill}
                    edgeCount={view.edgeCount}
                    truncated={view.truncated}
                />
                {view.groups.length === 0 ? null : (
                    <div className="mt-10">
                        {view.groups.map((group) => (
                            <Group
                                key={group.predicateAtomId}
                                group={group}
                                subject={skill}
                                modules={modules}
                            />
                        ))}
                    </div>
                )}
            </Block>

            <Record view={view} source={source} />
        </article>
    );
}

/** The SKILL.md's own description, and its `##` sections with the first command of each. */
function Description({
    label,
    md,
    repo,
}: {
    label: string | null;
    md: SkillMdRead;
    repo: string | null;
}) {
    const {factFor} = useSkillFacts();
    // skills.sh's copy stands in while the file is read, and where there is no file to read.
    const fallback = factFor(label)?.description ?? null;
    const description = md.status === "ok" ? (md.md.description ?? fallback) : fallback;
    const sections = md.status === "ok" ? md.md.sections : [];

    return (
        <section
            aria-labelledby="skill-description"
            className="max-w-[46rem] border-t border-[color:var(--color-rule-strong)] pt-3.5"
        >
            <div className="flex flex-wrap justify-between gap-3">
                <span id="skill-description" className={LABEL}>
                    Description
                </span>
                <SkillMdSource md={md} repo={repo} />
            </div>
            {description === null ? (
                <p className="mt-2.5 font-mono text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]">
                    {md.status === "pending" ? "reading the SKILL.md…" : "no description"}
                </p>
            ) : (
                <Lede text={description} />
            )}
            {sections.length === 0 ? null : (
                <ul className="mt-3.5 grid gap-x-7 [grid-template-columns:repeat(auto-fit,minmax(min(100%,20rem),1fr))]">
                    {sections.map((section, index) => (
                        <li
                            key={`${index}-${section.heading}`}
                            className="flex min-w-0 items-baseline justify-between gap-3 border-b border-[color:var(--color-rule)] py-2 text-[14px] text-[color:var(--color-silver)]"
                        >
                            <span className="min-w-0 truncate">{section.heading}</span>
                            <code className="min-w-0 truncate font-mono text-[12px] text-[color:var(--color-steel)]">
                                {section.command}
                            </code>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}

/**
 * The first sentence large, the rest at reading size.
 *
 * Descriptions run from five words to a thousand characters (median 448). Set whole at 26px, a long
 * one became a wall of display type; the first sentence is what the skill is, the rest is how to
 * use it, and they read at two sizes.
 */
function Lede({text}: {text: string}) {
    const {head, rest} = splitFirstSentence(text);
    return (
        <>
            <p className="mt-2.5 text-[clamp(20px,2.4vw,26px)] leading-[1.3] [text-wrap:balance]">
                {head}
            </p>
            {rest === null ? null : (
                <p className="mt-3 max-w-[64ch] text-[length:var(--text-body)] leading-[1.55] text-[color:var(--color-silver)]">
                    {rest}
                </p>
            )}
        </>
    );
}

/** `SKILL.md · v4.0.539`, linked to the file; or why there is no file. */
function SkillMdSource({md, repo}: {md: SkillMdRead; repo: string | null}) {
    if (md.status === "ok") {
        const version = md.md.version === null ? "" : ` · v${md.md.version}`;
        return (
            <a
                href={repo === null ? md.url : `https://github.com/${repo}/blob/HEAD/${md.path}`}
                target="_blank"
                rel="noreferrer"
                className={`${LABEL} ${linkClass}`}
            >
                {`SKILL.md${version}`}
            </a>
        );
    }
    if (md.status === "none") {
        return (
            <span className={`${LABEL} flex items-center gap-1.5`}>
                No SKILL.md found
                <Hint label="Why there is no SKILL.md" align="right">
                    The repository holds no file under this skill&apos;s name, or holds several that
                    differ, so none is read.
                </Hint>
            </span>
        );
    }
    if (md.status === "failed") return <span className={LABEL}>SKILL.md did not load</span>;
    return null;
}

/**
 * What is written about the skill on chain, by ARP's attestor: its domain, its source, and its
 * repository's liveness. Only what the attestor holds (`attestorBacked`), as the view already
 * filtered.
 */
function Classification({view, source}: {view: AtomView; source: ClaimView | null}) {
    const domains = useDomainTree();
    const labels = new Set(domains.options.map((option) => option.label));
    const domain =
        view.claims.find(
            (claim) => predicateLabelOf(claim.predicate, claim.objectLabel, labels) === "Domain",
        ) ?? null;
    const path = domainPath(domain, domains.tree);
    const repoStanding = useAtomStanding(source?.objectAtomId ?? null);
    const liveness =
        repoStanding.data?.claims.find((claim) => LIVENESS_OBJECTS.has(claim.objectLabel ?? "")) ??
        null;
    const evidenceUrl = githubApiUrlOf(source?.objectLabel ?? null);

    return (
        <Panel label="Classification">
            <dl className="m-0">
                <ClsRow term="Domain">
                    {domain === null ? (
                        <span className="text-[color:var(--color-steel)]">none</span>
                    ) : (
                        <>
                            {path.slice(0, -1).map((step) => (
                                <span key={step}>
                                    {step}
                                    <span
                                        aria-hidden="true"
                                        className="mx-1.5 text-[color:var(--color-grey)]"
                                    >
                                        /
                                    </span>
                                </span>
                            ))}
                            <Link to={`/atom/${domain.objectAtomId}`} className={linkClass}>
                                {domain.object}
                            </Link>
                        </>
                    )}
                </ClsRow>
                <ClsRow term="Source">
                    {source === null ? (
                        <span className="text-[color:var(--color-steel)]">none</span>
                    ) : (
                        <Link to={`/atom/${source.objectAtomId}`} className={linkClass}>
                            {source.object}
                        </Link>
                    )}
                </ClsRow>
                <ClsRow term="Repository">
                    {liveness === null ? (
                        <span className="text-[color:var(--color-steel)]">
                            {repoStanding.isPending && source !== null ? "…" : "no verdict"}
                        </span>
                    ) : (
                        <span className="inline-flex items-center gap-[7px]">
                            {/* Saffron, as on the verdict line of every other tool page: it is
                                the one claim ARP stakes on itself. */}
                            <span
                                aria-hidden="true"
                                className="h-[7px] w-[7px] rounded-full bg-[color:var(--color-accent)]"
                            />
                            {/* **The request the verdict rests on**, so a reader can repeat it:
                                `maintained` is `archived` and `pushed_at` from this one call
                                (`scripts/seed/record-maintained.ts`). */}
                            {evidenceUrl === null ? (
                                liveness.object
                            ) : (
                                <a
                                    href={evidenceUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className={linkClass}
                                >
                                    {liveness.object} ↗
                                </a>
                            )}
                        </span>
                    )}
                </ClsRow>
            </dl>
        </Panel>
    );
}

/** The domain's labels from the root down, ending at the skill's own domain. */
function domainPath(
    domain: ClaimView | null,
    tree: ReturnType<typeof useDomainTree>["tree"],
): string[] {
    if (domain === null) return [];
    const found = tree?.pathToRoot(domain.objectLabel ?? domain.object);
    return found?.found === true ? [...found.path].reverse() : [domain.object];
}

/**
 * Somebody else's figures: skills.sh's installs, GitHub's stars and last push. They change, so they
 * stay off the chain (`docs/20` §2), and each is named by its source.
 */
function ExternalSignals({view, source}: {view: AtomView; source: ClaimView | null}) {
    const {factFor, repoFactFor, measuredOn} = useSkillFacts();
    const installs = factFor(view.label)?.installs ?? null;
    const repo = repoFactFor(source?.objectLabel ?? null);
    const days = repo?.days ?? null;

    return (
        <Panel
            label="External signals"
            aside={
                <>
                    {measuredOn === null ? null : (
                        <span className="ml-auto normal-case tracking-[0.04em] text-[color:var(--color-steel)]">
                            {formatDay(measuredOn)}
                        </span>
                    )}
                </>
            }
        >
            <div className="grid grid-cols-3 gap-3 max-[520px]:grid-cols-2">
                <Signal
                    value={installs === null ? "—" : installs.toLocaleString("en-US")}
                    what="installs"
                    by="skills.sh"
                />
                <Signal
                    value={repo === null ? "—" : repo.stars.toLocaleString("en-US")}
                    what="stars"
                    by="GitHub"
                />
                <Signal
                    value={days === null ? "—" : `${days} ${days === 1 ? "day" : "days"}`}
                    what="since last push"
                    by="GitHub"
                />
            </div>
        </Panel>
    );
}

/** The chain ids behind every line above, for a reader who wants to check them. */
function Record({view, source}: {view: AtomView; source: ClaimView | null}) {
    const chain = useChainChoice();

    return (
        <Block title="On the record" label={chain.chain.name}>
            <div className="grid gap-x-10 [grid-template-columns:repeat(auto-fit,minmax(min(100%,24rem),1fr))]">
                <dl className="m-0">
                    {/* Ids open on Intuition's own explorer, on the chain the page reads, so a
                        reader can see the term outside ARP's rendering of it. */}
                    <RecordRow term="Atom">
                        <a
                            href={intuitionPortalUrl("atom", view.atomId, chain.isMainnet)}
                            target="_blank"
                            rel="noreferrer"
                            className={linkClass}
                        >
                            {view.atomId}
                        </a>
                    </RecordRow>
                    {view.url === null ? null : (
                        <RecordRow term="Identifies">
                            <a
                                href={view.url}
                                target="_blank"
                                rel="noreferrer"
                                className={linkClass}
                            >
                                {view.url}
                            </a>
                        </RecordRow>
                    )}
                    {source === null ? null : (
                        <RecordRow term="source">
                            {source.object} · triple{" "}
                            <a
                                href={intuitionPortalUrl(
                                    "triple",
                                    source.tripleId,
                                    chain.isMainnet,
                                )}
                                target="_blank"
                                rel="noreferrer"
                                className={linkClass}
                            >
                                {truncateMiddle(source.tripleId, 14, 16)}
                            </a>
                        </RecordRow>
                    )}
                </dl>
                <dl className="m-0">
                    {view.claims.length === 0 ? null : (
                        <RecordRow term="Written by">ARP&apos;s attestor</RecordRow>
                    )}
                </dl>
            </div>
        </Block>
    );
}
