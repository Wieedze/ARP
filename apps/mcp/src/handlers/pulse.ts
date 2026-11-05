import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import {
  findToolAtoms,
  getPulseUsage,
  githubPulseSource,
  groupByContent,
  HAS_OUTCOME_LABEL,
  parseSkillsFind,
  readPulse,
  skillRefFromUrl,
  toolAtomUri,
  type PulseUsage,
  type SkillPulse,
  type SkillSearchResult,
  workedInDomain,
} from '@arp-protocol/core';
import { stringToHex } from 'viem';

import { GRAPHQL, IN_CONTEXT_OF, reads } from '../config.js';
import { type JsonRpcId, fail, text } from '../rpc.js';

const run = promisify(execFile);
const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 20;

/**
 * The official CLI, with its telemetry off, and never through a shell: the query is one argument.
 * A failure is a value, because a host without `npx` can still pass `search_output` itself.
 */
async function search(query: string): Promise<{ output: string } | { error: string }> {
  try {
    const { stdout } = await run('npx', ['--yes', 'skills', 'find', query], {
      env: { ...process.env, DISABLE_TELEMETRY: '1', NO_COLOR: '1' },
      timeout: 90_000,
      maxBuffer: 4_000_000,
    });
    return { output: stdout };
  } catch (error) {
    return { error: error instanceof Error ? error.message.split('\n')[0] ?? 'failed' : String(error) };
  }
}

type Constraints = {
  noKeys: boolean;
  noLogin: boolean;
  noPaid: boolean;
  noScripts: boolean;
  /** Commands the person has. Given, a skill whose CLI is missing from it is set aside. */
  haveCommands: ReadonlySet<string> | null;
};

function readConstraints(raw: unknown): Constraints {
  const given = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}; // read field by field
  const have = given['have_commands'];
  return {
    noKeys: given['no_keys'] === true,
    noLogin: given['no_login'] === true,
    noPaid: given['no_paid'] === true,
    noScripts: given['no_scripts'] === true,
    haveCommands: Array.isArray(have)
      ? new Set(have.filter((name): name is string => typeof name === 'string'))
      : null,
  };
}

/**
 * Why this person's constraints set a skill aside. Only what the file states outright: a key's name,
 * a CLI it declares, a script it runs that needs a key or is not in its repository. The comparison of
 * 2026-11-05 showed why: filtering on `runs` set aside the one skill agents had said worked, over a
 * shell variable named `end`.
 */
export function setAsideBecause(pulse: SkillPulse, constraints: Constraints): string[] {
  if (pulse.status !== 'read') return [];
  const reasons: string[] = [];
  if (constraints.noKeys && pulse.keys.length > 0) reasons.push(`mentions ${pulse.keys.join(', ')}`);
  if (constraints.noKeys) {
    for (const { file, keys } of pulse.keysInScriptsItRuns) {
      reasons.push(`runs ${file}, which mentions ${keys.join(', ')}`);
    }
  }
  if (constraints.noScripts && pulse.scripts > 0) reasons.push(`ships ${pulse.scripts} script(s)`);
  if (constraints.haveCommands !== null) {
    const missing = pulse.requires.cli.filter((name) => !constraints.haveCommands?.has(name));
    if (missing.length > 0) reasons.push(`declares ${missing.join(', ')}`);
    if (pulse.runsAbsentFiles.length > 0) {
      reasons.push(`runs ${pulse.runsAbsentFiles.join(', ')}, which its repository does not hold`);
    }
  }
  return reasons;
}

/** Word matches, which can be wrong either way. They do not set a skill aside: the reader checks them. */
export function toCheck(pulse: SkillPulse, constraints: Constraints): string[] {
  if (pulse.status !== 'read') return [];
  const lines: string[] = [];
  if (constraints.noLogin && pulse.requires.login !== null) {
    lines.push(`login, line ${pulse.requires.login.line}: ${pulse.requires.login.text}`);
  }
  if (constraints.noPaid && pulse.paidWords.length > 0) lines.push(`paid words: ${pulse.paidWords.join(', ')}`);
  if (constraints.haveCommands !== null) {
    const missing = pulse.requires.runs.filter((name) => !constraints.haveCommands?.has(name));
    if (missing.length > 0) lines.push(`commands in its instructions: ${missing.join(', ')}`);
  }
  return lines;
}

