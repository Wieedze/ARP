/**
 * Serving a tool's content and signing for having served it.
 *
 * Every piece of IO is injected — the repository listing, the fetch, the clock, the signer — so this
 * is testable with no network and holds no key. The node supplies the real ones
 * (`scripts/arp-mcp-server.ts`), which is the same split as the rest of the package: the protocol
 * layer describes, the transport acts.
 *
 * ## What it is for
 *
 * `tasks/31`, ADR `0080`. A declaration is the agent's word about the agent. If the node served the
 * bytes, the node is a second party to that fetch and can sign for it, and the agent's hook log is
 * the other half. **It attests access, never use.**
 *
 * ## The trust surface, stated because somebody is going to install this
 *
 * The user asked for this before anyone is asked to run the node, and it belongs next to the code
 * rather than in a document that drifts from it.
 *
 * **The fetch target is derived, never supplied.** The only input is an atom id. That is looked up
 * in a catalogue this repository ships, which yields a URL; the URL yields `owner/repo`; the path
 * comes from the repository's own listing. **No part of the request reaches the outbound URL**, so
 * there is no request that makes this fetch somewhere else — the usual shape of an SSRF in a
 * proxy like this one.
 *
 * **Nothing is executed and nothing is interpreted.** The bytes are Markdown and they are returned
 * as `text/plain`, never rendered, never parsed, never written to disk.
 *
 * **Nothing is stored but a listing.** `cache` holds repository file listings, which are public
 * metadata. The content is passed through: a cache of bytes is a mirror, and a mirror is a
 * different product with different obligations (`tasks/31` §9).
 *
 * **The key signs receipts and cannot move value** (ADR `0080` constraint 3). It is passed in as a
 * signer, so this module cannot sign without being handed the ability, and it never appears in an
 * answer.
 *
 * **Every refusal is a stated reason.** The function returns a typed union and the reasons are
 * below. Nothing is guessed: two paths with different contents refuse rather than pick, because
 * which one the agent read would otherwise be a claim under a signature.
 *
 * ## The refusals, and why each one is a refusal
 *
 * ```
 * bad-atom-id      not 0x + 64 hex. Nothing was looked up
 * unknown-atom     not in the catalogue. We have nothing to say about it
 * not-a-file       a catalogued tool with no file — every MCP server is this
 * absent           the repository has no such skill at HEAD. 139 of 662 are here
 * ambiguous        several paths, contents differ. 2 of 662
 * unsafe-path      a listing path that escapes the repository. Defence in depth
 * upstream         the origin answered something other than 200
 * too-large        over the cap, which exists so one request cannot exhaust the host
 * ```
 */
import type {Address, Hex} from "viem";

import {
    rawContentUrl,
    resolveContentPath,
    skillRefFromUrl,
    type RepositoryFile,
    type SkillRef,
} from "./content-path.js";
import {
    contentDigest,
    signContentReceipt,
    type SignedContentReceipt,
    type TypedDataSigner,
} from "./receipt.js";

/** One catalogued tool, as the reverse index needs it. */
export type CataloguedAtom = {atom: Hex; url: string};

export type ContentAnswer =
    | {
          status: "served";
          ref: SkillRef;
          path: string;
          /** Other paths in the same repository carrying the same bytes. */
          alsoAt: readonly string[];
          bytes: Uint8Array;
          digest: Hex;
          /** Absent when no signer was configured — the bytes still go out. */
          receipt: SignedContentReceipt | null;
      }
    | {status: "bad-atom-id"}
    | {status: "unknown-atom"}
    | {status: "not-a-file"; url: string}
    | {status: "absent"; ref: SkillRef}
    | {status: "ambiguous"; ref: SkillRef; paths: readonly string[]}
    | {status: "unsafe-path"; ref: SkillRef; path: string}
    | {status: "upstream"; ref: SkillRef; path: string; code: number}
    | {status: "too-large"; ref: SkillRef; path: string; bytes: number; cap: number};

