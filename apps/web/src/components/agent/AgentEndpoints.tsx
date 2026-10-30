import type {DeclaredEndpoint} from "@arp-protocol/core";

import {useAgentEndpoints} from "../../hooks/use-agent-endpoints";
import {linkClass} from "../../lib/control-class";
import {Hint} from "../brand/Hint";

/**
 * The ways in an agent published for itself — **declared, never probed**.
 *
 * `docs/12`: _"ARP verifies an endpoint; the operator provides it."_ This is the second half, and
 * only the second half. Nothing here makes a request to an agent's endpoint, so nothing here says
 * whether one answers — that is `verify/probe.ts`, which cannot run in a browser: it would be every
 * reader of this page firing at somebody else's host, which is what the package's own
 * `host-limiter` exists to prevent.
 *
 * ## The two groups are never merged
 *
 * `partitionByCheckability` splits them and the package provides it as a function rather than
 * leaving it to each caller, _"because the whole point of the classification is that these two sets
 * are reported differently"_. **Probeable** is an http(s) URL something could be asked of.
 * **Not checkable** is a `did:`, a templated placeholder, an email, a wallet address — declared, and
 * nothing to send a request to. Showing them in one list would imply the second group failed a
 * check it was never given.
 */
export function AgentEndpoints({registrationFile}: {registrationFile: string | null}) {
    const query = useAgentEndpoints(registrationFile);

    if (query.isPending) {
        return (
            <p className="text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]">
                Reading what it published…
            </p>
        );
    }

    const read = query.data;
    if (read === undefined || read.status === "none") {
        return (
            <p className="max-w-[64ch] text-[color:var(--color-steel)]">
                {read?.status === "none" && read.reason === "no-registration-file"
                    ? "This agent registered without a document, so it published no way in."
                    : "Its registration document declares no endpoint."}
            </p>
        );
    }

    if (read.status === "unreadable") {
        return (
            <div className="max-w-[64ch]">
                {/* Said rather than shown as an empty list: "published nothing" and "we could not
                    read what it published" are different answers about the agent. */}
                <p className="text-[color:var(--color-steel)]">
                    Its document could not be read from this page — {read.detail}
                </p>
                <a
                    href={read.url}
                    target="_blank"
                    rel="noreferrer"
                    className={`mt-3 inline-block break-all font-mono text-[length:var(--text-body-sm)] ${linkClass}`}
                >
                    {read.url} ↗
                </a>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-8">
            {read.probeable.length === 0 ? null : (
                <Group
                    title="Callable"
                    hint="An http endpoint something could be asked of. Whether it answers is a separate question, and this page does not ask it."
                    endpoints={read.probeable}
                />
            )}
            {read.notCheckable.length === 0 ? null : (
                <Group
                    title="Declared, not callable"
                    hint="A DID, a template, an address or a handle. Published, and nothing to send a request to."
                    endpoints={read.notCheckable}
                />
            )}
        </div>
    );
}

function Group({
    title,
    hint,
    endpoints,
}: {
    title: string;
    hint: string;
    endpoints: readonly DeclaredEndpoint[];
}) {
    return (
        <div>
            <h3 className="flex items-center gap-2 font-mono uppercase tracking-wider text-[length:var(--text-label)] text-[color:var(--color-steel)]">
                {title}
                <Hint label={`What ${title.toLowerCase()} means`}>{hint}</Hint>
            </h3>
            <ul className="mt-3">
                {endpoints.map((endpoint, index) => (
                    <li
                        key={`${endpoint.declaredUnder}-${endpoint.name ?? index}`}
                        className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-[color:var(--color-rule)] py-3"
                    >
                        <span className="flex min-w-0 flex-wrap items-baseline gap-x-3">
                            <span className="font-medium">{endpoint.name ?? "unnamed"}</span>
                            {endpoint.classification.status === "probeable" ? (
                                <a
                                    href={endpoint.classification.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className={`min-w-0 break-all font-mono text-[length:var(--text-body-sm)] ${linkClass}`}
                                >
                                    {endpoint.classification.url}
                                </a>
                            ) : (
                                <span className="min-w-0 break-all font-mono text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]">
                                    {endpoint.classification.declared ?? "—"}
                                </span>
                            )}
                        </span>
                        <span className="flex shrink-0 items-baseline gap-4 font-mono text-[length:var(--text-label)] uppercase tracking-wider text-[color:var(--color-steel)]">
                            {endpoint.classification.status === "probeable" ? null : (
                                <span>{endpoint.classification.code}</span>
                            )}
                            {/* Almost always empty — 0 of ~110 parsed documents across repeated
                                samples declared any — so it is shown only when there is one, and
                                when there is, it is the sharpest check available. */}
                            {endpoint.capabilities.length === 0 ? null : (
                                <span>{endpoint.capabilities.length} declared</span>
                            )}
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    );
}
