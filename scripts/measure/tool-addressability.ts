import type { GraphqlReply } from '../helpers/shapes.js';
/** Of the tools agents actually declare, how many are addressable on a chain at all?
 *
 *  The gate of `tasks/22`. That task reads an agent's calldata to witness a tool use without
 *  anyone's cooperation — the strongest evidence class there is — and its own limit section says
 *  the subset it covers is unknown: *"Most tools are not contracts. An MCP server, a REST API, an
 *  LLM call — none leave calldata."*
 *
 *  Step 1 of the task specifies the key as `same as` → the agent's CAIP-10 operating account
 *  (ADR `0026`). **That join does not exist** — `scripts/measure/caip10-join.ts`, re-run
 *  2026-10-27: 20 caip10 atoms on testnet, 0 edges of any predicate pointing at one. So the
 *  sender side cannot be resolved today, and the task's premise has to be tested from the other
 *  end: not "whose calls can we read" but "is there anything in these calls to read".
 *
 *      bun run scripts/measure/tool-addressability.ts
 *
 *  Read-only: one GraphQL query per chain. Signs nothing, writes nothing.
 *
 *  A tool is **witnessable from calldata** only if it is a contract — an EVM address, or a CAIP-10
 *  or CAIP-19 identifier naming one. A `github.com/...` URL, an `ipfs://` document or a bare name
 *  is not, however real the tool behind it is.
 */
const USES = '0x5c0bde1cc696456c0268248c4656acdf9621fdb39e605bc99b0a83dc8ff6e800';

// `label` is the atom's display name; the **URI** lives under `value.thing.url`. Classifying on
// the label alone reported 0% URLs, which was an artefact of reading the wrong field — ARP's own
// tool atoms are Things named `Slither` carrying `https://github.com/crytic/slither`.
const Q = `query($pid: String!) {
  triples(where: {predicate_id: {_eq: $pid}}, limit: 500) {
    object { term_id label value { thing { url } } }
  }
}`;

const NETS: [string, string][] = [
  ['mainnet 1155', 'https://mainnet.intuition.sh/v1/graphql'],
  ['testnet 13579', 'https://testnet.intuition.sh/v1/graphql'],
];

/** A bare 20-byte address, or one carried inside a CAIP identifier. */
const ADDRESS = /0x[0-9a-fA-F]{40}\b/;
const CAIP_EVM = /^caip1[09]:eip155:\d+:/i;

type Bucket = 'contract' | 'url' | 'other';

function classify(label: string): Bucket {
  const trimmed = label.trim();
  if (CAIP_EVM.test(trimmed) && ADDRESS.test(trimmed)) return 'contract';
  // An address on its own, with nothing else in the label. `0x…` inside a sentence is a mention,
  // not an identifier, and counting it would inflate the one figure this script exists to bound.
  if (/^0x[0-9a-fA-F]{40}$/.test(trimmed)) return 'contract';
  if (/^(https?:|ipfs:|ar:)/i.test(trimmed)) return 'url';
  return 'other';
}

type ToolObject = { term_id?: string; label?: string; value?: { thing?: { url?: string } } };

async function query(url: string): Promise<ToolObject[]> {
  const reply = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: Q, variables: { pid: USES } }),
  });
  const json = (await reply.json()) as GraphqlReply<{ triples?: { object?: ToolObject }[] }>;
  if (json.errors) throw new Error(json.errors.map((e) => e.message).join('; '));
  return (json.data?.triples ?? []).flatMap((t) => (t.object ? [t.object] : []));
}

for (const [name, url] of NETS) {
  const objects = await query(url);
  // The URI when the atom carries one, the label otherwise. The URI is what identifies the tool;
  // the label is what a reader sees.
  const distinct = new Map<string, string>();
  for (const o of objects) {
    // An empty `url` is as absent as a missing one — the graph returns `""` and `"null"` for a
    // Thing created without one, and both fell into "something else" wearing no label at all.
    const url = o.value?.thing?.url;
    const identifier = url !== undefined && url !== '' && url !== 'null' ? url : o.label;
    if (o.term_id !== undefined && identifier !== undefined) distinct.set(o.term_id, identifier);
  }

  const tally: Record<Bucket, string[]> = { contract: [], url: [], other: [] };
  for (const label of distinct.values()) tally[classify(label)].push(label);

  const n = distinct.size;
  const pc = (k: number) => (n === 0 ? '—' : `${((100 * k) / n).toFixed(0)}%`);
  console.log(`\n${name}  —  ${objects.length} \`uses\` edges, ${n} distinct tool objects`);
  console.log(
    `  addressable on a chain (contract)  ${String(tally.contract.length).padStart(4)}  ${pc(tally.contract.length)}`,
  );
  console.log(
    `  a URL or a document                ${String(tally.url.length).padStart(4)}  ${pc(tally.url.length)}`,
  );
  console.log(
    `  a name, or something else          ${String(tally.other.length).padStart(4)}  ${pc(tally.other.length)}`,
  );
  for (const label of tally.contract.slice(0, 10)) console.log(`      contract: ${label}`);
  for (const label of tally.url.slice(0, 5)) console.log(`      url:      ${label.slice(0, 70)}`);
  for (const label of tally.other.slice(0, 5)) console.log(`      other:    ${label.slice(0, 70)}`);
}

console.log(
  '\nA tool that is not a contract leaves no calldata, so no amount of indexing witnesses its use.',
);