export type ContentServeConfig = {
    /** The chain whose atom ids these are. Rides into the receipt's domain. */
    chainId: number;
    /** Atom id to URL. Built once by the caller; this never mutates it. */
    index: ReadonlyMap<string, string>;
    /** A repository's file listing. The caller caches; this calls it once per request. */
    listing(repo: string): Promise<readonly RepositoryFile[]>;
    /** Fetch a raw URL. Returns the status and the bytes, and never throws for a 404. */
    raw(url: string): Promise<{code: number; bytes: Uint8Array}>;
    /** Null means serve the bytes and sign nothing. */
    signer: TypedDataSigner | null;
    /** The caller, proven. Null for an unauthenticated fetch, which is served. */
    to: Address | null;
    /** The receipt's nonce. The caller's own, so a replayed request yields the same receipt. */
    nonce: Hex;
    /** Seconds. Injected so a test has no clock. */
    now(): number;
    /** The largest file served. A SKILL.md is kilobytes; this is three orders above that. */
    cap?: number;
};

const DEFAULT_CAP = 1_048_576;

/** A listing path that leaves the repository. The listing is GitHub's, so this is belt and braces. */
function isSafePath(path: string): boolean {
    if (path.length === 0 || path.startsWith("/")) return false;
    if (path.includes("\\") || path.includes("\0")) return false;
    return !path.split("/").includes("..");
}

/**
 * Resolve an atom to its bytes, with a receipt when a signer was configured.
 *
 * One listing request and one fetch, both injected. Every other outcome is a refusal naming its
 * reason, because a caller that cannot tell "no such skill" from "two candidates" from "the origin
 * is down" will retry the wrong one.
 */
export async function serveContent(
    atomId: string,
    config: ContentServeConfig,
): Promise<ContentAnswer> {
    if (!/^0x[0-9a-fA-F]{64}$/.test(atomId)) return {status: "bad-atom-id"};

    const url = config.index.get(atomId.toLowerCase());
    if (url === undefined) return {status: "unknown-atom"};

    const ref = skillRefFromUrl(url);
    // A catalogued tool that is not a repository-plus-skill has no file. Every MCP server in the
    // catalogue is this, and it is an answer rather than a failure.
    if (ref === null) return {status: "not-a-file", url};

    const resolved = resolveContentPath(ref, await config.listing(ref.repo));
    if (resolved.status === "absent") return {status: "absent", ref};
    if (resolved.status === "ambiguous") {
        return {status: "ambiguous", ref, paths: resolved.paths};
    }
    if (!isSafePath(resolved.path)) {
        return {status: "unsafe-path", ref, path: resolved.path};
    }

    const fetched = await config.raw(rawContentUrl(ref, resolved.path));
    if (fetched.code !== 200) {
        return {status: "upstream", ref, path: resolved.path, code: fetched.code};
    }
    const cap = config.cap ?? DEFAULT_CAP;
    if (fetched.bytes.byteLength > cap) {
        return {
            status: "too-large",
            ref,
            path: resolved.path,
            bytes: fetched.bytes.byteLength,
            cap,
        };
    }

    const digest = contentDigest(fetched.bytes);
    const receipt =
        config.signer === null
            ? null
            : await signContentReceipt(
                  {
                      atom: atomId.toLowerCase() as Hex,
                      url,
                      path: resolved.path,
                      digest,
                      to: config.to,
                      servedAt: config.now(),
                      nonce: config.nonce,
                  },
                  config.chainId,
                  config.signer,
              );

    return {
        status: "served",
        ref,
        path: resolved.path,
        alsoAt: resolved.alsoAt,
        bytes: fetched.bytes,
        digest,
        receipt,
    };
}

/**
 * Atom id to URL, lowercased keys.
 *
 * Built from whatever the caller has. Entries with no recorded atom id are skipped rather than
 * computed: the id is `calculateAtomId` on the MultiVault, which is a chain read, and a module that
 * resolves identities must not depend on one.
 */
export function contentIndexOf(catalogued: readonly CataloguedAtom[]): Map<string, string> {
    const index = new Map<string, string>();
    for (const row of catalogued) {
        if (typeof row.atom !== "string" || !row.atom.startsWith("0x")) continue;
        index.set(row.atom.toLowerCase(), row.url);
    }
    return index;
}
