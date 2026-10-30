import {lazy, Suspense} from "react";
import {useSearchParams} from "react-router-dom";

import {PageLoading} from "../components/brand/PageLoading";
import {Choice} from "./YourAgent";

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
                <div className="mt-4 flex flex-wrap gap-3">
                    <Choice selected={what === "agent"} onClick={() => choose("agent")}>
                        An agent
                    </Choice>
                    <Choice selected={what === "tool"} onClick={() => choose("tool")}>
                        A tool
                    </Choice>
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
