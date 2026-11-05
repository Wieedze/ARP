import {
    BECAUSE_LABEL,
    getPulseUsage,
    githubPulseSource,
    HAS_OUTCOME_LABEL,
    multiVaultReads,
    readPulse,
    toolAtomUri,
    type PulseUsage,
    type SkillPulse,
} from "@arp-protocol/core";
import {stringToHex, type Address, type Hex} from "viem";

export type PulseChain = {
    chainId: number;
    multiVault: Address;
    rpcUrl: string;
    graphqlUrl: string;
    inContextOf: Hex;
};

export type PulseView = {pulse: SkillPulse; atomId: Hex | null; usage: PulseUsage | null};

/**
 * One skill's pulse: what GitHub shows of its files and what wallets wrote about it (task 63).
 *
 * The two reads fail apart. A chain or graph read that fails leaves `usage` null, which the page says
 * is unknown; it is never shown as "nobody declared", and it does not cost the file's facts.
 */
export async function loadPulse(source: string, skill: string, chain: PulseChain): Promise<PulseView> {
    const pulse = await readPulse(
        {source, skill, installs: null, installsText: null, url: null},
        githubPulseSource(),
    ).catch((): SkillPulse => ({source, skill, installs: null, installsText: null, url: null, status: "repository_unreachable"}));
    try {
        const reads = multiVaultReads({address: chain.multiVault, chainId: chain.chainId, rpcUrl: chain.rpcUrl});
        const url = `https://github.com/${source}?skill=${encodeURIComponent(skill)}`;
        const atomId = await reads.atomId(stringToHex(toolAtomUri(url)));
        const read = await getPulseUsage([atomId], {
            graphqlUrl: chain.graphqlUrl,
            inContextOf: chain.inContextOf,
            hasOutcome: await reads.atomId(stringToHex(HAS_OUTCOME_LABEL)),
            because: await reads.atomId(stringToHex(BECAUSE_LABEL)),
        });
        return {pulse, atomId, usage: read.get(atomId.toLowerCase()) ?? null};
    } catch {
        return {pulse, atomId: null, usage: null};
    }
}
