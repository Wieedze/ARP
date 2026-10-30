import {Link} from "react-router-dom";
import type {Hex} from "viem";

import {Block, ClsRow, Install, Panel, RecordRow, Signal} from "../components/atom/AtomPageParts";
import {ClaimField} from "../components/atom/ClaimField";
import {Group} from "../components/atom/ClaimList";
import {Hint} from "../components/brand/Hint";
import {AtomMarket} from "../components/market/AtomMarket";
import {useSkillFacts, type RepoFact} from "../hooks/use-skill-facts";
import {useToolCatalog} from "../hooks/use-tool-catalog";
import {formatDay, githubApiUrlOf, LABEL} from "../lib/atom-page";
import {useChainChoice} from "../lib/chain-choice";
import {linkClass} from "../lib/control-class";
import {actionCardClass} from "../lib/surface-class";
import {parseToolLabel} from "../lib/tool-label";
import {LIVENESS_OBJECTS, type AtomView, type GroupView} from "../services/atom-standing-view";
import {samePackAs} from "../services/repo-pack";
import {TOOL_CURVES} from "../services/tool-catalog";
import {intuitionPortalUrl} from "../services/trust-format";

/**
 * `/atom/:atomId` when the atom is a repository: `github.com/<owner>/<repo>`, the object of its
 * skills' `source` edges.
 *
 * The build contract is `arp-pages/repo/REPO-PAGE.md`. Top to bottom: the repository, what is
 * written about it and measured about it, its own market, the skills it publishes, the other
 * repositories that publish the same pack (only when there are any), every other claim about it,
 * and the record.
 *
 * Two markets, never summed: the repository's vault, and its skills'. Stars and installs are
 * labelled with their source, and the skill list is ordered by installs, the one order that is not
 * ARP's to choose (ADR `0046`).
 */
export function RepoPage({
    view,
    atomId,
    modules,
}: {
    view: AtomView;
    atomId: Hex;
    modules: Record<string, string[]>;
}) {
    const parsed = view.label === null ? null : parseToolLabel(view.label);
    const owner = parsed?.kind === "repo" ? parsed.owner : null;
    const name = parsed?.kind === "repo" ? parsed.repo : view.title;
    const repo = owner === null ? view.title : `${owner}/${name}`;
    const host = parsed?.kind === "repo" ? parsed.host : null;
    // Its skills are the claims pointing at it by `source`; every other claim goes to Relations.
    const sourceGroup = view.groups.find((group) => group.label === "source") ?? null;
    const others = view.groups.filter((group) => group !== sourceGroup);
    const skills = useSkillRows(sourceGroup);
    const {repoFactFor} = useSkillFacts();
    const fact = repoFactFor(view.label);

    return (
        <article className="mt-8">
            <header>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 font-mono text-[12px] text-[color:var(--color-steel)]">
                    <span className="rounded-[var(--radius-tag)] border border-[color:var(--color-rule-strong)] px-[7px] py-[2px] text-[10px] uppercase tracking-[0.1em] text-[color:var(--color-fg)]">
                        Repository
                    </span>
                    {view.browseUrl === null || host === null ? null : (
                        <a
                            href={view.browseUrl}
                            target="_blank"
                            rel="noreferrer"
                            className={linkClass}
                        >
                            {`${host} ↗`}
                        </a>
                    )}
                </div>
                <h1 className="type-title mt-[18px] [overflow-wrap:anywhere]">
                    {owner === null ? (
                        name
                    ) : (
                        <>
                            <span className="text-[color:var(--color-steel)]">{owner}</span>
                            <span
                                aria-hidden="true"
                                className="mx-[0.04em] font-normal text-[color:var(--color-grey)]"
                            >
                                /
                            </span>
                            {name}
                        </>
                    )}
                </h1>

                <div className="mt-6 grid items-start gap-x-12 gap-y-7 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,26rem)]">
                    <div className="min-w-0">
                        {fact === null || fact.description === null ? null : (
                            <p className="max-w-[46rem] border-t border-[color:var(--color-rule-strong)] pt-3.5 text-[clamp(20px,2.4vw,26px)] leading-[1.3] [text-wrap:balance]">
                                {fact.description}
                            </p>
                        )}
                        {owner === null ? null : <Install command={`npx skills add ${repo}`} />}
                    </div>
                    <div className="grid gap-4 max-lg:[grid-template-columns:repeat(auto-fit,minmax(min(100%,22rem),1fr))]">
                        <Classification view={view} skills={skills} fact={fact} />
                        <ExternalSignals fact={fact} skills={skills} />
                    </div>
                </div>
            </header>

            <div className={`mt-14 ${actionCardClass}`}>
                <AtomMarket
                    atomTermId={atomId}
                    name={repo}
                    nameIsId={false}
                    backHeading="Take a position"
                    heading={null}
                />
            </div>

            {skills.length === 0 ? null : <Skills rows={skills} />}

            {owner === null ? null : <SamePack repo={repo} />}

            <Block title="Relations" label="Claims about this repository, besides its skills">
                <ClaimField
                    groups={others}
                    subject={repo}
                    edgeCount={others.reduce((sum, group) => sum + group.rows.length, 0)}
                    truncated={view.truncated}
                />
                {others.length === 0 ? null : (
                    <div className="mt-10">
                        {others.map((group) => (
                            <Group
                                key={group.predicateAtomId}
                                group={group}
                                subject={repo}
                                modules={modules}
                            />
                        ))}
                    </div>
                )}
            </Block>

            <Record view={view} skills={skills} />
        </article>
    );
}

