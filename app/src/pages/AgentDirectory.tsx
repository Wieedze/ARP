import {useId, useState} from "react";
import {Link, useNavigate} from "react-router-dom";

import {MainnetNotice} from "../components/agent/MainnetNotice";

/**
 * `/agents` — the way into the trust panel.
 *
 * Capability search across the cohort is the next phase, so this is a lookup
 * form and a short starting set. The set is labelled for what it is: three
 * agents chosen because they show different states of the trust layer, not
 * because they scored well. Calling it a ranking would be the first dishonest
 * thing on the page.
 */

const LOOKUP_CHAINS: {id: number; label: string; note: string}[] = [
    {id: 8453, label: "Base (8453)", note: "mirrored into the Intuition graph"},
    {id: 56, label: "BSC (56)", note: "registry only — no trust edges in the graph"},
    {id: 1, label: "Ethereum (1)", note: "registry only — no trust edges in the graph"},
];

const STARTING_SET: {chainId: number; tokenId: string; name: string; why: string}[] = [
    {
        chainId: 8453,
        tokenId: "6649",
        name: "Agent 8453:6649",
        why: "Registered with no metadata of its own, so the name above is the indexer's stand-in. One provider, and its score rests on two reviewers.",
    },
    {
        chainId: 8453,
        tokenId: "2340",
        name: "Clawnch",
        why: "Two providers — one signs its documents, one does not — and a fuller capability set than most of the cohort carries.",
    },
    {
        chainId: 8453,
        tokenId: "1380",
        name: "Captain Dackie",
        why: "Two providers, eighteen tags, and a score resting on 1,445 reviewers next to one resting on none. The widest evidence contrast here.",
    },
];

export function AgentDirectory() {
    const navigate = useNavigate();
    const fieldId = useId();
    const [chainId, setChainId] = useState(8453);
    const [tokenId, setTokenId] = useState("");

    const trimmed = tokenId.trim();
    const isValid = /^\d+$/.test(trimmed);

    function handleSubmit(event: React.FormEvent) {
        event.preventDefault();
        if (!isValid) return;
        navigate(`/agent/${chainId}/${trimmed}`);
    }

    return (
        <section>
            <MainnetNotice />

            <header className="mt-8 mb-10">
                <h1 className="text-[length:var(--text-display)] leading-[var(--leading-display)] tracking-tight font-semibold">
                    Agent trust panel
                </h1>
                <p className="mt-3 max-w-[64ch] text-[color:var(--color-fg-60)]">
                    28,648 ERC-8004 agents carry a trust score. Providers sign their assessments and
                    declare how long they stay valid, and no consumer checks either. Open one and
                    see what its rating is actually resting on.
                </p>
            </header>

            <form onSubmit={handleSubmit} className="max-w-[26rem]">
                <div>
                    <label
                        htmlFor={`${fieldId}-chain`}
                        className="block font-mono uppercase tracking-wider text-[length:var(--text-label)] text-[color:var(--color-fg-60)]"
                    >
                        Chain
                    </label>
                    <select
                        id={`${fieldId}-chain`}
                        value={chainId}
                        onChange={(event) => setChainId(Number(event.target.value))}
                        className="mt-2 block w-full bg-[color:var(--color-bg)] border border-[color:var(--color-border-strong)] px-3 py-1.5 font-mono text-[length:var(--text-body-sm)] focus:outline-none focus:border-[color:var(--color-accent)]"
                    >
                        {LOOKUP_CHAINS.map((chain) => (
                            <option key={chain.id} value={chain.id}>
                                {chain.label}
                            </option>
                        ))}
                    </select>
                    <p className="mt-2 text-[length:var(--text-body-sm)] text-[color:var(--color-fg-60)]">
                        {LOOKUP_CHAINS.find((chain) => chain.id === chainId)?.note}
                    </p>
                </div>

                <div className="mt-5">
                    <label
                        htmlFor={`${fieldId}-token`}
                        className="block font-mono uppercase tracking-wider text-[length:var(--text-label)] text-[color:var(--color-fg-60)]"
                    >
                        Token id
                    </label>
                    <input
                        id={`${fieldId}-token`}
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        value={tokenId}
                        onChange={(event) => setTokenId(event.target.value)}
                        className="mt-2 block w-full bg-transparent border border-[color:var(--color-border-strong)] px-3 py-1.5 font-mono focus:outline-none focus:border-[color:var(--color-accent)]"
                    />
                    {trimmed !== "" && !isValid ? (
                        <p className="mt-2 text-[length:var(--text-body-sm)]">
                            Token ids are decimal, for example 2340.
                        </p>
                    ) : null}
                </div>

                <button
                    type="submit"
                    disabled={!isValid}
                    className="mt-5 px-3 py-1.5 text-[length:var(--text-body-sm)] border border-[color:var(--color-border-strong)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-accent)] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    Open panel
                </button>
            </form>

            <section className="mt-16">
                <h2 className="font-medium">A starting set</h2>
                <p className="mt-1 mb-6 max-w-[64ch] text-[length:var(--text-body-sm)] text-[color:var(--color-fg-60)]">
                    Not a ranking, and not the best agents on the network — three that show
                    different states of the trust layer. Searching the cohort by what an agent can
                    actually do needs a capability index that does not exist yet; that is the next
                    phase of this work.
                </p>
                <ul className="border-t border-[color:var(--color-border)]">
                    {STARTING_SET.map((entry) => (
                        <li
                            key={`${entry.chainId}-${entry.tokenId}`}
                            className="border-b border-[color:var(--color-border)]"
                        >
                            <Link
                                to={`/agent/${entry.chainId}/${entry.tokenId}`}
                                className="py-4 grid sm:grid-cols-[12rem_1fr] gap-x-6 gap-y-1"
                            >
                                <span>
                                    <span className="block font-medium">{entry.name}</span>
                                    <span className="block font-mono text-[length:var(--text-body-sm)] text-[color:var(--color-fg-60)]">
                                        {entry.chainId}:{entry.tokenId}
                                    </span>
                                </span>
                                <span className="text-[length:var(--text-body-sm)] text-[color:var(--color-fg-60)] max-w-[64ch]">
                                    {entry.why}
                                </span>
                            </Link>
                        </li>
                    ))}
                </ul>
            </section>
        </section>
    );
}
