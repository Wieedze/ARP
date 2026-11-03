/**
 * The one place a fetched skill is written to disk, and the person who has to say yes first
 * (task 61, deliverable D).
 *
 * **Nothing is written under the skills directory until a person accepts, and there is no flag,
 * setting or mode that turns the question off** (user decision 2026-11-03, « la question doit
 * toujours être posée »). Two ways to ask, both out of the model's reach:
 *
 * 1. the client declared MCP elicitation: the server asks the client, which shows the page to the
 *    person. Claude Code 2.1.316 declares it, and answers `cancel` when nobody is there to answer
 *    (`claude -p`, measured 2026-11-03), so a headless run installs nothing;
 * 2. otherwise the files go to `.arp/pending/<name>/` and `arp skills accept <name>` asks, reading
 *    the answer from the controlling terminal, which a model's shell does not have.
 *
 * Both paths re-check the receipt and the files before writing, and the page is rebuilt from the
 * files themselves, never from text stored beside them: a pending folder is writable by whoever
 * runs in the project, the model included.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
  appendFileSync,
} from 'node:fs';
import { dirname, join, relative } from 'node:path';

import {
  bundleMatchesReceipt,
  renderSkillReview,
  reviewSkill,
  skillRefFromUrl,
  verifyContentReceipt,
  type BundleFile,
  type SignedContentReceipt,
  type ThirdPartyFigure,
} from '@arp-protocol/core';

/** A skill's name is used as a directory name; it comes from a URL. */
export const SAFE_SKILL_NAME = /^[a-z0-9][a-z0-9._-]*$/i;

export type GateAnswer = 'accepted' | 'declined' | 'unavailable';

/** What a pending skill carries beside its files. The page is never stored, only rebuilt. */
export type PendingRecord = { skill: string; receipt: SignedContentReceipt };

/** Facts the server knows and the files do not: the commit's date and third-party figures. */
export type ReviewContext = { committedAt: string | null; thirdParty: readonly ThirdPartyFigure[] };

/** The page a person reads, rebuilt from the receipt and the files. */
export function reviewPage(
  receipt: SignedContentReceipt,
  files: readonly BundleFile[],
  context: ReviewContext,
): string {
  const ref = skillRefFromUrl(receipt.receipt.url);
  return renderSkillReview(
    reviewSkill({
      repo: ref?.repo ?? receipt.receipt.url,
      skill: ref?.skill ?? receipt.receipt.url,
      path: receipt.receipt.path,
      commit: receipt.receipt.commit ?? 'not named: a version 1 receipt was read at HEAD',
      committedAt: context.committedAt,
      files,
      thirdParty: context.thirdParty,
    }),
  );
}

/** The receipt verifies and the files are exactly the ones it was signed over. */
export async function filesMatch(
  receipt: SignedContentReceipt,
  files: readonly BundleFile[],
): Promise<boolean> {
  return (
    (await verifyContentReceipt(receipt)).status === 'valid' &&
    bundleMatchesReceipt(receipt.receipt, files)
  );
}

/**
 * Write the files under `<skillsDir>/<skill>/`. A different file already at one of the paths is
 * somebody's — another skill of the same name, or one edited by hand — so it refuses before writing
 * anything (ADR `0116`). Returns the SKILL.md path.
 */
export function installFiles(
  skillsDir: string,
  skill: string,
  files: readonly BundleFile[],
): string {
  if (!SAFE_SKILL_NAME.test(skill))
    throw new Error(`${skill} is not a plain directory name; nothing was installed`);
  const dir = join(skillsDir, skill);
  const clash = files.find((file) => {
    const path = join(dir, file.path);
    return existsSync(path) && !Buffer.from(readFileSync(path)).equals(Buffer.from(file.bytes));
  });
  if (clash !== undefined) {
    throw new Error(
      `${join(dir, clash.path)} already exists with different contents; nothing was installed. ` +
        `Remove ${dir} to install this skill there.`,
    );
  }
  // Every path was checked to stay inside the directory by `bundleMatchesReceipt`.
  for (const file of files) {
    mkdirSync(dirname(join(dir, file.path)), { recursive: true });
    writeFileSync(join(dir, file.path), file.bytes);
  }
  return join(dir, 'SKILL.md');
}

/** The line the hook reads to name the atom of a skill it sees invoked (`apps/hook`). */
export function recordInstall(
  projectReceipts: string,
  skill: string,
  receipt: SignedContentReceipt,
): void {
  mkdirSync(dirname(projectReceipts), { recursive: true });
  const at = new Date(receipt.receipt.servedAt * 1000).toISOString();
  appendFileSync(
    projectReceipts,
    `${JSON.stringify({ skill, atom: receipt.receipt.atom, url: receipt.receipt.url, at, receipt })}\n`,
  );
}

/** Park the files where nothing loads them, for `arp skills accept` to ask about. */
export function writePending(
  pendingDir: string,
  skill: string,
  receipt: SignedContentReceipt,
  files: readonly BundleFile[],
): string {
  if (!SAFE_SKILL_NAME.test(skill)) throw new Error(`${skill} is not a plain directory name`);
  const dir = join(pendingDir, skill);
  rmSync(dir, { recursive: true, force: true });
  for (const file of files) {
    mkdirSync(dirname(join(dir, 'files', file.path)), { recursive: true });
    writeFileSync(join(dir, 'files', file.path), file.bytes);
  }
  const record: PendingRecord = { skill, receipt };
  writeFileSync(join(dir, 'receipt.json'), `${JSON.stringify(record)}\n`);
  return dir;
}

function walk(root: string, at = root): string[] {
  return readdirSync(at).flatMap((name) => {
    const path = join(at, name);
    return statSync(path).isDirectory()
      ? walk(root, path)
      : [relative(root, path).split('\\').join('/')];
  });
}

/** A pending skill as it is on disk now, whatever was written there since. */
export function readPending(
  pendingDir: string,
  skill: string,
): { record: PendingRecord; files: BundleFile[] } | null {
  if (!SAFE_SKILL_NAME.test(skill)) return null;
  const dir = join(pendingDir, skill);
  if (!existsSync(join(dir, 'receipt.json')) || !existsSync(join(dir, 'files'))) return null;
  // Written by `writePending`; checked against the receipt before anything is installed.
  const record = JSON.parse(readFileSync(join(dir, 'receipt.json'), 'utf8')) as PendingRecord;
  const files = walk(join(dir, 'files')).map((path) => ({
    path,
    bytes: new Uint8Array(readFileSync(join(dir, 'files', path))),
  }));
  return { record, files };
}

/** Every skill waiting for an answer. */
export function listPending(pendingDir: string): string[] {
  if (!existsSync(pendingDir)) return [];
  return readdirSync(pendingDir)
    .filter((name) => existsSync(join(pendingDir, name, 'receipt.json')))
    .sort();
}

export function removePending(pendingDir: string, skill: string): void {
  if (SAFE_SKILL_NAME.test(skill))
    rmSync(join(pendingDir, skill), { recursive: true, force: true });
}