type SkillRow = {
    atomId: string;
    name: string;
    label: string | null;
    description: string | null;
    domain: string | null;
    installs: number | null;
    declarations: number;
    behind: string | null;
};

/**
 * One row per skill pointing here by `source`, with what is known about each: skills.sh's
 * description and installs, ARP's domain tag, and the agents that declared using it.
 *
 * The agent figures come from the tools catalogue's read, which already holds every skill's
 * declarations; one standing read per skill would be up to 71 requests for one page.
 */
function useSkillRows(group: GroupView | null): SkillRow[] {
    const {factFor, catalogueFor} = useSkillFacts();
    const catalogue = useToolCatalog("conviction", TOOL_CURVES[0]?.id ?? 1);
    const usage = new Map(
        (catalogue.data?.rows ?? []).map((row) => [row.key.toLowerCase(), row] as const),
    );
    const rows = (group?.rows ?? []).map((row): SkillRow => {
        const used = usage.get(row.subjectAtomId.toLowerCase());
        return {
            atomId: row.subjectAtomId,
            name: row.name,
            label: row.label,
            description: factFor(row.label)?.description ?? null,
            domain: catalogueFor(row.label)?.domain ?? null,
            installs: factFor(row.label)?.installs ?? null,
            declarations: used?.declarations ?? 0,
            behind: used === undefined || used.declarations === 0 ? null : used.supportTrust,
        };
    });
    return rows.sort((a, b) => (b.installs ?? -1) - (a.installs ?? -1));
}

