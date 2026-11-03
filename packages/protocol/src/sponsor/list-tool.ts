import {getAddress, isAddress, isHex, recoverTypedDataAddress, type Address, type Hex} from "viem";

import {skillRefFromUrl} from "../content-path.js";
import type {AgentThing} from "../declare/agent-atom.js";
import {
    atomDataForUri,
    encodeCreateAtoms,
    encodeCreateTriples,
    type MultiVaultReads,
} from "../declare/multivault.js";
import {isToolUrl, normaliseToolUrl, toolAtomUri, toolThing} from "../declare/tool-thing.js";
import type {PreparedCall} from "../declare/types.js";

/**
 * A sponsored tool listing (ADR `0120`, `docs/tasks/53` 53c): the atoms and the one triple that make
 * a tool findable, and the request an address signs to ask for one.
 *
 * **A listing is a pointer, never a claim of use.** It creates the tool's atom, and for a skill the
 * repository's atom and `(skill, source, repository)`. It writes no `uses` edge and labels nothing
 * declared or proven. Each term is born at `cost + minDeposit` (ADR `0053`), so the payer holds its
 * first position.
 */

/**
 * `source`: a plain-string atom, so its id follows from the word and is the same on 1155 and 13579
 * (`scripts/seed/seed-skills.ts`, where it was checked against `calculateAtomId`).
 */
export const SOURCE_PREDICATE: Hex =
    "0xe6b33153a6f58b47bcfe074cd154447608d5788e96446246536ddb9cd84105a4";

export type ToolListingPlan = {
    /** The normalised URL the atom is made from. */
    url: string;
    atomId: Hex;
    /** For a skill, the repository it is in; `null` for any other tool. */
    repository: {url: string; atomId: Hex; sourceTripleId: Hex} | null;
    /** The Things whose atoms this plan creates, to pin before sending so they are readable. */
    toPin: AgentThing[];
    calls: PreparedCall[];
    totalValue: bigint;
};

/**
 * The one URL a tool is listed under, so two spellings of it cannot mint two atoms.
 *
 * A GitHub URL is rebuilt the way the seed scripts build theirs (`scripts/seed/seed-skills.ts`):
 * `https://github.com/<owner>/<repo>`, with `?skill=<s>` for a skill and nothing else. A path such
 * as `/tree/main` and any other query parameter are dropped. `repoFullName` is GitHub's own
 * `owner/repo`, case included. `normaliseToolUrl` keeps path case, so `wieedze/arp` and
 * `Wieedze/ARP` would otherwise be two atoms. Any other URL is `normaliseToolUrl`'s output.
 */
export function canonicalToolUrl(url: string, repoFullName?: string): string {
    const normalised = normaliseToolUrl(url);
    const parsed = new URL(normalised);
    if (parsed.hostname !== "github.com") return normalised;
    const ref = skillRefFromUrl(normalised);
    const [owner, name] = parsed.pathname.replace(/^\/+/, "").split("/");
    const repo =
        repoFullName ??
        ref?.repo ??
        (owner && name ? `${owner}/${name.replace(/\.git$/, "")}` : null);
    if (repo === null) return normalised;
    return normaliseToolUrl(
        ref === null
            ? `https://github.com/${repo}`
            : `https://github.com/${repo}?skill=${encodeURIComponent(ref.skill)}`,
    );
}

/** Plan a listing for `url`. Nothing to create gives an empty `calls`. Throws on a URL that is not a tool. */
export async function planToolListing(params: {
    url: string;
    reads: MultiVaultReads;
    /** GitHub's `owner/repo` for a GitHub URL, case included ({@link canonicalToolUrl}). */
    repoFullName?: string;
}): Promise<ToolListingPlan> {
    const {reads} = params;
    if (!isToolUrl(params.url)) throw new Error(`${params.url} is not a tool URL`);
    const url = canonicalToolUrl(params.url, params.repoFullName);
    const ref = skillRefFromUrl(url);
    const repoUrl = ref === null ? null : normaliseToolUrl(`https://github.com/${ref.repo}`);

    const toolData = atomDataForUri(toolAtomUri(url));
    const repoData = repoUrl === null ? null : atomDataForUri(toolAtomUri(repoUrl));
    const [atomId, repoId] = await Promise.all([
        reads.atomId(toolData),
        repoData === null ? Promise.resolve(null) : reads.atomId(repoData),
    ]);
    const sourceTripleId =
        repoId === null ? null : await reads.tripleId(atomId, SOURCE_PREDICATE, repoId);

    const [toolOn, repoOn, sourceOn, atomCost, tripleCost, minDeposit] = await Promise.all([
        reads.termExists(atomId),
        repoId === null ? Promise.resolve(true) : reads.termExists(repoId),
        sourceTripleId === null ? Promise.resolve(true) : reads.termExists(sourceTripleId),
        reads.atomCost(),
        reads.tripleCost(),
        reads.minDeposit(),
    ]);
    const atomAssets = atomCost + minDeposit;
    const tripleAssets = tripleCost + minDeposit;

    const atoms: {atomData: Hex; assets: bigint}[] = [];
    const toPin: AgentThing[] = [];
    if (!toolOn) {
        atoms.push({atomData: toolData, assets: atomAssets});
        toPin.push(toolThing(url));
    }
    if (!repoOn && repoData !== null && repoUrl !== null) {
        atoms.push({atomData: repoData, assets: atomAssets});
        toPin.push(toolThing(repoUrl));
    }

    const calls: PreparedCall[] = [];
    if (atoms.length > 0) {
        const value = atomAssets * BigInt(atoms.length);
        calls.push({
            kind: "create-atom",
            chainId: reads.chainId,
            to: reads.address,
            value,
            data: encodeCreateAtoms(atoms),
            why: `list ${url}: ${atoms.length} atom(s)`,
        });
    }
    if (!sourceOn && repoId !== null && sourceTripleId !== null) {
        calls.push({
            kind: "create-triple",
            chainId: reads.chainId,
            to: reads.address,
            value: tripleAssets,
            data: encodeCreateTriples([
                {
                    subjectId: atomId,
                    predicateId: SOURCE_PREDICATE,
                    objectId: repoId,
                    assets: tripleAssets,
                },
            ]),
            why: `${url} has source ${repoUrl}`,
        });
    }

    return {
        url,
        atomId,
        repository:
            repoUrl === null || repoId === null || sourceTripleId === null
                ? null
                : {url: repoUrl, atomId: repoId, sourceTripleId},
        toPin,
        calls,
        totalValue: calls.reduce((sum, call) => sum + call.value, 0n),
    };
}

