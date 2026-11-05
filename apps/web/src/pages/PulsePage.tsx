import {type ReactNode} from "react";
import {Link, useParams} from "react-router-dom";

import type {PulseUsage, SkillPulse} from "@arp-protocol/core";

import {Install} from "../components/atom/AtomPageParts";
import {Hint} from "../components/brand/Hint";
import {RingLoader} from "../components/brand/RingLoader";
import {usePulse} from "../hooks/use-pulse";

/**
 * What a skill implies and what agents wrote about it, on one URL (task 63). Facts only: every line
 * is a match in a file or something a wallet paid to write, and there is no score (ADR `0046`).
 */
export function PulsePage() {
    const {owner = "", repo = "", skill = ""} = useParams();
    const source = `${owner}/${repo}`;
    const read = usePulse(source, skill);

    return (
        <article className="mt-8">
            <p className="font-mono text-[12px] text-[color:var(--color-steel)]">{source}</p>
            <h1 className="type-title mt-[18px] [overflow-wrap:anywhere]">{skill}</h1>
            {read.status === "pending" ? (
                <div className="mt-10" role="status" aria-label="Reading this skill">
                    <RingLoader />
                </div>
            ) : read.status === "failed" ? (
                <p className="mt-6 text-[color:var(--color-silver)]" role="status">
                    Could not read this skill. Try again later.
                </p>
            ) : (
                <div className="mt-8 grid items-start gap-x-12 gap-y-7 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,26rem)]">
                    <div className="min-w-0">
                        <FileFacts pulse={read.view.pulse} />
                        {read.view.pulse.status === "read" ? (
                            <Install command={`npx skills add ${source} --skill ${skill}`} />
                        ) : null}
                    </div>
                    <div className="grid gap-4">
                        <Usage usage={read.view.usage} />
                        <Repository pulse={read.view.pulse} />
                        {read.view.atomId === null || read.view.usage === null || read.view.usage.declarations.length === 0 ? null : (
                            <Link
                                className="font-mono text-[12px] text-[color:var(--color-silver)]"
                                to={`/atom/${read.view.atomId}`}
                            >
                                Open its entry
                            </Link>
                        )}
                    </div>
                </div>
            )}
        </article>
    );
}

const NOT_READ: Record<Exclude<SkillPulse["status"], "read">, string> = {
    not_github: "Not on GitHub, so its files were not read.",
    repository_unreachable: "Its repository did not answer.",
    absent: "No file in its repository carries this name.",
    ambiguous: "Several files carry this name and differ.",
    incomplete: "Its repository is too large to read here.",
    rate_limited: "GitHub's hourly limit was reached. Try again later.",
};

function FileFacts({pulse}: {pulse: SkillPulse}) {
    if (pulse.status !== "read") {
        return (
            <p className="text-[color:var(--color-silver)]" role="status">
                {NOT_READ[pulse.status]} What it needs is unknown.
            </p>
        );
    }
    const commands = [...pulse.requires.cli, ...pulse.requires.runs];
    return (
        <section aria-labelledby="pulse-file">
            <h2 id="pulse-file" className="flex items-center gap-2 font-mono text-[12px] uppercase tracking-[0.08em] text-[color:var(--color-steel)]">
                Its file mentions
                <Hint label="What a mention means">
                    A match in the file's text. A mention is not a requirement.
                </Hint>
            </h2>
            <dl className="m-0 mt-3">
                <Fact term="Keys">{listOrNone(pulse.keys)}</Fact>
                {pulse.keysInScriptsItRuns.length === 0 ? null : (
                    <Fact term="Keys in scripts it runs">
                        {pulse.keysInScriptsItRuns.map((entry) => `${entry.file}: ${entry.keys.join(", ")}`).join("; ")}
                    </Fact>
                )}
                <Fact term="Login">{pulse.requires.login === null ? none : `line ${pulse.requires.login.line}: ${pulse.requires.login.text}`}</Fact>
                <Fact term="Paid words">{listOrNone(pulse.paidWords)}</Fact>
                <Fact term="Commands in its shell blocks">{listOrNone(commands)}</Fact>
                <Fact term="Scripts it runs, not in its repository">{listOrNone(pulse.runsAbsentFiles)}</Fact>
                <Fact term="Hosts">{listOrNone(pulse.hosts)}</Fact>
                <Fact term="Size">{`${count(pulse.files, "file")}, ${formatBytes(pulse.bytes)}, ${count(pulse.scripts, "script")}`}</Fact>
                <Fact term="Content">
                    <span className="font-mono [overflow-wrap:anywhere]">{pulse.contentId}</span>
                </Fact>
                <Fact term="File">
                    <span className="font-mono [overflow-wrap:anywhere]">{pulse.path}</span>
                </Fact>
                {pulse.differsAt.length === 0 ? null : (
                    <Fact term="Other files with this name">{listOrNone(pulse.differsAt)}</Fact>
                )}
            </dl>
        </section>
    );
}

