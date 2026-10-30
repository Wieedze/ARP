import {INTUITION_USES_TERM_ID} from "@arp-protocol/core";

import type {GroupView} from "../../services/atom-standing-view";
import {Hint} from "../brand/Hint";
import {Sigil} from "../brand/Sigil";

/**
 * A tool's glyph: **the sigil, inverted.**
 *
 * An agent's sigil is a dot per tool it declared using. A tool cannot have one of those — it
 * declares nothing, it *is* declared — and `rules/ui.md` reserves a circle on this surface for an
 * agent, so drawing a tool's own dots would invent an identity the data does not carry.
 *
 * The user's answer, which is the right one: _« faire l'inverse des sigils, tous les endroits où il
 * est déclaré »_. One dot per **agent that declared it**. The same geometry read the other way, and
 * every dot is still an agent, so the rule holds by what the data is rather than by exception.
 *
 * It costs **no query**. The declaring agents are the subjects of the `uses` edges the page already
 * read to draw its claims; this is the same rows, hashed into a glyph.
 *
 * ## Scope and state, both inherited rather than chosen
 *
 * Only `uses` edges, on ADR `0030`'s frozen predicate id and never on a label — the mirror of ADR
 * `0057` §5's rule for the agent glyph. A `has tag` or an `implements` edge is a different claim,
 * and counting it here would make the glyph a tally of assorted statements.
 *
 * Every dot is hollow. `proven` needs a third party's receipt and nothing in this app reads one
 * (`services/agent-sigil.ts`), so the glyph renders the state of the graph rather than a loading
 * state — the same honesty, and the same `Hint` saying so on demand.
 *
 * `null` below one declarer, for the reason `AgentSigil` returns `null` on an agent that declared
 * nothing: a glyph of its core alone is the same glyph for every such atom and stops being an
 * identity.
 */
export function AtomSigil({
    atomId,
    name,
    groups,
    size = 96,
}: {
    atomId: string;
    name: string;
    groups: readonly GroupView[];
    size?: number;
}) {
    const declarers = [
        ...new Set(
            groups
                .filter(
                    (group) =>
                        group.predicateAtomId.toLowerCase() ===
                        INTUITION_USES_TERM_ID.toLowerCase(),
                )
                .flatMap((group) => group.rows.map((row) => row.subjectAtomId)),
        ),
    ];
    if (declarers.length === 0) return null;

    return (
        <div className="flex shrink-0 items-start gap-2">
            <Sigil
                agentId={atomId}
                modules={declarers.map((declarer) => ({
                    name: declarer,
                    state: "declared" as const,
                }))}
                size={size}
                title={`${name}: declared by ${declarers.length} ${
                    declarers.length === 1 ? "agent" : "agents"
                }, none proven`}
            />
            <Hint label="What this glyph shows">
                One dot per agent that declared using this. Hollow means nobody has confirmed it —
                no receipt source exists yet.
            </Hint>
        </div>
    );
}
