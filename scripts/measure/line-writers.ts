/** Who wrote the result lines and the `uses` edges on testnet 13579. Holds no key.
 *
 *      bun run scripts/measure/line-writers.ts
 *
 *  `docs/30` says no third party has reported a result on a skill: this is the check. The result lines are the
 *  `has outcome` triples. The `uses` edges are printed too, because a `uses` edge alone is a line (`docs/28`) and
 *  most of them are not ours, so "no third party wrote a line" would be false. A wallet holding a position on a result
 *  line can also stand behind it (`pulse-usage.ts`), so holders outside our two wallets are counted as well, and
 *  those our treasury paid for are told apart from the others. `scripts/helpers/line-writers.ts` holds the reads.
 */
import {writeFileSync} from "node:fs";

import {hasOutcomeAtom, holdersOf, OURS, readResultLines, USES, writers} from "../helpers/line-writers.ts";

const hasOutcome = await hasOutcomeAtom();
const at = new Date().toISOString();
const holders = await holdersOf(await readResultLines(hasOutcome));
const result = {at, chain: 13579, ourWallets: [...OURS], resultLines: {...(await writers(hasOutcome)), holders}, usesEdges: await writers(USES)};
console.log(JSON.stringify(result, null, 1));
writeFileSync(`data/measurements/line-writers-${at.slice(0, 16).replace(":", "")}.json`, `${JSON.stringify(result, null, 1)}\n`);