/** A result's atom URI, computed from its URL. `null` for a result that is not on GitHub. */
export function toolUriOf(source: string, skill: string): string | null {
  if (!/^[\w.-]+\/[\w.-]+$/.test(source)) return null;
  const url = `https://github.com/${source}?skill=${encodeURIComponent(skill)}`;
  return skillRefFromUrl(url) === null ? null : toolAtomUri(url);
}

/** A few at a time, because each atom id is one read of a public RPC. */
async function inBatches<T, R>(items: readonly T[], read: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let at = 0; at < items.length; at += 4) {
    out.push(...(await Promise.all(items.slice(at, at + 4).map(read))));
  }
  return out;
}

function usageLine(usage: PulseUsage | undefined, domain: string | null) {
  if (usage === undefined || usage.declarations.length === 0) {
    return { written_by_agents: 'nobody yet, so unknown' };
  }
  return {
    declarations: usage.declarations.length,
    agents: usage.agents,
    wallets: usage.wallets,
    ...(domain === null ? {} : { in_this_domain: usage.byDomain[domain] ?? 0 }),
    by_domain: usage.byDomain,
    by_outcome: usage.byOutcome,
    latest: usage.declarations
      .slice(-3)
      .map((row) => ({ agent: row.agent.label, by: row.writer, domains: row.domains, outcomes: row.outcomes })),
    ...(usage.byOthers.length === 0 ? {} : { written_by_others: usage.byOthers }),
    ...(usage.truncated ? { truncated: true } : {}),
  };
}

function factsOf(pulse: SkillPulse, copies: Map<string, SkillPulse[]>) {
  const base = {
    name: pulse.skill,
    source: pulse.source,
    url: pulse.url,
    installs_on_skills_sh: pulse.installsText,
    status: pulse.status,
  };
  if (pulse.status !== 'read') {
    return { ...base, ...(pulse.status === 'ambiguous' ? { paths: pulse.paths } : {}), read: 'not read, so what it needs is unknown' };
  }
  const same = (copies.get(pulse.contentId) ?? []).filter((other) => other.source !== pulse.source);
  return {
    ...base,
    content_id: pulse.contentId,
    path: pulse.path,
    size: { files: pulse.files, bytes: pulse.bytes, scripts: pulse.scripts },
    its_file_mentions: {
      ...(pulse.keys.length === 0 ? {} : { keys: pulse.keys }),
      ...(pulse.keysInScriptsItRuns.length === 0 ? {} : { keys_in_scripts_it_runs: pulse.keysInScriptsItRuns }),
      ...(pulse.requires.login === null ? {} : { login: pulse.requires.login }),
      ...(pulse.paidWords.length === 0 ? {} : { paid_words: pulse.paidWords }),
      ...(pulse.hosts.length === 0 ? {} : { hosts: pulse.hosts }),
    },
    declares_cli: pulse.requires.cli,
    runs: pulse.requires.runs,
    ...(pulse.runsAbsentFiles.length === 0 ? {} : { runs_files_not_in_its_repository: pulse.runsAbsentFiles }),
    ...(pulse.repository === null ? {} : { repository: pulse.repository }),
    ...(same.length === 0
      ? {}
      : { same_content_in: same.map((other) => ({ source: other.source, installs: other.installsText })) }),
    ...(pulse.differsAt.length === 0 ? {} : { other_files_with_this_name: pulse.differsAt }),
  };
}

/**
 * `arp_pulse`: a search, what each result's files show, and what agents wrote about it (task 63).
 *
 * Holds no key and writes nothing. The constraints are the person's and stay in this call: nothing
 * here sends them anywhere. It orders on one visible fact, how many wallets said it worked in the
 * domain asked about, and then keeps the search's own order. A declared failure never lifts a skill. There is no composed score (ADR `0046`).
 */
