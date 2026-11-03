import {useEffect, useState} from "react";
import {Link, useNavigate, useParams} from "react-router-dom";

import {Install} from "../components/atom/AtomPageParts";
import {BackLink} from "../components/brand/BackLink";
import {Hint} from "../components/brand/Hint";
import {useAgentActivity} from "../hooks/use-agent-activity";
import {useDomainTree} from "../hooks/use-domain-tree";
import {useListTool} from "../hooks/use-list-tool";
import {useProposeCategory} from "../hooks/use-propose-category";
import {controlClass, linkClass} from "../lib/control-class";
import {START_PATHS, isStartProfile, rememberProfile} from "../lib/start-paths";
import type {AgentFeed} from "../services/agent-feed";
import {DOMAIN_ROOT} from "../services/domain-filter";
import {listToolMessage} from "../services/list-tool";
import {proposeCategoryMessage} from "../services/propose-category";
import {stepsFor, type StartStep} from "../services/start-steps";

/**
 * `/start/<profile>`: one short path per profile, opened from scene 4 of `/` (task 53b, ADR
 * `0114`). The steps tick themselves from the local feed, so there is no account and nothing to
 * mark by hand.
 */
export function StartPage({feed}: {feed?: AgentFeed} = {}) {
    const {profile} = useParams();
    const activity = useAgentActivity(feed);
    const path = START_PATHS.find((candidate) => candidate.profile === profile);

    useEffect(() => {
        if (isStartProfile(profile)) rememberProfile(profile);
    }, [profile]);

    if (path === undefined) {
        return (
            <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-16">
                <BackLink to="/" label="home" />
                <h1 className="type-face text-[32px]">No path by that name</h1>
                <Link to="/" className={linkClass}>
                    Choose one on the home page →
                </Link>
            </main>
        );
    }

    const steps = stepsFor(path.profile, {feed: activity.status, events: activity.events});

    return (
        <main className="mx-auto flex max-w-3xl flex-col gap-10 px-6 py-16">
            <div className="flex flex-col gap-4">
                <BackLink to="/" label="home" />
                <h1 className="type-face text-[40px] leading-none">{path.title}</h1>
            </div>
            <ol className="flex flex-col border-t border-[color:var(--color-rule-strong)]">
                {steps.map((step, index) => (
                    <StepRow key={step.id} step={step} n={index + 1} />
                ))}
            </ol>
        </main>
    );
}

function StepRow({step, n}: {step: StartStep; n: number}) {
    return (
        <li className="grid grid-cols-[2rem_1fr_auto] items-baseline gap-x-4 border-b border-[color:var(--color-rule)] py-5">
            <span className="font-mono text-[length:var(--text-label)] text-[color:var(--color-steel)]">
                {n}
            </span>
            <div className="flex min-w-0 flex-col">
                <div className="flex items-center gap-2">
                    <h2 className="text-[17px] text-[color:var(--color-fg)]">{step.title}</h2>
                    {step.hint !== undefined && (
                        <Hint label={`About: ${step.title}`}>{step.hint}</Hint>
                    )}
                </div>
                {step.command !== undefined && <Install command={step.command} />}
                {step.prompt !== undefined && (
                    <p className="mt-4 border-l border-[color:var(--color-rule-strong)] pl-4 text-[15px] text-[color:var(--color-silver)]">
                        “{step.prompt}”
                    </p>
                )}
                {step.id === "find" && <FindTool />}
                {step.id === "add" && <AddTool />}
                {step.link !== undefined && (
                    <Link
                        to={step.link.to}
                        className={`mt-3 text-[length:var(--text-body-sm)] ${linkClass}`}
                    >
                        {step.link.label} →
                    </Link>
                )}
            </div>
            <StepState done={step.done} />
        </li>
    );
}

/** A word, not a colour alone: a done step reads "done" to a screen reader and in grey scale. */
function StepState({done}: {done: boolean | null}) {
    if (done === null) return <span />;
    return (
        <span
            className={`font-mono text-[length:var(--text-label)] uppercase tracking-[0.08em] ${
                done ? "text-[color:var(--color-fg)]" : "text-[color:var(--color-steel)]"
            }`}
        >
            {done ? "done" : "to do"}
        </span>
    );
}

function FindTool() {
    const navigate = useNavigate();
    const [url, setUrl] = useState("");
    return (
        <form
            className="mt-4 flex flex-col gap-2"
            onSubmit={(event) => {
                event.preventDefault();
                if (url.trim() === "") return;
                navigate(`/search?q=${encodeURIComponent(url.trim())}`);
            }}
        >
            <label
                htmlFor="start-tool-url"
                className="font-mono text-[length:var(--text-label)] uppercase tracking-[0.08em] text-[color:var(--color-steel)]"
            >
                Repository URL
            </label>
            <div className="flex gap-2">
                <input
                    id="start-tool-url"
                    value={url}
                    onChange={(event) => setUrl(event.target.value)}
                    placeholder="github.com/owner/repo"
                    className="min-w-0 flex-1 rounded-[var(--radius-control)] border border-[color:var(--color-rule-strong)] bg-[color:var(--color-bg)] px-3.5 py-2.5 font-mono text-[13px]"
                />
                <button type="submit" className={controlClass}>
                    Find
                </button>
            </div>
        </form>
    );
}

