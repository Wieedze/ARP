import {lazy, Suspense, useEffect, useRef, useState, type ReactNode} from "react";
import {
    Link,
    useLocation,
    useNavigate,
    useNavigationType,
    useParams,
    useSearchParams,
} from "react-router-dom";

import {Install} from "../components/atom/AtomPageParts";
import {BackLink} from "../components/brand/BackLink";
import {Hint} from "../components/brand/Hint";
import {PageLoading} from "../components/brand/PageLoading";
import {useAgentActivity} from "../hooks/use-agent-activity";
import {controlClass, linkClass} from "../lib/control-class";
import {START_PATHS, isStartProfile, rememberProfile} from "../lib/start-paths";
import type {AgentFeed} from "../services/agent-feed";
import {useListTool} from "../hooks/use-list-tool";
import {listToolMessage} from "../services/list-tool";
import {stepsFor, type StartStep} from "../services/start-steps";

// The wallet forms carry wagmi's write path; a visitor on the sponsored path never loads them.
const AgentImport = lazy(() =>
    import("./AgentImport").then((module) => ({default: module.AgentImport})),
);
const MintIdentity = lazy(() =>
    import("./MintIdentity").then((module) => ({default: module.MintIdentity})),
);
const ToolRegister = lazy(() =>
    import("./ToolRegister").then((module) => ({default: module.ToolRegister})),
);

/** `?have=yes`: the agent already has an ERC-8004 id. `?with=wallet`: sign with one's own wallet. */
const HAVE_PARAM = "have";
const WITH_PARAM = "with";

/**
 * `/start/<profile>`: one short path per profile, opened from Get started (task 53b, ADR `0114`).
 * The steps tick themselves from the local feed, so there is no account and nothing to mark by hand.
 *
 * **The only door for putting an agent or a tool into ARP** (task 62, ADR `0125`). `/register` was
 * a second one that wrote the same atom and the same identity, and differed only in who paid; the
 * user, 2026-11-03: _« pourquoi garder register si on peut juste garder get started »_. So the
 * sponsored steps come first and the wallet forms it held are here, behind `?with=wallet`: the
 * sponsor pays on testnet 13579 only, and on mainnet the wallet is the only way in. Importing an id
 * that already exists is `?have=yes`, which replaces the steps because they would mint another.
 */
export function StartPage({feed}: {feed?: AgentFeed} = {}) {
    const {profile} = useParams();
    const [searchParams] = useSearchParams();
    const activity = useAgentActivity(feed);
    const path = START_PATHS.find((candidate) => candidate.profile === profile);
    const hasId = path?.profile === "agent" && searchParams.get(HAVE_PARAM) === "yes";
    const withWallet = searchParams.get(WITH_PARAM) === "wallet";
    // A form opened from this page takes the focus, since the link that opened it is gone. Decided
    // from the navigation and not from mount: `RouteTransition` remounts the page on every push, so
    // a first-render flag cannot tell the link from a fresh load. Back and Forward do not take it.
    const location = useLocation();
    const takeFocus = useNavigationType() !== "POP" && opensWallet(location.state);

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
            {path.profile === "agent" && <HasId hasId={hasId} />}
            {hasId ? (
                <Suspense fallback={<PageLoading label="the form" />}>
                    <AgentImport />
                </Suspense>
            ) : (
                <>
                    <ol className="flex flex-col border-t border-[color:var(--color-rule-strong)]">
                        {steps.map((step, index) => (
                            <StepRow key={step.id} step={step} n={index + 1} />
                        ))}
                    </ol>
                    {path.profile === "agent" && !withWallet && (
                        <WalletLink>Mint with a wallet instead</WalletLink>
                    )}
                </>
            )}
            {withWallet && !hasId && path.profile !== "claude" && (
                <WalletSection
                    title={path.profile === "agent" ? undefined : "Add it with a wallet"}
                    takeFocus={takeFocus}
                >
                    {path.profile === "agent" ? <MintIdentity /> : <ToolRegister />}
                </WalletSection>
            )}
        </main>
    );
}

