/**
 * The one place a fetched skill is written to disk, and the person who has to say yes first
 * (task 61, deliverable D).
 *
 * **Nothing is written under the skills directory until a person accepts, and there is no flag,
 * setting or mode that turns the question off** (user decision 2026-11-03, « la question doit
 * toujours être posée »). The question is an MCP elicitation: the server asks the client, which
 * shows it to the person, and the model never sees it or answers it.
 *
 * Measured 2026-11-03 with a stub server (ADR `0127`): Claude Code 2.1.316 and 2.1.317 in a terminal
 * show the dialog and wait for the person, also under `--dangerously-skip-permissions`; `claude -p`
 * answers `cancel`; Claude Code in VS Code (2.1.317) declares elicitation and answers `decline`
 * without showing anything (anthropics/claude-code#98256, open). Any answer but an explicit accept
 * writes nothing and keeps nothing.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import {
  renderSkillPrompt,
  reviewSkill,
  skillRefFromUrl,
  type BundleFile,
  type SignedContentReceipt,
  type SkillPrompt,
  type ThirdPartyFigure,
} from '@arp-protocol/core';

/** A skill's name is used as a directory name; it comes from a URL. */
export const SAFE_SKILL_NAME = /^[a-z0-9][a-z0-9._-]*$/i;

/** `declined` is any answer but an explicit accept; `unavailable` is a client that cannot be asked. */
export type GateAnswer = 'accepted' | 'declined' | 'unavailable';

/** Facts the server knows and the files do not: the commit's date and third-party figures. */
export type ReviewContext = { committedAt: string | null; thirdParty: readonly ThirdPartyFigure[] };

/** The question a person reads, built from the receipt and the files that would be written. */
export function installPrompt(
  receipt: SignedContentReceipt,
  files: readonly BundleFile[],
  installPath: string,
  context: ReviewContext,
): SkillPrompt {
  const ref = skillRefFromUrl(receipt.receipt.url);
  return renderSkillPrompt(
    reviewSkill({
      repo: ref?.repo ?? receipt.receipt.url,
      skill: ref?.skill ?? receipt.receipt.url,
      path: receipt.receipt.path,
      commit: receipt.receipt.commit ?? 'a version 1 receipt names no commit',
      committedAt: context.committedAt,
      files,
      thirdParty: context.thirdParty,
    }),
    installPath,
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
