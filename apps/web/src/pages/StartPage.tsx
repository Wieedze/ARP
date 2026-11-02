import {useEffect, useState} from "react";
import {Link, useNavigate, useParams} from "react-router-dom";

import {Install} from "../components/atom/AtomPageParts";
import {BackLink} from "../components/brand/BackLink";
import {Hint} from "../components/brand/Hint";
import {useAgentActivity} from "../hooks/use-agent-activity";
import {controlClass, linkClass} from "../lib/control-class";
import {START_PATHS, isStartProfile, rememberProfile} from "../lib/start-paths";
import type {AgentFeed} from "../services/agent-feed";
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
