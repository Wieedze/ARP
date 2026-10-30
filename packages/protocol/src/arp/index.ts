/**
 * ARP's own namespace: the two Intuition chain definitions, and nothing else.
 *
 * It held a client, a `ModuleRegistry` reader and an agent-reputation surface — 790 lines, all with
 * zero consumers outside this package, all of it the catalogue ADR `0051` retired. What a namespace
 * for "ARP's own contracts" has left is the chain definitions, because `rules/portability.md` makes
 * this the one file allowed to name a chain.
 */
export {intuitionMainnet, intuitionTestnet} from "./chains.js";