function Classification({
    view,
    skills,
    fact,
}: {
    view: AtomView;
    skills: readonly SkillRow[];
    fact: RepoFact | null;
}) {
    const liveness =
        view.claims.find((claim) => LIVENESS_OBJECTS.has(claim.objectLabel ?? "")) ?? null;
    const evidenceUrl = githubApiUrlOf(view.label);
    const byDomain = new Map<string, number>();
    let untagged = 0;
    for (const skill of skills) {
        if (skill.domain === null) untagged += 1;
        else byDomain.set(skill.domain, (byDomain.get(skill.domain) ?? 0) + 1);
    }
    const domains = [...byDomain].sort((a, b) => b[1] - a[1]);

    return (
        <Panel label="Classification">
            <dl className="m-0">
                <ClsRow term="Repository">
                    {fact !== null && (fact.archived || fact.gone) ? (
                        <State tone="alarm" href={evidenceUrl}>
                            {fact.gone ? "gone" : "archived"}
                        </State>
                    ) : liveness === null ? (
                        <span className="text-[color:var(--color-steel)]">no verdict</span>
                    ) : (
                        <State tone="accent" href={evidenceUrl}>
                            {liveness.object}
                        </State>
                    )}
                </ClsRow>
                <ClsRow term="Skills">
                    <span className="tabular-nums">{skills.length}</span>{" "}
                    <span className="text-[color:var(--color-steel)]">
                        on chain, each pointing here by source
                    </span>
                </ClsRow>
                {skills.length === 0 ? null : (
                    <ClsRow term="Domains">
                        <span className="flex flex-wrap gap-1.5">
                            {domains.map(([domain, count]) => (
                                <DomainChip key={domain} label={domain} count={count} />
                            ))}
                            {untagged === 0 ? null : (
                                <DomainChip label="no tag" count={untagged} dashed />
                            )}
                        </span>
                    </ClsRow>
                )}
            </dl>
        </Panel>
    );
}

/** A dot and a word, linked to the request the verdict rests on so a reader can repeat it. */
function State({
    tone,
    href,
    children,
}: {
    tone: "accent" | "alarm";
    href: string | null;
    children: React.ReactNode;
}) {
    return (
        <span className="inline-flex items-center gap-[7px]">
            <span
                aria-hidden="true"
                className={`h-[7px] w-[7px] rounded-full ${
                    tone === "accent"
                        ? "bg-[color:var(--color-accent)]"
                        : "bg-[color:var(--color-alarm)]"
                }`}
            />
            {href === null ? (
                children
            ) : (
                <a href={href} target="_blank" rel="noreferrer" className={linkClass}>
                    {children} ↗
                </a>
            )}
        </span>
    );
}

/**
 * A domain and how many of the repository's skills carry it. `no tag` is dashed: those skills
 * matched no keyword, and the abstention is deliberate (`docs/20` §2).
 */
function DomainChip({
    label,
    count,
    dashed = false,
}: {
    label: string;
    count?: number;
    dashed?: boolean;
}) {
    return (
        <span
            className={`inline-flex h-6 items-center gap-1.5 rounded-[var(--radius-tag)] border border-[color:var(--color-rule)] px-[9px] font-mono text-[12px] ${
                dashed ? "border-dashed text-[color:var(--color-steel)]" : ""
            }`}
        >
            {label}
            {count === undefined ? null : (
                <b className="font-medium text-[color:var(--color-steel)]">{count}</b>
            )}
        </span>
    );
}

/** GitHub's figures for the repository, and skills.sh's installs summed over its skills. */
function ExternalSignals({fact, skills}: {fact: RepoFact | null; skills: readonly SkillRow[]}) {
    const {measuredOn} = useSkillFacts();
    // One source, one unit, one repository: a sum that means something. Never across sources.
    const known = skills.filter((skill) => skill.installs !== null);
    const installs = known.reduce((sum, skill) => sum + (skill.installs ?? 0), 0);
    const days = fact?.days ?? null;
    return (
        <Panel
            label="External signals"
            aside={
                measuredOn === null ? null : (
                    <span className="ml-auto normal-case tracking-[0.04em] text-[color:var(--color-steel)]">
                        {formatDay(measuredOn)}
                    </span>
                )
            }
        >
            <div className="grid grid-cols-3 gap-3 max-[520px]:grid-cols-2">
                <Signal
                    value={fact === null ? "—" : fact.stars.toLocaleString("en-US")}
                    what="stars"
                    by="GitHub"
                />
                <Signal
                    value={days === null ? "—" : `${days} ${days === 1 ? "day" : "days"}`}
                    what="since last push"
                    by="GitHub"
                />
                <Signal
                    value={known.length === 0 ? "—" : installs.toLocaleString("en-US")}
                    what="installs, all skills"
                    by="skills.sh"
                />
            </div>
        </Panel>
    );
}