export async function pulse(id: JsonRpcId, args: Record<string, unknown>) {
  const query = args['query'];
  const given = args['search_output'];
  if ((typeof query !== 'string' || query.trim() === '') && typeof given !== 'string') {
    return fail(id, -32602, 'pass `query`, or `search_output` holding the text of `npx skills find`');
  }
  const limitRaw = args['limit'];
  const limit = typeof limitRaw === 'number' ? Math.min(Math.max(1, Math.floor(limitRaw)), MAX_LIMIT) : DEFAULT_LIMIT;
  const domainRaw = args['domain'];
  const domain = typeof domainRaw === 'string' && domainRaw.trim() !== '' ? domainRaw.trim().toLowerCase() : null;
  const constraints = readConstraints(args['constraints']);

  let output: string;
  if (typeof given === 'string') {
    output = given;
  } else {
    const found = await search(String(query));
    if ('error' in found) {
      return text(id, {
        search: 'unavailable',
        detail: found.error,
        next: 'run `npx skills find` yourself and pass its text as `search_output`, or use `arp_find_tools`',
      });
    }
    output = found.output;
  }

  const results: SkillSearchResult[] = parseSkillsFind(output);
  if (results.length === 0) return text(id, { search: 'npx skills find', results: [] });

  // What agents wrote comes first and is one query for every result, so a skill agents said worked is
  // read even when the search ranks it far down. If the chain is busy it degrades to "unknown" and
  // the file facts still come: the first comparison lost 4 of 9 runs to one failed read.
  const uriOf = (result: SkillSearchResult) => toolUriOf(result.source, result.skill);
  let atomByUri = new Map<string, string>();
  let usage = new Map<string, PulseUsage>();
  let usageRead = true;
  try {
    atomByUri = await findToolAtoms(
      results.map(uriOf).filter((uri): uri is string => uri !== null),
      { graphqlUrl: GRAPHQL },
    );
    usage = await getPulseUsage([...atomByUri.values()], {
      graphqlUrl: GRAPHQL,
      inContextOf: IN_CONTEXT_OF,
      hasOutcome: await reads.atomId(stringToHex(HAS_OUTCOME_LABEL)),
    });
  } catch (error) {
    usageRead = false;
    console.error(`arp_pulse: usage not read: ${error instanceof Error ? error.message : String(error)}`);
  }
  const atomOf = (result: SkillSearchResult) => {
    const uri = uriOf(result);
    return uri === null ? null : (atomByUri.get(uri) ?? null);
  };
  const usageOf = (result: SkillSearchResult) => {
    const atom = atomOf(result);
    return atom === null ? undefined : usage.get(atom.toLowerCase());
  };
  const workedHere = (result: SkillSearchResult) =>
    domain === null ? 0 : workedInDomain(usageOf(result), domain);

  const ordered = results
    .map((result, order) => ({ result, order }))
    .sort((a, b) => workedHere(b.result) - workedHere(a.result) || a.order - b.order)
    .map(({ result }) => result);

  const token = process.env['GITHUB_TOKEN'];
  const source = githubPulseSource(token === undefined ? {} : { token });
  // Read more than asked, because the constraints and the copies can remove most of a short list.
  const window = ordered.slice(0, Math.min(limit * 3, 30));
  const pulses = await inBatches(window, (result) =>
    readPulse(result, source).catch(
      (): SkillPulse => ({ ...result, status: 'repository_unreachable' }),
    ),
  );

  const copies = new Map<string, SkillPulse[]>();
  for (const group of groupByContent(pulses)) copies.set(group.contentId, group.members);

  const rows = pulses.map((row) => ({
    row,
    atom: atomOf(row),
    usage: usageOf(row),
    reasons: setAsideBecause(row, constraints),
  }));
  const kept = rows.filter((entry) => entry.reasons.length === 0);

  // One line per content: a directory in nine repositories is one thing to decide about, once.
  const shown = new Set<string>();
  const distinct = kept.filter(({ row }) => {
    if (row.status !== 'read') return true;
    if (shown.has(row.contentId)) return false;
    shown.add(row.contentId);
    return true;
  });

  return text(id, {
    search: typeof given === 'string' ? 'search_output' : 'npx skills find',
    results_found: results.length,
    results_read: pulses.length,
    order: domain === null ? "the search's own" : `wallets that said it worked in "${domain}", then the search's own`,
    read_this:
      'Mentions are matches in the file, not requirements. Installs are the search\'s figure, not a count of use. ' +
      'What agents wrote is what they paid to say.',
    skills: distinct.slice(0, limit).map((entry) => ({
      ...factsOf(entry.row, copies),
      ...(toCheck(entry.row, constraints).length === 0 ? {} : { check_against_constraints: toCheck(entry.row, constraints) }),
      ...(entry.atom === null ? {} : { atom_id: entry.atom }),
      usage: usageRead ? usageLine(entry.usage, domain) : { unknown: 'the public record did not answer' },
    })),
    set_aside: rows
      .filter((entry) => entry.reasons.length > 0)
      .slice(0, 10)
      .map((entry) => ({ name: entry.row.skill, source: entry.row.source, because: entry.reasons })),
  });
}
