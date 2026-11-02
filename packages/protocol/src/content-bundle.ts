/**
 * A skill's whole directory, served with one receipt over a manifest of every file (task 57).
 *
 * `serveContent` serves `SKILL.md` alone. Many skills need the files beside it: Anthropic's `pptx`
 * calls five scripts in its own `scripts/`, and its `pdf` sends form filling to `FORMS.md` and a
 * script (task 54 §4b, read 2026-11-02). Without them the agent gets instructions that point at
 * tools it does not have, while `npx skills add` installs the directory. So this serves the
 * directory, for a runtime that can use it.
 *
 * The receipt is the same type as a single file's. Its `path` is the directory, and its `digest` is
 * sha256 over the manifest: one line per file, sorted by path, `<sha256 hex>  <path>\n`, which is
 * what `sha256sum` prints. A verifier rebuilds the manifest from the files it received
 * ({@link bundleMatchesReceipt}), so the signature covers every byte of every file.
 *
 * The trust surface is `serveContent`'s and nothing is added to it. The fetch targets come from the
 * repository's own listing, never from the request. Nothing is executed. Paths that leave the
 * directory are refused.
 */
import {sha256, type Hex} from "viem";

import {rawContentUrl, resolveContentPath, skillRefFromUrl, type SkillRef} from "./content-path.js";
import type {ContentAnswer, ContentServeConfig} from "./content-serve.js";
import {signContentReceipt, type ContentReceipt, type SignedContentReceipt} from "./receipt.js";

/** One file of a skill, its path relative to the skill's directory. */
export type BundleFile = {path: string; bytes: Uint8Array};

export type BundleAnswer =
    | {
          status: "served";
          ref: SkillRef;
          /** The skill's directory in the repository, without a trailing slash. */
          path: string;
          files: readonly BundleFile[];
          manifest: string;
          digest: Hex;
          receipt: SignedContentReceipt | null;
      }
    | Exclude<ContentAnswer, {status: "served"}>
    | {status: "too-many-files"; ref: SkillRef; path: string; files: number; cap: number};

export type BundleServeConfig = ContentServeConfig & {
    /** The most files served for one skill. */
    maxFiles?: number;
    /** The most bytes served for one skill, all files together. */
    maxTotal?: number;
};

const DEFAULT_MAX_FILES = 300;
const DEFAULT_MAX_TOTAL = 8 * 1_048_576;
const DEFAULT_CAP = 1_048_576;

/** A path relative to the skill's directory that stays inside it. */
export function isSafeRelativePath(path: string): boolean {
    if (path.length === 0 || path.startsWith("/")) return false;
    if (path.includes("\\") || path.includes("\0")) return false;
    return !path.split("/").some((part) => part === ".." || part === "." || part === "");
}

/** One line per file, sorted by path: `<sha256 hex>  <path>\n`, as `sha256sum` prints it. */
export function bundleManifest(files: readonly BundleFile[]): string {
    return [...files]
        .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
        .map((file) => `${sha256(file.bytes).slice(2)}  ${file.path}\n`)
        .join("");
}

/** Whether `files` are exactly the files `receipt` was signed over. */
export function bundleMatchesReceipt(receipt: ContentReceipt, files: readonly BundleFile[]): boolean {
    if (!files.every((file) => isSafeRelativePath(file.path))) return false;
    if (new Set(files.map((file) => file.path)).size !== files.length) return false;
    return sha256(new TextEncoder().encode(bundleManifest(files))) === receipt.digest.toLowerCase();
}

/**
 * The skill's directory, every file, and a receipt over the manifest. `resolveContentPath` resolves
 * a skill only to a `SKILL.md` inside a directory named after it, so the directory is never the
 * repository's root.
 */
export async function serveSkillBundle(atomId: string, config: BundleServeConfig): Promise<BundleAnswer> {
    if (!/^0x[0-9a-fA-F]{64}$/.test(atomId)) return {status: "bad-atom-id"};
    const url = config.index.get(atomId.toLowerCase());
    if (url === undefined) return {status: "unknown-atom"};
    const ref = skillRefFromUrl(url);
    if (ref === null) return {status: "not-a-file", url};

    const listing = await config.listing(ref.repo);
    const resolved = resolveContentPath(ref, listing);
    if (resolved.status === "absent") return {status: "absent", ref};
    if (resolved.status === "ambiguous") return {status: "ambiguous", ref, paths: resolved.paths};
    if (!isSafeRelativePath(resolved.path)) return {status: "unsafe-path", ref, path: resolved.path};

    const dir = resolved.path.slice(0, resolved.path.lastIndexOf("/"));
    const members = listing
        .filter((file) => file.path.startsWith(`${dir}/`))
        .map((file) => ({repoPath: file.path, path: file.path.slice(dir.length + 1)}));
    const maxFiles = config.maxFiles ?? DEFAULT_MAX_FILES;
    if (members.length > maxFiles) {
        return {status: "too-many-files", ref, path: dir, files: members.length, cap: maxFiles};
    }

    const files: BundleFile[] = [];
    let total = 0;
    const cap = config.cap ?? DEFAULT_CAP;
    const maxTotal = config.maxTotal ?? DEFAULT_MAX_TOTAL;
    for (const member of members) {
        if (!isSafeRelativePath(member.path)) return {status: "unsafe-path", ref, path: member.repoPath};
        const fetched = await config.raw(rawContentUrl(ref, member.repoPath));
        if (fetched.code !== 200) return {status: "upstream", ref, path: member.repoPath, code: fetched.code};
        total += fetched.bytes.byteLength;
        if (fetched.bytes.byteLength > cap || total > maxTotal) {
            return {
                status: "too-large",
                ref,
                path: member.repoPath,
                bytes: fetched.bytes.byteLength > cap ? fetched.bytes.byteLength : total,
                cap: fetched.bytes.byteLength > cap ? cap : maxTotal,
            };
        }
        files.push({path: member.path, bytes: fetched.bytes});
    }

    const manifest = bundleManifest(files);
    const digest = sha256(new TextEncoder().encode(manifest));
    const receipt =
        config.signer === null
            ? null
            : await signContentReceipt(
                  {
                      atom: atomId.toLowerCase() as Hex, // checked to be 0x + 64 hex above
                      url,
                      path: dir,
                      digest,
                      to: config.to,
                      servedAt: config.now(),
                      nonce: config.nonce,
                  },
                  config.chainId,
                  config.signer,
              );
    return {status: "served", ref, path: dir, files, manifest, digest, receipt};
}
