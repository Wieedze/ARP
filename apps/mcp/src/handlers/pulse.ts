import { execFile } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import {
  findDeclaredTools,
  fuseSearches,
  findToolAtoms,
  getPulseUsage,
  githubPulseSource,
  groupByContent,
  BECAUSE_LABEL,
  type Capability,
  HAS_OUTCOME_LABEL,
  inferDomain,
  type LocalFailure,
  parseLocalFailures,
  parseSkillsFind,
  readDomainTree,
  readPulse,
  readThingUrl,
  SCORE_VERSION,
  scoreSkill,
  type SignalContext,
  signalOf,
  skillRefFromUrl,
  toolAtomUri,
  type PulseUsage,
  type SkillPulse,
  type SkillSearchResult,
  workedInDomain,
  yourFailures,
} from '@arp-protocol/core';
import { arpHome } from '@arp-protocol/core/node';
import { stringToHex } from 'viem';

import { DESKTOP, DOMAIN_ROOT, domainWalk, GRAPHQL, IN_CONTEXT_OF, LINE_PAYERS, READ_ONLY, reads } from '../config.js';
import { agentsForDomain } from './agents.js';
import { type JsonRpcId, fail, text } from '../rpc.js';

const run = promisify(execFile);
const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 20;
/** A ceiling on what one call asks of a service that is not ours. */
const MAX_PHRASES = 4;

/**
 * The version the comparison ran on. 1.7.4 returns at most 20 results where this returns up to 100, so
 * a bump changes what an agent can find, and is a change to review.
 */
export const SKILLS_CLI = 'skills@1.7.6';

/**
 * How the search runs, as data so a test can hold it to this: a pinned package, the query as one
 * argument and never through a shell, and an environment of four variables. It is somebody else's
 * package, and `task-verifier` found the first version handing it the server's whole environment.
 * `HOME` is a private directory, so a default path to a key does not resolve to one. It is not in a
 * shared `/tmp`, where another account could plant the `.npmrc` that chooses npm's registry. The package
 * still runs as the same OS user, which is why a server holding an agent key does not run it (`canSearch`) and `docs/22`
 * says so.
 */
export function searchInvocation(query: string, path: string | undefined, home: string) {
  return {
    file: 'npx',
    args: ['--yes', SKILLS_CLI, 'find', query],
    env: {
      ...(path === undefined ? {} : { PATH: path }),
      HOME: home,
      DISABLE_TELEMETRY: '1',
      NO_COLOR: '1',
    },
  };
}

/** Off when the operator says so, and in the modes that keep an agent key on this machine (ADR `0110`). */
export function canSearch(env: { holdsAgentKey: boolean; setting: string | undefined }): boolean {
  return !env.holdsAgentKey && env.setting !== 'off';
}