// No alignment in the base: `text-left` added to a class carrying `text-right` loses to whichever
// Tailwind emits later, which put the first column on the right. Each cell says its own.
const TH =
    "whitespace-nowrap border-b border-[color:var(--color-rule-strong)] px-3 pb-2.5 font-mono text-[10px] font-normal uppercase tracking-[0.08em] text-[color:var(--color-steel)] first:pl-0";
const TD =
    "whitespace-nowrap border-b border-[color:var(--color-rule)] p-3 font-mono tabular-nums first:pl-0";

function Skills({rows}: {rows: readonly SkillRow[]}) {
    const chain = useChainChoice();
    const max = rows.reduce((top, row) => Math.max(top, row.installs ?? 0), 0);
    return (
        <Block
            title={`${rows.length} ${rows.length === 1 ? "skill" : "skills"}`}
            label="Ordered by skills.sh installs"
        >
            {/* The table scrolls inside its own box at phone width; the page never does. */}
            <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] border-collapse text-[13.5px]">
                    <thead>
                        <tr>
                            <th className={`${TH} text-left`}>Skill</th>
                            <th className={`${TH} text-left`}>Description</th>
                            <th className={`${TH} text-left`}>Domain</th>
                            <th className={`${TH} text-right`}>Agents using</th>
                            <th className={`${TH} text-right`}>Behind it</th>
                            <th className={`${TH} text-right`}>
                                Installs
                                <span className="block text-[9px] normal-case tracking-[0.04em]">
                                    skills.sh
                                </span>
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row) => (
                            <tr key={row.atomId}>
                                <td className={`${TD} text-left`}>
                                    <Link to={`/atom/${row.atomId}`} className={linkClass}>
                                        {row.name}
                                    </Link>
                                </td>
                                <td className="min-w-[16rem] max-w-[30rem] border-b border-[color:var(--color-rule)] p-3 text-left text-[color:var(--color-silver)]">
                                    {row.description ?? ""}
                                </td>
                                <td className={`${TD} text-left`}>
                                    {row.domain === null ? (
                                        <DomainChip label="no tag" dashed />
                                    ) : (
                                        <DomainChip label={row.domain} />
                                    )}
                                </td>
                                <td className={`${TD} text-right`}>
                                    {row.declarations === 0 ? (
                                        <span className="text-[color:var(--color-steel)]">0</span>
                                    ) : (
                                        row.declarations
                                    )}
                                </td>
                                <td className={`${TD} text-right`}>
                                    {row.behind === null ? (
                                        <span className="text-[color:var(--color-steel)]">
                                            nothing
                                        </span>
                                    ) : (
                                        `${row.behind} ${chain.symbol}`
                                    )}
                                </td>
                                <td className={`${TD} text-right`}>
                                    <span className="flex items-center justify-end gap-2.5">
                                        {row.installs === null
                                            ? "—"
                                            : row.installs.toLocaleString("en-US")}
                                        <span
                                            aria-hidden="true"
                                            className="block h-1 w-[90px] overflow-hidden rounded-full bg-[color:var(--color-raised-2)]"
                                        >
                                            <span
                                                className="block h-full bg-[color:var(--color-steel)]"
                                                style={{
                                                    width: `${max === 0 || row.installs === null ? 0 : (row.installs / max) * 100}%`,
                                                }}
                                            />
                                        </span>
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </Block>
    );
}

/**
 * The other repositories publishing this exact pack, only when there are any. The figures are
 * GitHub's and skills.sh's, each over the whole pack; nothing here says which came first.
 */
