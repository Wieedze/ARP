import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import {
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
} from '@arp-protocol/core';
import { stringToHex, type Hex } from 'viem';

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

/** Why this person's constraints set a skill aside, in words a reader can check against the file. */
export function setAsideBecause(pulse: SkillPulse, constraints: Constraints): string[] {
  if (pulse.status !== 'read') return [];
  const reasons: string[] = [];
  if (constraints.noKeys && pulse.keys.length > 0) reasons.push(`mentions ${pulse.keys.join(', ')}`);
  if (constraints.noLogin && pulse.requires.login !== null) {
    reasons.push(`mentions a login at line ${pulse.requires.login.line}`);
  }
  if (constraints.noPaid && pulse.paidWords.length > 0) reasons.push(`mentions ${pulse.paidWords.join(', ')}`);
  if (constraints.noScripts && pulse.scripts > 0) reasons.push(`ships ${pulse.scripts} script(s)`);
  if (constraints.haveCommands !== null && pulse.runsAbsentFiles.length > 0) {
    reasons.push(`runs ${pulse.runsAbsentFiles.join(', ')}, which its repository does not hold`);
  }
  if (constraints.haveCommands !== null) {
    const missing = [...pulse.requires.cli, ...pulse.requires.runs].filter(
      (name) => !constraints.haveCommands?.has(name),
    );
    if (missing.length > 0) reasons.push(`needs ${missing.join(', ')}`);
  }
  return reasons;
}

/** The tool's atom id, only for a result that has a URL on GitHub. A pure function of that URL. */
async function atomOf(pulse: SkillPulse): Promise<Hex | null> {
  if (pulse.status === 'not_github') return null;
  const url = `https://github.com/${pulse.source}?skill=${encodeURIComponent(pulse.skill)}`;
  if (skillRefFromUrl(url) === null) return null;
  return reads.atomId(stringToHex(toolAtomUri(url)));
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
 * here sends them anywhere. It orders on one visible fact, declarations in the domain asked about,
 * and then keeps the search's own order. There is no composed score (ADR `0046`).
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

  const token = process.env['GITHUB_TOKEN'];
  const source = githubPulseSource(token === undefined ? {} : { token });
  // Read more than asked, because the constraints and the copies can remove most of a short list.
  const window = results.slice(0, Math.min(limit * 3, 30));
  const pulses = await inBatches(window, (result) =>
    readPulse(result, source).catch(
      (): SkillPulse => ({ ...result, status: 'repository_unreachable' }),
    ),
  );

  // What agents wrote is one half of the answer, and the chain being busy must not cost the other
  // half: the first comparison lost 4 of 9 runs to one failed read. So it degrades to "unknown".
  let atoms: (Hex | null)[] = pulses.map(() => null);
  let usage = new Map<string, PulseUsage>();
  let usageRead = true;
  try {
    atoms = await inBatches(pulses, atomOf);
    usage = await getPulseUsage(
      atoms.filter((atom): atom is Hex => atom !== null),
      {
        graphqlUrl: GRAPHQL,
        inContextOf: IN_CONTEXT_OF,
        hasOutcome: await reads.atomId(stringToHex(HAS_OUTCOME_LABEL)),
      },
    );
  } catch (error) {
    usageRead = false;
    console.error(`arp_pulse: usage not read: ${error instanceof Error ? error.message : String(error)}`);
  }

  const copies = new Map<string, SkillPulse[]>();
  for (const group of groupByContent(pulses)) copies.set(group.contentId, group.members);

  const rows = pulses.map((row, index) => {
    const atom = atoms[index] ?? null;
    return { row, atom, usage: atom === null ? undefined : usage.get(atom.toLowerCase()), reasons: setAsideBecause(row, constraints) };
  });
  const declaredIn = (entry: (typeof rows)[number]) =>
    domain === null ? 0 : (entry.usage?.byDomain[domain] ?? 0);
  const kept = rows
    .filter((entry) => entry.reasons.length === 0)
    .map((entry, order) => ({ entry, order }))
    .sort((a, b) => declaredIn(b.entry) - declaredIn(a.entry) || a.order - b.order)
    .map(({ entry }) => entry);

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
    order: domain === null ? "the search's own" : `declarations in "${domain}", then the search's own`,
    read_this:
      'Mentions are matches in the file, not requirements. Installs are the search\'s figure, not a count of use. ' +
      'What agents wrote is what they paid to say.',
    skills: distinct.slice(0, limit).map((entry) => ({
      ...factsOf(entry.row, copies),
      ...(entry.atom === null ? {} : { atom_id: entry.atom }),
      usage: usageRead ? usageLine(entry.usage, domain) : { unknown: 'the public record did not answer' },
    })),
    set_aside: rows
      .filter((entry) => entry.reasons.length > 0)
      .slice(0, 10)
      .map((entry) => ({ name: entry.row.skill, source: entry.row.source, because: entry.reasons })),
  });
}
