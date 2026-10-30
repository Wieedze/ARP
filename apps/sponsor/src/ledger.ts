/** What the sponsoring service has paid for, appended to a file and read once at start.
 *
 *  **Not a database, and not memory alone.** Task 37 asked for no database, and a record held in
 *  memory is reset by a restart, which is the cheapest thing an attacker can wait for: every proof
 *  would sponsor a second deposit and every agent would get its gas twice. So one JSONL file, the
 *  same device as the node's `PaymentLedger` (`apps/node/src/task.ts`). The day's counts and the
 *  budget are derived from it, and the service's balance stays the hard limit behind it.
 *
 *  **Written before the send, settled after it.** A spend is reserved as a `pending` row before the
 *  key is used, then settled `success` or `reverted` once the outcome is known. A send whose outcome
 *  is never known — the RPC fails while the receipt is awaited, a read after it throws, the process
 *  dies — stays pending, and a pending row counts as spent. Otherwise a flaky RPC would hand the
 *  same proof a second deposit and the same agent its gas twice. The cost of the other direction
 *  is one proof refused that did not in fact spend, which the operator can see in `pending()`.
 *
 *  Only a `reverted` row is not spent: the chain returned the value, so it neither counts toward
 *  the day's limits nor burns the proof.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

import type { SponsorRecord } from '@arp-protocol/core';
import { getAddress, type Hex } from 'viem';

export type SpendStatus = 'pending' | 'success' | 'reverted';

type Row = {
  kind: SponsorRecord['kind'];
  /** Absent on a row written before reservations existed: those were written after a success. */
  status?: SpendStatus;
  subject: string;
  value: string;
  at: number;
  key?: string;
  termId?: string;
  curveId?: string;
  shares?: string;
};

/** The settlement of a reserved row, appended as its own line so the file stays append-only. */
type Settlement = {
  settle: string;
  kind: SponsorRecord['kind'];
  status: Exclude<SpendStatus, 'pending'>;
  hash?: string;
  shares?: string;
};

type Entry = { record: SponsorRecord; status: SpendStatus; hash?: Hex };

function toRow(record: SponsorRecord, status: SpendStatus): Row {
  return {
    kind: record.kind,
    status,
    subject: record.subject,
    value: record.value.toString(),
    at: record.at,
    ...(record.key === undefined ? {} : { key: record.key }),
    ...(record.termId === undefined ? {} : { termId: record.termId }),
    ...(record.curveId === undefined ? {} : { curveId: record.curveId.toString() }),
    ...(record.shares === undefined ? {} : { shares: record.shares.toString() }),
  };
}

function fromRow(row: Row): SponsorRecord {
  return {
    kind: row.kind,
    subject: getAddress(row.subject),
    value: BigInt(row.value),
    at: row.at,
    ...(row.key === undefined ? {} : { key: row.key }),
    // Written by `toRow` from a `Hex`, and read back only from this service's own file.
    ...(row.termId === undefined ? {} : { termId: row.termId as Hex }),
    ...(row.curveId === undefined ? {} : { curveId: BigInt(row.curveId) }),
    ...(row.shares === undefined ? {} : { shares: BigInt(row.shares) }),
  };
}

export class SponsorLedger {
  private readonly entries: Entry[] = [];

  /** `null` keeps the record in memory only, for tests. */
  constructor(private readonly path: string | null) {
    if (path === null || !existsSync(path)) return;
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      if (line.trim().length === 0) continue;
      let parsed: Row | Settlement;
      try {
        parsed = JSON.parse(line) as Row | Settlement; // This service's own format, written below.
      } catch {
        // A half-written last line from a crash. A reservation is written before its send, so the
        // line lost here is a settlement at worst, and its reservation still counts as spent.
        continue;
      }
      if ('settle' in parsed) this.applySettlement(parsed);
      else this.entries.push({ record: fromRow(parsed), status: parsed.status ?? 'success' });
    }
  }

  /** What was spent, or may have been: every row but a reverted one. What the limits count. */
  get records(): readonly SponsorRecord[] {
    return this.entries.filter((e) => e.status !== 'reverted').map((e) => e.record);
  }

  /** Reservations whose outcome is unknown, for the operator to reconcile against the chain. */
  pending(): readonly SponsorRecord[] {
    return this.entries.filter((e) => e.status === 'pending').map((e) => e.record);
  }

  /** Whether `key` is spent: reserved, pending or settled, and not reverted. */
  has(kind: SponsorRecord['kind'], key: string): boolean {
    return this.entries.some(
      (e) => e.status !== 'reverted' && e.record.kind === kind && e.record.key === key,
    );
  }

  /** A spend whose outcome is already known, written in one line. */
  append(record: SponsorRecord): void {
    this.write(toRow(record, 'success'));
    this.entries.push({
      record: { ...record, subject: getAddress(record.subject) },
      status: 'success',
    });
  }

  /**
   * A spend about to be made, written before the key is used. `record.key` is required: it is what
   * {@link settle} finds the row by, and what {@link has} refuses a second spend on.
   */
  reserve(record: SponsorRecord & { key: string }): void {
    if (this.has(record.kind, record.key)) {
      throw new Error(`${record.kind} ${record.key} is already reserved`);
    }
    this.write(toRow(record, 'pending'));
    this.entries.push({
      record: { ...record, subject: getAddress(record.subject) },
      status: 'pending',
    });
  }

  /** The outcome of a reserved spend. `shares` fills a deposit's minted shares once read. */
  settle(
    kind: SponsorRecord['kind'],
    key: string,
    outcome: { status: 'success'; hash: Hex; shares?: bigint } | { status: 'reverted'; hash: Hex },
  ): void {
    const settlement: Settlement = {
      settle: key,
      kind,
      status: outcome.status,
      hash: outcome.hash,
      ...(outcome.status === 'success' && outcome.shares !== undefined
        ? { shares: outcome.shares.toString() }
        : {}),
    };
    if (!this.applySettlement(settlement)) throw new Error(`no pending ${kind} ${key} to settle`);
    this.write(settlement);
  }

  private applySettlement(settlement: Settlement): boolean {
    const entry = this.entries.find(
      (e) =>
        e.status === 'pending' &&
        e.record.kind === settlement.kind &&
        e.record.key === settlement.settle,
    );
    if (entry === undefined) return false;
    entry.status = settlement.status;
    if (settlement.hash !== undefined) entry.hash = settlement.hash as Hex; // Written from a `Hex`.
    if (settlement.shares !== undefined)
      entry.record = { ...entry.record, shares: BigInt(settlement.shares) };
    return true;
  }

  private write(line: Row | Settlement): void {
    if (this.path === null) return;
    mkdirSync(dirname(this.path), { recursive: true });
    appendFileSync(this.path, `${JSON.stringify(line)}\n`);
  }
}