/**
 * What an address signs to list a tool under its own daily limit rather than the anonymous cap.
 *
 * "Address `address` asks ARP to list `url`, before `expiresAt`." Nothing on chain checks it, so the
 * domain has no `verifyingContract`, as in `mint-gas.ts`. The service spends each `nonce` once and
 * refuses an `expiresAt` more than {@link LIST_TOOL_MAX_TTL_SECONDS} ahead.
 */
export const LIST_TOOL_REQUEST_TYPES = {
    ListToolRequest: [
        {name: "address", type: "address"},
        {name: "url", type: "string"},
        {name: "nonce", type: "bytes32"},
        {name: "expiresAt", type: "uint256"},
    ],
} as const;

export const LIST_TOOL_MAX_TTL_SECONDS = 3_600;

export type ListToolRequest = {address: Address; url: string; nonce: Hex; expiresAt: number};

export type SignedListToolRequest = {request: ListToolRequest; chainId: number; signature: Hex};

export type ListToolRequestVerdict =
    | {status: "valid"; address: Address}
    | {status: "mismatch"; declared: Address; recovered: Address}
    | {status: "expired"; expiresAt: number}
    | {status: "malformed"; reason: string};

export function listToolRequestTypedData(request: ListToolRequest, chainId: number) {
    return {
        domain: {name: "ARP List Tool Request", version: "1", chainId} as const,
        types: LIST_TOOL_REQUEST_TYPES,
        primaryType: "ListToolRequest" as const,
        message: {
            address: request.address,
            url: request.url,
            nonce: request.nonce,
            expiresAt: BigInt(request.expiresAt),
        },
    };
}

/** Signs a typed-data block. The caller's runtime supplies one; this module never sees a key. */
export type ListToolRequestSigner = {
    signTypedData(data: ReturnType<typeof listToolRequestTypedData>): Promise<Hex>;
};

export async function signListToolRequest(
    request: ListToolRequest,
    chainId: number,
    signer: ListToolRequestSigner,
): Promise<SignedListToolRequest> {
    return {
        request,
        chainId,
        signature: await signer.signTypedData(listToolRequestTypedData(request, chainId)),
    };
}

/** Recover the signer and compare it to the address the request names. `now` is unix seconds. */
export async function verifyListToolRequest(
    signed: unknown,
    now: number,
): Promise<ListToolRequestVerdict> {
    if (typeof signed !== "object" || signed === null)
        return {status: "malformed", reason: "no request"};
    // Each field is checked below before it is used.
    const {request, chainId, signature} = signed as Partial<SignedListToolRequest>;
    if (typeof request !== "object" || request === null)
        return {status: "malformed", reason: "no request"};
    if (typeof request.address !== "string" || !isAddress(request.address))
        return {status: "malformed", reason: "address is not an address"};
    if (typeof request.url !== "string" || request.url.length === 0)
        return {status: "malformed", reason: "url is not a string"};
    if (typeof request.nonce !== "string" || !isHex(request.nonce) || request.nonce.length !== 66)
        return {status: "malformed", reason: "nonce is not bytes32"};
    if (!Number.isInteger(request.expiresAt) || request.expiresAt < 0)
        return {status: "malformed", reason: "expiresAt is not a unix timestamp"};
    if (typeof chainId !== "number" || !Number.isInteger(chainId) || chainId <= 0)
        return {status: "malformed", reason: "chainId is not a chain id"};
    if (typeof signature !== "string" || !isHex(signature))
        return {status: "malformed", reason: "signature is not hex"};
    if (request.expiresAt <= now) return {status: "expired", expiresAt: request.expiresAt};
    if (request.expiresAt > now + LIST_TOOL_MAX_TTL_SECONDS)
        return {
            status: "malformed",
            reason: `expiresAt is more than ${LIST_TOOL_MAX_TTL_SECONDS} s ahead`,
        };

    const declared = getAddress(request.address);
    let recovered: Address;
    try {
        recovered = await recoverTypedDataAddress({
            ...listToolRequestTypedData(request, chainId),
            signature,
        });
    } catch (error) {
        return {
            status: "malformed",
            reason: error instanceof Error ? error.message : String(error),
        };
    }
    if (recovered !== declared) return {status: "mismatch", declared, recovered};
    return {status: "valid", address: recovered};
}
