import type {Hex} from "viem";

import {useAtomStanding} from "../../hooks/use-atom-standing";
import {useDeclaredModules} from "../../hooks/use-declared-modules";
import {ClaimField} from "../atom/ClaimField";
import {Empty, Group} from "../atom/ClaimList";
import {DeclareUse} from "../usage/DeclareUse";

/**
 * What is claimed about an agent, and the way to add one — the atom page's own two, here.
 *
 * **The same components, not a copy.** An agent *is* an atom on this graph, so the question "who
 * points at this and what did they put behind saying so" is the same question with the same answer
 * shape. The user asked for it directly: _« je veux les mêmes choses et même front end pour la page
 * agent »_.
 *
 * It replaces `DeclaredUses`, which answered a narrower version of the same thing — `uses` edges
 * only, where `getAtomStanding` does not presume the predicate. An agent can be the object of
 * `has tag`, `same as` and anything else somebody chose, and the narrower reader rendered those
 * nowhere.
 *
 * **`(my agent) uses (this agent)` is a real claim**, and ADR `0056` §2 describes it exactly: a
 * client writes it with its own identity atom as the subject, which is why a single shared edge
 * would be wrong. So the declaration card belongs on an agent's page as much as on a tool's.
 */
/**
 * The declaration card alone — an **action**, so it stays above the tab strip.
 *
 * Split from the claim view it used to sit with: putting the page's only two writes behind a tab
 * would hide them behind a click. Both read `useAtomStanding` on the same key, so React Query
 * serves one request and a successful write refreshes the list in the tab.
 */
export function AgentDeclareCard({atomId, name}: {atomId: string; name: string}) {
    const query = useAtomStanding(atomId);
    return (
        <DeclareUse
            object={atomId as Hex}
            objectLabel={name}
            onDeclared={() => void query.refetch()}
        />
    );
}

export function AgentClaims({atomId, name}: {atomId: string; name: string}) {
    const query = useAtomStanding(atomId);
    const view = query.data;
    const subjectIds = (view?.groups ?? []).flatMap((group) =>
        group.rows.map((row) => row.subjectAtomId),
    );
    const modules = useDeclaredModules(subjectIds);

    return (
        <>
            {query.isPending ? (
                <p className="text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]">
                    Reading the graph…
                </p>
            ) : view === undefined || !view.exists ? (
                <p className="max-w-[64ch] text-[color:var(--color-steel)]">
                    This agent has no atom on the graph, so nothing can point at it yet.
                </p>
            ) : view.groups.length === 0 ? (
                <Empty atomId={view.atomId} />
            ) : (
                <>
                    <div className="mb-10">
                        <ClaimField
                            groups={view.groups}
                            subject={name}
                            edgeCount={view.edgeCount}
                            truncated={view.truncated}
                        />
                    </div>
                    {view.groups.map((group) => (
                        <Group
                            key={group.predicateAtomId}
                            group={group}
                            subject={name}
                            modules={modules.data ?? {}}
                        />
                    ))}
                </>
            )}
        </>
    );
}