/**
 * The question that decides between minting and importing. Unanswered, the steps show: most agents
 * arriving here have no id yet, and the steps are the free way to get one.
 */
function HasId({hasId}: {hasId: boolean}) {
    const [, setSearchParams] = useSearchParams();
    // `push`, not `replace`: picking a branch is going somewhere, and Back returns to the question.
    // `with` is dropped: the wallet form belongs to the branch that was left.
    const choose = (yes: boolean) =>
        setSearchParams(yes ? new URLSearchParams({[HAVE_PARAM]: "yes"}) : new URLSearchParams());
    return (
        <fieldset className="m-0 border-0 p-0">
            <legend className="text-[length:var(--text-body)] font-medium">
                Does your agent already have an ERC-8004 id?
            </legend>
            <div className="mt-4 flex flex-wrap gap-3">
                <Choice selected={hasId} onClick={() => choose(true)}>
                    Yes, it has one
                </Choice>
                <Choice selected={!hasId} onClick={() => choose(false)}>
                    No
                </Choice>
            </div>
        </fieldset>
    );
}

function Choice({
    selected,
    onClick,
    children,
}: {
    selected: boolean;
    onClick: () => void;
    children: ReactNode;
}) {
    return (
        <button
            type="button"
            aria-pressed={selected}
            onClick={onClick}
            // Banged: `index.css`'s unlayered `button { border; color }` beats any `@layer
            // utilities` rule, so an unbanged selected state renders identically to an unselected
            // one. The full list of base-layer rules this collides with is in `lib/control-class`.
            className={`px-4 py-2 text-[length:var(--text-body-sm)] ${
                selected
                    ? "border-[color:var(--color-accent)]! text-[color:var(--color-accent)]!"
                    : "border-[color:var(--color-rule-strong)]! text-[color:var(--color-fg)]!"
            }`}
        >
            {children}
        </button>
    );
}

/**
 * The wallet form, under the steps. `title` is for a form with no heading of its own: `MintIdentity`
 * carries one, `ToolRegister` does not.
 */
function WalletSection({
    title,
    takeFocus,
    children,
}: {
    title?: string;
    takeFocus: boolean;
    children: ReactNode;
}) {
    const section = useRef<HTMLElement>(null);
    useEffect(() => {
        if (takeFocus) section.current?.focus();
    }, [takeFocus]);
    return (
        <section
            ref={section}
            tabIndex={-1}
            {...(title === undefined ? {} : {"aria-labelledby": "start-wallet"})}
            className="flex flex-col gap-6 border-t border-[color:var(--color-rule)] pt-10"
        >
            {title !== undefined && (
                <h2 id="start-wallet" className="type-face text-[28px] leading-none">
                    {title}
                </h2>
            )}
            <Suspense fallback={<PageLoading label="the form" />}>{children}</Suspense>
        </section>
    );
}

/** The navigation state `WalletLink` sets; a fresh load carries none. */
function opensWallet(state: unknown): boolean {
    return typeof state === "object" && state !== null && "focusWallet" in state;
}

/** Opens the wallet form on this page, keeping the rest of the query. */
function WalletLink({children}: {children: ReactNode}) {
    const [searchParams] = useSearchParams();
    const next = new URLSearchParams(searchParams);
    next.set(WITH_PARAM, "wallet");
    return (
        <Link
            to={{search: next.toString()}}
            state={{focusWallet: true}}
            className={`text-[length:var(--text-body-sm)] ${linkClass}`}
        >
            {children} →
        </Link>
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
    const wallet = <WalletLink>Add it with a wallet</WalletLink>;

    if (!listing.available)
        return <div className="mt-3 text-[length:var(--text-body-sm)]">{wallet}</div>;

    return (
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
    );
}