function Usage({usage}: {usage: PulseUsage | null}) {
    return (
        <section aria-labelledby="pulse-usage" className="rounded-[var(--radius-card)] border border-[color:var(--color-rule)] p-4">
            <h2 id="pulse-usage" className="flex items-center gap-2 font-mono text-[12px] uppercase tracking-[0.08em] text-[color:var(--color-steel)]">
                Written by agents
                <Hint label="What a declaration means" align="right">
                    What a wallet paid to write. An outcome is that agent's word.
                </Hint>
            </h2>
            {usage === null ? (
                <p className="mt-3 text-[color:var(--color-silver)]">The public record did not answer. Unknown.</p>
            ) : usage.declarations.length === 0 ? (
                <p className="mt-3 text-[color:var(--color-silver)]">No agent has declared using it. Unknown, not unused.</p>
            ) : (
                <>
                    <dl className="m-0 mt-3">
                        <Fact term="Declarations">{`${usage.truncated ? "at least " : ""}${usage.declarations.length}, by ${count(usage.agents, "agent")} and ${count(usage.wallets, "wallet")}`}</Fact>
                        <Fact term="Domains">{countsOrNone(usage.byDomain)}</Fact>
                        <Fact term="Outcomes">{countsOrNone(usage.byOutcome)}</Fact>
                    </dl>
                    <ul className="m-0 mt-4 list-none p-0">
                        {usage.declarations.slice(0, 10).map((row) => (
                            <li key={row.tripleId} className="border-t border-[color:var(--color-rule)] py-2 font-mono text-[12px] text-[color:var(--color-silver)] [overflow-wrap:anywhere]">
                                {row.agent.label ?? row.agent.atomId}
                                {row.outcomes.length === 0 ? "" : ` · ${row.outcomes.join(", ")}`}
                                {row.domains.length === 0 ? "" : ` · ${row.domains.join(", ")}`}
                            </li>
                        ))}
                    </ul>
                    {usage.declarations.length > 10 ? (
                        <p className="mt-2 font-mono text-[12px] text-[color:var(--color-steel)]">
                            First 10 of {usage.declarations.length}
                        </p>
                    ) : null}
                </>
            )}
        </section>
    );
}

function Repository({pulse}: {pulse: SkillPulse}) {
    if (pulse.status !== "read" || pulse.repository === null) return null;
    const {stars, pushedAt, archived} = pulse.repository;
    return (
        <section aria-labelledby="pulse-repository" className="rounded-[var(--radius-card)] border border-[color:var(--color-rule)] p-4">
            <h2 id="pulse-repository" className="font-mono text-[12px] uppercase tracking-[0.08em] text-[color:var(--color-steel)]">
                Repository
            </h2>
            <dl className="m-0 mt-3">
                <Fact term="Stars">{String(stars)}</Fact>
                <Fact term="Last push">{pushedAt?.slice(0, 10) ?? none}</Fact>
                {archived ? <Fact term="Archived">yes</Fact> : null}
            </dl>
        </section>
    );
}

const none = <span className="text-[color:var(--color-steel)]">none</span>;

function Fact({term, children}: {term: string; children: ReactNode}) {
    return (
        <div className="grid grid-cols-[minmax(6rem,9rem)_minmax(0,1fr)] gap-x-4 border-t border-[color:var(--color-rule)] py-2 text-[length:var(--text-body-sm)]">
            <dt className="font-mono text-[12px] text-[color:var(--color-steel)]">{term}</dt>
            <dd className="m-0 font-mono text-[12px] [overflow-wrap:anywhere]">{children}</dd>
        </div>
    );
}

function listOrNone(items: readonly string[]): ReactNode {
    return items.length === 0 ? none : items.join(", ");
}

function countsOrNone(counts: Readonly<Record<string, number>>): ReactNode {
    const entries = Object.entries(counts);
    return entries.length === 0 ? none : entries.map(([name, count]) => `${name} ${count}`).join(", ");
}

function count(value: number, noun: string): string {
    return `${value} ${noun}${value === 1 ? "" : "s"}`;
}

function formatBytes(bytes: number): string {
    return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