/** Path C's last step: ask the sponsor to list the URL, and say what it answered (task 53c). */
function AddTool() {
    const [url, setUrl] = useState("");
    const listing = useListTool();
    const result = listing.result;
    // The wallet path stays where the sponsor cannot help: none configured, not running, or a
    // refusal a retry will not change.
    const offerWallet =
        !listing.available ||
        result?.status === "unavailable" ||
        (result?.status === "refused" && !result.retry && result.rule !== "pending");
    const wallet = (
        <Link to="/register?what=tool" className={linkClass}>
            Add it with a wallet →
        </Link>
    );

    if (!listing.available)
        return <div className="mt-3 text-[length:var(--text-body-sm)]">{wallet}</div>;

    return (
        <>
            <form
                className="mt-4 flex flex-col gap-2"
                onSubmit={(event) => {
                    event.preventDefault();
                    if (url.trim() === "" || listing.pending) return;
                    listing.submit(url.trim());
                }}
            >
                <label
                    htmlFor="start-add-url"
                    className="font-mono text-[length:var(--text-label)] uppercase tracking-[0.08em] text-[color:var(--color-steel)]"
                >
                    Tool or skill URL
                </label>
                <div className="flex gap-2">
                    <input
                        id="start-add-url"
                        value={url}
                        onChange={(event) => setUrl(event.target.value)}
                        placeholder="github.com/owner/repo?skill=name"
                        className="min-w-0 flex-1 rounded-[var(--radius-control)] border border-[color:var(--color-rule-strong)] bg-[color:var(--color-bg)] px-3.5 py-2.5 font-mono text-[13px]"
                    />
                    <button type="submit" disabled={listing.pending} className={controlClass}>
                        Add it
                    </button>
                </div>
                <p
                    aria-live="polite"
                    className="min-h-5 text-[length:var(--text-body-sm)] text-[color:var(--color-silver)]"
                >
                    {listing.pending ? "Adding…" : result !== null && listToolMessage(result)}
                    {!listing.pending && result?.status === "listed" && (
                        <>
                            {" "}
                            <Link to={`/atom/${result.atomId}`} className={linkClass}>
                                Open its page →
                            </Link>
                        </>
                    )}
                    {!listing.pending && result !== null && offerWallet && <> {wallet}</>}
                </p>
            </form>
            {/* Its own form, after the listing: a tool added on the web is categorised here too, so
            the search can find it by what it is for (task 59, the user's decision of 2026-11-03). */}
            {!listing.pending && result?.status === "listed" && (
                <ChooseCategory subjectId={result.atomId} />
            )}
        </>
    );
}

const NONE_FITS = "__none-fits";

/** Tag the listed tool with an existing category, or file a new one under a parent (task 59). */
function ChooseCategory({subjectId}: {subjectId: string}) {
    const {options, error} = useDomainTree();
    const proposal = useProposeCategory();
    const [choice, setChoice] = useState("");
    const [label, setLabel] = useState("");
    const [parent, setParent] = useState("");
    const [reason, setReason] = useState("");
    const isNew = choice === NONE_FITS;
    const field =
        "min-w-0 rounded-[var(--radius-control)] border border-[color:var(--color-rule-strong)] bg-[color:var(--color-bg)] px-3.5 py-2.5 text-[14px]";
    const caption =
        "font-mono text-[length:var(--text-label)] uppercase tracking-[0.08em] text-[color:var(--color-steel)]";

    if (!proposal.available) return null;

    return (
        <form
            className="mt-6 flex flex-col gap-3 border-t border-[color:var(--color-rule)] pt-5"
            onSubmit={(event) => {
                event.preventDefault();
                if (proposal.pending || choice === "") return;
                proposal.submit(
                    isNew
                        ? {label: label.trim(), parent, reason: reason.trim(), subjectId}
                        : {label: choice, subjectId},
                );
            }}
        >
            <label htmlFor="start-category" className={caption}>
                Category
            </label>
            <select
                id="start-category"
                value={choice}
                onChange={(event) => setChoice(event.target.value)}
                className={field}
            >
                <option value="" disabled>
                    Choose one
                </option>
                {/* Sorted by label, not in tree order, so no indent: it would sit under the wrong parent. */}
                {options.map((option) => (
                    <option key={option.label} value={option.label}>
                        {option.label}
                    </option>
                ))}
                <option value={NONE_FITS}>None fits</option>
            </select>
            {isNew && (
                <>
                    <label htmlFor="start-category-new" className={caption}>
                        New category
                    </label>
                    <input
                        id="start-category-new"
                        value={label}
                        onChange={(event) => setLabel(event.target.value)}
                        placeholder="one word"
                        className={field}
                    />
                    <label htmlFor="start-category-parent" className={caption}>
                        Under
                    </label>
                    <select
                        id="start-category-parent"
                        value={parent}
                        onChange={(event) => setParent(event.target.value)}
                        className={field}
                    >
                        <option value="" disabled>
                            Choose its parent
                        </option>
                        {/* The root is a parent like any other: a new top-level category meets the
                        same rules here as through the MCP tool (`docs/25` §8). */}
                        <option value={DOMAIN_ROOT}>{DOMAIN_ROOT}</option>
                        {options.map((option) => (
                            <option key={option.label} value={option.label}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                    <label htmlFor="start-category-reason" className={caption}>
                        Why none fits
                    </label>
                    <input
                        id="start-category-reason"
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        className={field}
                    />
                </>
            )}
            <div>
                <button
                    type="submit"
                    disabled={proposal.pending || choice === ""}
                    className={controlClass}
                >
                    File it
                </button>
            </div>
            <p
                aria-live="polite"
                className="min-h-5 text-[length:var(--text-body-sm)] text-[color:var(--color-silver)]"
            >
                {proposal.pending
                    ? "Filing…"
                    : proposal.result !== null
                      ? proposeCategoryMessage(proposal.result)
                      : error !== null && "The categories could not be read."}
            </p>
        </form>
    );
}
