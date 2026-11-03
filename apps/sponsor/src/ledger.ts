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
import { utcDay, type SponsorRecord } from '@arp-protocol/core';
import { appendJsonLine, lockFile, readJsonLines } from '@arp-protocol/core/node';
import { getAddress, type Address, type Hex } from 'viem';

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

/** The hash of a reserved row's transaction, sent and not yet confirmed. It stays pending. */
type SentNote = { sent: string; kind: SponsorRecord['kind']; hash: string };

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

/**
 * The ledger, indexed once at load and kept current on every write (ADR `0116`). The limits only
 * ever ask about the current UTC day, or about one subject's own history, so a request reads those
 * two slices and never the whole file's history again.
 */
export class SponsorLedger {
  private readonly entries: Entry[] = [];
  /** The latest entry per `(kind, key)`: a key re-reserved after a revert has two. */
  private readonly byKey = new Map<string, Entry>();
  private readonly byDay = new Map<number, Entry[]>();
  private readonly bySubject = new Map<string, Entry[]>();
  private readonly byKind = new Map<SponsorRecord['kind'], Entry[]>();
  private readonly lock: { release(): void } | null;

  /**
   * `null` keeps the record in memory only, for tests. A path is held exclusively: a second service
   * on the same file is refused, because two writers each count only their own spends.
   */
  constructor(private readonly path: string | null) {
    this.lock = path === null ? null : lockFile(path);
    if (path === null) return;
    for (const parsed of readJsonLines(path)) {
      // This service's own format, written below. A half-written last line from a crash is
      // skipped by `readJsonLines`: a reservation is written before its send, so the line lost is a
      // settlement at worst, and its reservation still counts as spent.
      const line = parsed as Row | Settlement | SentNote;
      if ('settle' in line) this.applySettlement(line);
      else if ('sent' in line) this.applySent(line);
      else this.index({ record: fromRow(line), status: line.status ?? 'success' });
    }
  }

  /** Releases the file for another process. */
  close(): void {
    this.lock?.release();
  }

  /** What was spent, or may have been: every row but a reverted one. The whole history. */
  get records(): readonly SponsorRecord[] {
    return spent(this.entries);
  }

  /**
   * What the limits need to decide for `subjects` at `now`: every spend on that UTC day, and every
   * spend in those subjects' own history, each once. The limit checks filter on one or the other,
   * so they decide the same on this slice as on {@link records}.
   */
  relevant(now: number, subjects: readonly Address[] = []): readonly SponsorRecord[] {
    const slice = new Set<Entry>(this.byDay.get(utcDay(now)) ?? []);
    for (const subject of subjects) {
      for (const entry of this.bySubject.get(subject.toLowerCase()) ?? []) slice.add(entry);
    }
    return spent([...slice]);
  }

  /** Spent records of `kind` whose key starts with `prefix`, across the whole history. */
  keyedWith(kind: SponsorRecord['kind'], prefix: string): readonly SponsorRecord[] {
    return spent(this.byKind.get(kind) ?? []).filter((r) => (r.key ?? '').startsWith(prefix));
  }

  /** Reservations whose outcome is unknown, for the operator to reconcile against the chain. */
  pending(): readonly SponsorRecord[] {
    return this.entries.filter((e) => e.status === 'pending').map((e) => e.record);
  }

  /** The transaction hash recorded for a reserved row, if one was. */
  hashOf(kind: SponsorRecord['kind'], key: string): Hex | undefined {
    return this.byKey.get(keyOf(kind, key))?.hash;
  }

  /**
   * A reserved spend's transaction was broadcast and its receipt did not come in time. It stays
   * pending, so it still counts as spent; the hash is what the operator reconciles it with.
   */
  noteSent(kind: SponsorRecord['kind'], key: string, hash: Hex): void {
    const note: SentNote = { sent: key, kind, hash };
    if (!this.applySent(note)) throw new Error(`no pending ${kind} ${key} to note`);
    this.write(note);
  }

  /** Whether `key` is spent: reserved, pending or settled, and not reverted. */
  has(kind: SponsorRecord['kind'], key: string): boolean {
    const entry = this.byKey.get(keyOf(kind, key));
    return entry !== undefined && entry.status !== 'reverted';
  }

  /** A spend whose outcome is already known, written in one line. */
  append(record: SponsorRecord): void {
    this.write(toRow(record, 'success'));
    this.index({ record: { ...record, subject: getAddress(record.subject) }, status: 'success' });
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
    this.index({ record: { ...record, subject: getAddress(record.subject) }, status: 'pending' });
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

  private index(entry: Entry): void {
    this.entries.push(entry);
    if (entry.record.key !== undefined)
      this.byKey.set(keyOf(entry.record.kind, entry.record.key), entry);
    const day = utcDay(entry.record.at);
    const onDay = this.byDay.get(day);
    if (onDay === undefined) this.byDay.set(day, [entry]);
    else onDay.push(entry);
    const ofKind = this.byKind.get(entry.record.kind);
    if (ofKind === undefined) this.byKind.set(entry.record.kind, [entry]);
    else ofKind.push(entry);
    const subject = entry.record.subject.toLowerCase();
    const own = this.bySubject.get(subject);
    if (own === undefined) this.bySubject.set(subject, [entry]);
    else own.push(entry);
  }

  private pendingEntry(kind: SponsorRecord['kind'], key: string): Entry | undefined {
    const entry = this.byKey.get(keyOf(kind, key));
    return entry?.status === 'pending' ? entry : undefined;
  }

  private applySettlement(settlement: Settlement): boolean {
    const entry = this.pendingEntry(settlement.kind, settlement.settle);
    if (entry === undefined) return false;
    entry.status = settlement.status;
    if (settlement.hash !== undefined) entry.hash = settlement.hash as Hex; // Written from a `Hex`.
    if (settlement.shares !== undefined)
      entry.record = { ...entry.record, shares: BigInt(settlement.shares) };
    return true;
  }

  private applySent(note: SentNote): boolean {
    const entry = this.pendingEntry(note.kind, note.sent);
    if (entry === undefined) return false;
    entry.hash = note.hash as Hex; // Written from a `Hex`.
    return true;
  }

  private write(line: Row | Settlement | SentNote): void {
    if (this.path === null) return;
    appendJsonLine(this.path, line);
  }
}

function keyOf(kind: SponsorRecord['kind'], key: string): string {
  return `${kind}\u0000${key}`;
}

function spent(entries: readonly Entry[]): SponsorRecord[] {
  return entries.filter((e) => e.status !== 'reverted').map((e) => e.record);
}
