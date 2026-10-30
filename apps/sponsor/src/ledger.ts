/** What the sponsoring service has paid for, appended to a file and read once at start.
 *
 *  **Not a database, and not memory alone.** Task 37 asked for no database, and a record held in
 *  memory is reset by a restart, which is the cheapest thing an attacker can wait for: every proof
 *  would sponsor a second deposit and every agent would get its gas twice. So one JSONL file, the
 *  same device as the node's `PaymentLedger` (`apps/node/src/task.ts`). The day's counts and the
 *  budget are derived from it, and the service's balance stays the hard limit behind it.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

import type { SponsorRecord } from '@arp-protocol/core';
import { getAddress, type Hex } from 'viem';

type Row = {
  kind: SponsorRecord['kind'];
  subject: string;
  value: string;
  at: number;
  key?: string;
  termId?: string;
  curveId?: string;
  shares?: string;
};

function toRow(record: SponsorRecord): Row {
  return {
    kind: record.kind,
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
  private readonly rows: SponsorRecord[] = [];

  /** `null` keeps the record in memory only, for tests. */
  constructor(private readonly path: string | null) {
    if (path === null || !existsSync(path)) return;
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      if (line.trim().length === 0) continue;
      try {
        this.rows.push(fromRow(JSON.parse(line) as Row)); // This service's own format, written by `append`.
      } catch {
        // A half-written last line from a crash. The send it would have recorded may have landed,
        // which costs at most one deposit above the day's count; the balance bounds the rest.
        continue;
      }
    }
  }

  get records(): readonly SponsorRecord[] {
    return this.rows;
  }

  has(kind: SponsorRecord['kind'], key: string): boolean {
    return this.rows.some((r) => r.kind === kind && r.key === key);
  }

  append(record: SponsorRecord): void {
    if (this.path !== null) {
      mkdirSync(dirname(this.path), { recursive: true });
      appendFileSync(this.path, `${JSON.stringify(toRow(record))}\n`);
    }
    this.rows.push({ ...record, subject: getAddress(record.subject) });
  }
}