function SamePack({repo}: {repo: string}) {
    const {skillLabels, factFor, repoFactFor} = useSkillFacts();
    const others = samePackAs(repo, skillLabels, (label) => factFor(label)?.description ?? null);
    if (others.length === 0) return null;

    const installsOf = (pack: string) =>
        skillLabels
            .filter((label) => label.startsWith(`github.com/${pack}?skill=`))
            .reduce((sum, label) => sum + (factFor(label)?.installs ?? 0), 0);
    const size = skillLabels.filter((label) =>
        label.startsWith(`github.com/${repo}?skill=`),
    ).length;
    const here = installsOf(repo);
    const elsewhere = others.reduce((sum, pack) => sum + installsOf(pack), 0);
    const all = [repo, ...others];

    return (
        <section className="mt-[72px]">
            <div className="mb-[22px] flex flex-wrap items-center gap-2 border-b border-[color:var(--color-rule-strong)] pb-3">
                <h2 className="text-[22px] font-bold tracking-[-0.01em]">
                    {`The same ${size} skills, in ${others.length} other ${others.length === 1 ? "repository" : "repositories"}`}
                </h2>
                <Hint label="How this is matched">
                    Every skill name and every description match. ARP does not say which repository
                    came first.
                </Hint>
            </div>
            <div className="mb-[18px] flex flex-wrap gap-x-9 gap-y-3">
                <Signal value={String(all.length)} what="repositories, one pack" by="catalogue" />
                <Signal value={here.toLocaleString("en-US")} what="installs here" by="skills.sh" />
                <Signal
                    value={elsewhere.toLocaleString("en-US")}
                    what="installs in the others"
                    by="skills.sh"
                />
            </div>
            <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] border-collapse text-[13.5px]">
                    <thead>
                        <tr>
                            <th className={`${TH} text-left`}>Repository</th>
                            <th className={`${TH} text-right`}>Stars · GitHub</th>
                            <th className={`${TH} text-right`}>Last push · GitHub</th>
                            <th
                                className={`${TH} text-right`}
                            >{`Installs, all ${size} · skills.sh`}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {all.map((pack) => {
                            const fact = repoFactFor(`github.com/${pack}`);
                            const isHere = pack === repo;
                            return (
                                <tr
                                    key={pack}
                                    className={
                                        isHere ? "bg-[color:var(--color-raised)]" : undefined
                                    }
                                >
                                    <td className={`${TD} text-left`}>
                                        <a
                                            href={`https://github.com/${pack}`}
                                            target="_blank"
                                            rel="noreferrer"
                                            className={linkClass}
                                        >
                                            {pack}
                                        </a>
                                        {isHere ? (
                                            <span className={`${LABEL} ml-2.5 text-[9.5px]`}>
                                                this page
                                            </span>
                                        ) : null}
                                    </td>
                                    <td className={`${TD} text-right`}>
                                        {fact === null ? "—" : fact.stars.toLocaleString("en-US")}
                                    </td>
                                    <td className={`${TD} text-right`}>
                                        {fact === null || fact.days === null
                                            ? "—"
                                            : `${fact.days}d ago`}
                                    </td>
                                    <td className={`${TD} text-right`}>
                                        {installsOf(pack).toLocaleString("en-US")}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </section>
    );
}

function Record({view, skills}: {view: AtomView; skills: readonly SkillRow[]}) {
    const chain = useChainChoice();
    const tagged = skills.filter((skill) => skill.domain !== null).length;
    return (
        <Block title="On the record" label={chain.chain.name}>
            <div className="grid gap-x-10 [grid-template-columns:repeat(auto-fit,minmax(min(100%,24rem),1fr))]">
                <dl className="m-0">
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
                </dl>
                <dl className="m-0">
                    <RecordRow term="source">{`${skills.length} skills point here`}</RecordRow>
                    {skills.length === 0 ? null : (
                        <RecordRow term="Domain tags">{`${tagged} of ${skills.length} skills`}</RecordRow>
                    )}
                    {view.claims.length === 0 ? null : (
                        <RecordRow term="Written by">ARP&apos;s attestor</RecordRow>
                    )}
                </dl>
            </div>
        </Block>
    );
}
