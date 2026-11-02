import {useState} from "react";
import {Link, useSearchParams} from "react-router-dom";

import {CohortList} from "../components/agent/CohortList";
import {PageLoading} from "../components/brand/PageLoading";
import {ToolCatalogList} from "../components/tool/ToolCatalogList";
import {useAgentSearch} from "../hooks/use-agent-cohort";
import {useSkillFacts} from "../hooks/use-skill-facts";
import {useToolCatalog} from "../hooks/use-tool-catalog";
import {linkClass} from "../lib/control-class";
import {agentRefOf} from "../services/agent-lookup";
import {livenessOf, rankTools, TOOL_CURVES, toolMatches} from "../services/tool-catalog";

const QUERY_PARAM = "q";
const LABEL =
    "font-mono text-[length:var(--text-label)] uppercase tracking-[0.1em] text-[color:var(--color-steel)]";

/**
 * `/search` — one field for both indexes (task 48). Agents by name, tools by name, repository or
 * description, and an id typed as `chain/token` opens the agent. Before it, a reader had to pick
 * the right index first and each had its own field.
 *
 * The query is in the URL, so a search is shareable and Back returns to it.
 */
export function SearchPage() {
    const [searchParams, setSearchParams] = useSearchParams();
    const query = searchParams.get(QUERY_PARAM) ?? "";
    const ref = agentRefOf(query);

    function search(next: string) {
        setSearchParams(next.length === 0 ? {} : {[QUERY_PARAM]: next}, {replace: true});
    }

    return (
        <section>
            <header className="pt-14 pb-8">
                <h1 className="type-display">Search</h1>
            </header>

            {/* Keyed on the query, so the field follows the URL: Back, Forward, and "/" pressed
                on this page (which opens a blank search) remount it with the URL's text and give
                it the focus again. */}
            <SearchField key={query} initial={query} onSearch={search} />

            {query.length === 0 ? null : (
                <>
                    {ref === null ? null : (
                        <p className="mt-8">
                            <Link to={`/agent/${ref.chainId}/${ref.tokenId}`} className={linkClass}>
                                {`Open agent ${ref.chainId}/${ref.tokenId} →`}
                            </Link>
                        </p>
                    )}
                    <AgentResults name={query} />
                    <ToolResults query={query} />
                </>
            )}
        </section>
    );
}

function SearchField({initial, onSearch}: {initial: string; onSearch: (query: string) => void}) {
    const [draft, setDraft] = useState(initial);
    return (
        <form
            role="search"
            onSubmit={(event) => {
                event.preventDefault();
                onSearch(draft.trim());
            }}
            className="flex flex-wrap items-center gap-2 border-y border-[color:var(--color-rule)] py-3.5"
        >
            <input
                type="search"
                // A search page exists to be typed into.
                autoFocus
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="An agent, a tool, or 8453/2340"
                aria-label="Search agents and tools"
                className="h-10 w-[min(28rem,100%)] rounded-[var(--radius-control)] border border-[color:var(--color-rule-strong)] bg-[color:var(--color-bg)] px-3 font-mono text-[length:var(--text-body-sm)]"
            />
        </form>
    );
}

function AgentResults({name}: {name: string}) {
    const search = useAgentSearch(name);
    const view = search.data;
    return (
        <section aria-labelledby="search-agents" className="mt-12">
            <h2 id="search-agents" className={LABEL}>
                {view === undefined || view.total === null
                    ? "Agents"
                    : `Agents · ${view.total.toLocaleString("en-US")}`}
            </h2>
            {search.error !== null ? (
                <p className="mt-3 text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]">
                    The index did not answer. Try again in a moment.
                </p>
            ) : view === undefined ? (
                <PageLoading label="Searching agents" />
            ) : view.rows.length === 0 ? (
                <p className="mt-3 text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]">
                    No agent by that name.{" "}
                    <Link to="/agents" className={linkClass}>
                        Search by what agents can do →
                    </Link>
                </p>
            ) : (
                <CohortList view={view} />
            )}
        </section>
    );
}

function ToolResults({query}: {query: string}) {
    const catalog = useToolCatalog("conviction", TOOL_CURVES[0]?.id ?? 1);
    const {factFor, repoFactFor} = useSkillFacts();
    const view = catalog.data;
    const matches =
        view === undefined
            ? []
            : rankTools(
                  view.rows.filter((row) =>
                      toolMatches(row, query, factFor(row.label)?.description ?? null),
                  ),
                  "declared",
                  (row) => ({
                      liveness: livenessOf(
                          repoFactFor(row.source === null ? row.label : `github.com/${row.source}`),
                      ),
                      installs: factFor(row.label)?.installs ?? null,
                      stars: null,
                  }),
              );
    return (
        <section aria-labelledby="search-tools" className="mt-14">
            <h2 id="search-tools" className={LABEL}>
                {view === undefined ? "Tools" : `Tools · ${matches.length.toLocaleString("en-US")}`}
            </h2>
            {catalog.error !== null && view === undefined ? (
                <p className="mt-3 text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]">
                    The index did not answer. Try again in a moment.
                </p>
            ) : view === undefined ? (
                <PageLoading label="Searching tools" />
            ) : matches.length === 0 ? (
                <p className="mt-3 text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]">
                    No tool by that name.
                </p>
            ) : (
                // Every match: the tool index has no name filter to send the rest to.
                <div className="mt-4">
                    <ToolCatalogList rows={matches} curveId={view.curveId} />
                </div>
            )}
        </section>
    );
}
