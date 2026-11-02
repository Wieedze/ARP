import {lazy, Suspense} from "react";
import {useSearchParams} from "react-router-dom";

import {PageLoading} from "../components/brand/PageLoading";

const YourAgent = lazy(() => import("./YourAgent").then((module) => ({default: module.YourAgent})));
const ToolRegister = lazy(() =>
    import("./ToolRegister").then((module) => ({default: module.ToolRegister})),
);

const WHAT_PARAM = "what";

/**
 * `/register` — one door for putting something into ARP, with the choice at the top.
 *
 * It was two nav items, "Your agent" and "Add a tool", for the same act on two kinds of thing. The
 * user, 2026-10-29: _« c'est plutôt un onglet register et tu décides de register un agent ou un
 * tool »_. Each branch is the page it was, without its own title; `?what=agent|tool` carries the
 * choice so it is shareable and Back returns to the question, the way `?have=` already does inside
 * the agent branch.
 */
export function Register() {
    const [searchParams, setSearchParams] = useSearchParams();
    const what = searchParams.get(WHAT_PARAM);

    function choose(next: "agent" | "tool") {
        // Only `what`: the agent branch's own `?have=` belongs to that branch and is dropped when
        // the reader switches to a tool.
        setSearchParams(new URLSearchParams({[WHAT_PARAM]: next}), {replace: false});
    }

    return (
        <section>
            <header className="mt-8 mb-10">
                <h1 className="type-display">Register</h1>
            </header>

            <fieldset className="m-0 border-0 p-0">
                <legend className="text-[length:var(--text-body)] font-medium">
                    What are you registering?
                </legend>
                <div className="mt-4 grid max-w-[40rem] gap-4 sm:grid-cols-2">
                    <Tile
                        name="An agent"
                        needs="ERC-8004 identity · wallet"
                        selected={what === "agent"}
                        onClick={() => choose("agent")}
                    />
                    <Tile
                        name="A tool"
                        needs="URL · wallet"
                        selected={what === "tool"}
                        onClick={() => choose("tool")}
                    />
                </div>
            </fieldset>

            {what === "agent" || what === "tool" ? (
                <div className="mt-12 border-t border-[color:var(--color-rule)] pt-10">
                    <Suspense fallback={<PageLoading label="the form" />}>
                        {what === "agent" ? (
                            <YourAgent heading={false} />
                        ) : (
                            <ToolRegister heading={false} />
                        )}
                    </Suspense>
                </div>
            ) : null}
        </section>
    );
}

/**
 * One of the two choices, as a tile rather than a small button (task 46d, from the Mobbin references
 * for a "what are you creating" step). The mono line is what the branch asks for, a fact and not a
 * sentence (`rules/ui.md`). "ERC-8004 identity" and not "id": the agent branch mints one for an agent
 * that has none, so having it is not a prerequisite.
 *
 * No symbol on the tile. A Sigil is generated from chain data and never drawn by hand, and there is
 * no agent here yet to generate one from.
 */
function Tile({
    name,
    needs,
    selected,
    onClick,
}: {
    name: string;
    needs: string;
    selected: boolean;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            aria-pressed={selected}
            onClick={onClick}
            // Banged: `index.css`'s unlayered `button {}` sets border, background and radius, and
            // `button:focus-visible` sets the radius again, and both beat any `@layer utilities`
            // rule. Colour is not banged because it sits on the spans, which neither rule touches.
            className={`flex min-h-36 flex-col items-start gap-6 rounded-[var(--radius-card)]! p-5 text-left ${
                selected
                    ? "border-[color:var(--color-accent)]! bg-[color:var(--color-raised)]!"
                    : "border-[color:var(--color-rule-strong)]! bg-transparent! hover:bg-[color:var(--color-surface-hover)]!"
            }`}
        >
            <span className="type-face text-[28px] leading-none text-[color:var(--color-fg)]">
                {name}
            </span>
            <span className="mt-auto font-mono text-[length:var(--text-label)] uppercase tracking-[0.08em] text-[color:var(--color-steel)]">
                {needs}
            </span>
        </button>
    );
}
