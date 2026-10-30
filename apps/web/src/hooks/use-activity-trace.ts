import {useMemo} from "react";
import {useQueries} from "@tanstack/react-query";
import {multiVaultReads, type ActivityEvent as AgentEvent} from "@arp-protocol/core";
import type {Hex} from "viem";

import {choiceFor} from "../lib/chain-choice";
import {intuitionMainnet} from "../lib/intuition-mainnet";
import {traceInvocations, type TracedInvocation} from "../services/agent-feed";

type Declared = {chainId: number; subject: Hex; predicate: Hex; object: Hex};

const keyOf = (d: Pick<Declared, "subject" | "predicate" | "object">) =>
    `${d.subject}:${d.predicate}:${d.object}`.toLowerCase();

/**
 * Each invocation joined to what the agent declared and staked about it.
 *
 * The triple id a deposit targets is computed by the chain, not carried in the create-triple's
 * calldata, so each declared `(subject, predicate, object)` is read once through
 * `calculateTripleId` — a pure function on chain, so it never goes stale and is cached forever.
 */
export function useActivityTrace(events: readonly AgentEvent[]): {
    trace: TracedInvocation[];
    tripleIdOf: (subject: Hex, predicate: Hex, object: Hex) => Hex | undefined;
} {
    const declared = useMemo(() => {
        const out = new Map<string, Declared>();
        for (const event of events) {
            if (event.source !== "sent" || event.decoded.fn !== "createTriples") continue;
            const {subjects, predicates, objects} = event.decoded;
            subjects.forEach((subject, index) => {
                const predicate = predicates[index];
                const object = objects[index];
                if (predicate === undefined || object === undefined) return;
                out.set(keyOf({subject, predicate, object}), {
                    chainId: event.chainId,
                    subject,
                    predicate,
                    object,
                });
            });
        }
        return [...out.values()];
    }, [events]);

    const reads = useQueries({
        queries: declared.map((d) => ({
            queryKey: ["triple-id", d.chainId, keyOf(d)],
            staleTime: Infinity,
            queryFn: () => {
                const choice = choiceFor(d.chainId === intuitionMainnet.id);
                return multiVaultReads({
                    address: choice.multiVault,
                    chainId: choice.chainId,
                    client: choice.client,
                }).tripleId(d.subject, d.predicate, d.object);
            },
        })),
    });

    // `useQueries` hands back a new array every render, so the reads are reduced to a string that
    // changes only when one of them lands, and the map is rebuilt from that.
    const landed = reads.map((read) => read.data ?? "").join(",");
    const ids = useMemo(() => {
        const out = new Map<string, Hex>();
        const values = landed.split(",");
        declared.forEach((d, index) => {
            const id = values[index];
            // Each value is a `calculateTripleId` result or the empty placeholder, filtered here.
            if (id !== undefined && id.startsWith("0x")) out.set(keyOf(d), id as Hex);
        });
        return out;
    }, [declared, landed]);

    return useMemo(() => {
        const tripleIdOf = (subject: Hex, predicate: Hex, object: Hex) =>
            ids.get(keyOf({subject, predicate, object}));
        return {trace: traceInvocations(events, tripleIdOf), tripleIdOf};
    }, [events, ids]);
}