/** A failure is a value, because a host without `npx` can still pass `search_output` itself. */
async function search(query: string): Promise<{ output: string } | { error: string }> {
  if (!canSearch({ holdsAgentKey: DESKTOP, setting: process.env['ARP_PULSE_SEARCH'] })) {
    return { error: 'this server does not run the search package' };
  }
  try {
    const home = join(arpHome(process.env, homedir()), 'skills-cli');
    mkdirSync(home, { recursive: true, mode: 0o700 });
    chmodSync(home, 0o700); // `mode` above does not tighten a directory that already exists
    const { file, args, env } = searchInvocation(query, process.env['PATH'], home);
    const { stdout } = await run(file, args, { env, timeout: 90_000, maxBuffer: 4_000_000 });
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
  /** What the person can supply. It weighs a declared failure and sets nothing aside (ADR `0138`). */
  canProvide: ReadonlySet<Capability>;
};

function readConstraints(raw: unknown): Constraints {
  const given = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}; // read field by field
  const have = given['have_commands'];
  const provide = given['can_provide'];
  return {
    noKeys: given['no_keys'] === true,
    noLogin: given['no_login'] === true,
    noPaid: given['no_paid'] === true,
    noScripts: given['no_scripts'] === true,
    haveCommands: Array.isArray(have)
      ? new Set(have.filter((name): name is string => typeof name === 'string'))
      : null,
    canProvide: new Set(
      Array.isArray(provide)
        ? provide.filter((thing): thing is Capability => thing === 'key' || thing === 'program' || thing === 'file')
        : [],
    ),
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

export function usageLine(usage: PulseUsage | undefined, domain: string | null) {
  if (usage === undefined || usage.declarations.length === 0) {
    return { written_by_agents: 'nobody yet, so unknown', ...(usage?.truncated === true ? { truncated: true } : {}) };
  }
  return {
    declarations: usage.declarations.length,
    agents: usage.agents,
    wallets: usage.wallets,
    ...(domain === null ? {} : { in_this_domain: usage.byDomain[domain] ?? 0 }),
    by_domain: usage.byDomain,
    by_outcome: usage.byOutcome,
    ...(Object.keys(usage.byReason).length === 0 ? {} : { by_reason: usage.byReason }),
    latest: usage.declarations
      .slice(-3)
      .map((row) => ({ agent: row.agent.label, by: row.writer, domains: row.domains, outcomes: row.outcomes, lines: row.lines })),
    ...(usage.byOthers.length === 0 ? {} : { written_by_others: usage.byOthers }),
    ...(usage.truncated ? { truncated: true } : {}),
  };
}

/** What this machine already hit (`docs/tasks/68`). Unreadable is empty: it must not cost the search. */
function readYourFailures(): LocalFailure[] {
  try {
    const path = join(arpHome(process.env, homedir()), 'failures.jsonl');
    return existsSync(path) ? parseLocalFailures(readFileSync(path, 'utf8')) : [];
  } catch {
    return [];
  }
}

export function yourFailuresLine(rows: readonly LocalFailure[], skill: string, source: string) {
  const found = yourFailures(rows, skill, source);
  if (found === null) return {};
  return {
    failed_on_this_machine: {
      reasons: found.reasons,
      last: found.last,
      ...(found.byNameOnly ? { matched_by_name_only: true } : {}),
    },
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
 * here sends them anywhere. It orders on a public score (`pulse-score.ts`), starting on the search's own
 * order, and each result shows the parts of its score. `ARP_PULSE_SCORE=off` keeps the earlier order, for
 * the comparison of `docs/tasks/64`.
 */
/**
 * What you call, beside what you install: one search with two kinds of result (ADR `0139`). A failure here
 * says so and takes nothing from the skills.
 */
async function agentsPart(domain: string | null): Promise<Record<string, unknown>> {
  if (domain === null) return { agents: null, agents_note: 'no domain was read from the need, so no agent was looked for. Pass `domain`' };
  try {
    return { agents: await agentsForDomain(domain) };
  } catch (error) {
    return { agents: null, agents_note: `not read: ${error instanceof Error ? error.message : String(error)}` };
  }
}

export async function pulse(id: JsonRpcId, args: Record<string, unknown>) {
  const query = args['query'];
  const given = args['search_output'];
  const phrasesRaw = args['queries'];
  const phrases = Array.isArray(phrasesRaw)
    ? phrasesRaw.filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '').slice(0, MAX_PHRASES)
    : [];
  if (typeof query === 'string' && query.trim() !== '' && phrases.length < MAX_PHRASES && !phrases.includes(query)) phrases.push(query);
  if (phrases.length === 0 && typeof given !== 'string') {
    return fail(id, -32602, 'pass `queries`, `query`, or `search_output` holding the text of `npx skills find`');
  }
  const limitRaw = args['limit'];
  const limit = typeof limitRaw === 'number' ? Math.min(Math.max(1, Math.floor(limitRaw)), MAX_LIMIT) : DEFAULT_LIMIT;
  const domainRaw = args['domain'];
  const askedDomain = typeof domainRaw === 'string' && domainRaw.trim() !== '' ? domainRaw.trim().toLowerCase() : null;
  const constraints = readConstraints(args['constraints']);

  let lists: SkillSearchResult[][];
  if (typeof given === 'string') {
    lists = [parseSkillsFind(given)];
  } else {
    const found = await Promise.all(phrases.map(search));
    const answered = found.flatMap((entry) => ('output' in entry ? [entry.output] : []));
    if (answered.length === 0) {
      const first = found[0];
      return text(id, {
        search: 'unavailable',
        detail: first !== undefined && 'error' in first ? first.error : 'no search ran',
        // In the plugin this is the only search there is, so nothing here may point at another tool.
        next: READ_ONLY
          ? 'run `npx skills find` yourself and pass its text as `search_output`. No other search is served here, so say that the search did not run, rather than choosing from memory'
          : 'run `npx skills find` yourself and pass its text as `search_output`, or use `arp_find_tools`',
        ...(await agentsPart(askedDomain)),
      });
    }
    lists = answered.map(parseSkillsFind);
  }

  const searched: SkillSearchResult[] = fuseSearches(lists);

  // Everything about the public record degrades to "unknown", and the file facts still come: the first
  // comparison lost 4 of 9 runs to one failed read.
  const scored = process.env['ARP_PULSE_SCORE'] !== 'off';
  let domain = askedDomain;
  let scope: Set<string> | null = domain === null ? null : new Set([domain]);
  const near = new Set<string>();
  let results = searched;
  let atomByUri = new Map<string, string>();
  let usage = new Map<string, PulseUsage>();
  let usageRead = true;
  try {
    if (scored) {
      const tree = await readDomainTree(domainWalk());
      if (domain === null && phrases.length > 0) domain = inferDomain(phrases.join(' '), tree.subtree(DOMAIN_ROOT));
      if (domain !== null) {
        scope = new Set(tree.subtree(domain).concat(domain));
        for (const label of tree.subtree(domain)) near.add(label);
        const above = tree.pathToRoot(domain);
        // The root says only that it is a tool, so a line there is about nothing nearer than any other.
        if (above.found) for (const label of above.path) if (label !== DOMAIN_ROOT) near.add(label);
        near.delete(domain);
      }
      const declared =
        scope === null
          ? []
          : await findDeclaredTools([...scope], { graphqlUrl: GRAPHQL, inContextOf: IN_CONTEXT_OF, readThing: readThingUrl });
      const seen = new Set(searched.map((row) => `${row.source}?skill=${row.skill}`.toLowerCase()));
      const added: SkillSearchResult[] = [];
      for (const { url } of declared) {
        const ref = skillRefFromUrl(url);
        if (ref === null || seen.has(`${ref.repo}?skill=${ref.skill}`.toLowerCase())) continue;
        added.push({ source: ref.repo, skill: ref.skill, installs: null, installsText: null, url: null });
      }
      results = [...searched, ...added];
    }
    atomByUri = await findToolAtoms(
      results.map((row) => toolUriOf(row.source, row.skill)).filter((uri): uri is string => uri !== null),
      { graphqlUrl: GRAPHQL },
    );
    usage = await getPulseUsage([...atomByUri.values()], {
      graphqlUrl: GRAPHQL,
      inContextOf: IN_CONTEXT_OF,
      hasOutcome: await reads.atomId(stringToHex(HAS_OUTCOME_LABEL)),
      because: await reads.atomId(stringToHex(BECAUSE_LABEL)),
      payers: LINE_PAYERS,
    });
  } catch (error) {
    usageRead = false;
    console.error(`arp_pulse: usage not read: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (results.length === 0) return text(id, { search: 'npx skills find', results: [], ...(await agentsPart(domain)) });

  const atomOf = (result: SkillSearchResult) => {
    const uri = toolUriOf(result.source, result.skill);
    return uri === null ? null : (atomByUri.get(uri) ?? null);
  };
  const usageOf = (result: SkillSearchResult) => {
    const atom = atomOf(result);
    return atom === null ? undefined : usage.get(atom.toLowerCase());
  };
  const rankOf = new Map(searched.map((row, rank) => [`${row.source}@${row.skill}`, rank]));
  const signal: SignalContext = { domain, near, canProvide: constraints.canProvide };
  const scoreOf = (result: SkillSearchResult) => {
    const { worked, failed, failuresThatDoNotApply, heard } = signalOf(usageOf(result), signal);
    return {
      ...scoreSkill({ rank: rankOf.get(`${result.source}@${result.skill}`) ?? null, total: searched.length, worked, failed }),
      ...(failuresThatDoNotApply === 0 ? {} : { failures_that_do_not_apply: failuresThatDoNotApply }),
      ...(heard.worked === 0 && heard.failed === 0 ? {} : { too_few_wallets_to_move_the_order: heard }),
    };
  };
  const workedHere = (result: SkillSearchResult) =>
    domain === null ? 0 : workedInDomain(usageOf(result), domain);

  const ordered = results
    .map((result, order) => ({ result, order }))
    .sort((a, b) =>
      scored
        ? scoreOf(b.result).score - scoreOf(a.result).score || a.order - b.order
        : workedHere(b.result) - workedHere(a.result) || a.order - b.order,
    )
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

  const mine = readYourFailures();

  return text(id, {
    search: typeof given === 'string' ? 'search_output' : 'npx skills find',
    ...(phrases.length > 1 ? { phrases } : {}),
    results_found: results.length,
    results_read: pulses.length,
    order: scored
      ? `score ${SCORE_VERSION}: (prior from the search's rank + worked) / (1 + worked + failed), each a sum over distinct wallets, weighed by domain and reason; deposits do not count`
      : domain === null
        ? "the search's own"
        : `wallets that said it worked in "${domain}", then the search's own`,
    ...(domain === null ? {} : { domain }),
    read_this:
      'The score ranks this search from public signals and does not say a skill works. Mentions are matches in the file, ' +
      'not requirements. Installs are the search\'s figure, not a count of use. What agents wrote is what they paid to say.',
    skills: distinct.slice(0, limit).map((entry) => ({
      ...factsOf(entry.row, copies),
      ...yourFailuresLine(mine, entry.row.skill, entry.row.source),
      ...(scored ? { score: Number(scoreOf(entry.row).score.toFixed(3)), score_parts: scoreOf(entry.row) } : {}),
      ...(toCheck(entry.row, constraints).length === 0 ? {} : { check_against_constraints: toCheck(entry.row, constraints) }),
      ...(entry.atom === null ? {} : { atom_id: entry.atom }),
      usage: usageRead ? usageLine(entry.usage, domain) : { unknown: 'the public record did not answer' },
    })),
    set_aside: rows
      .filter((entry) => entry.reasons.length > 0)
      .slice(0, 10)
      .map((entry) => ({ name: entry.row.skill, source: entry.row.source, because: entry.reasons })),
    ...(await agentsPart(domain)),
  });
}
