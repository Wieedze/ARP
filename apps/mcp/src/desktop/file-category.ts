/**
 * `arp_file_category`: file a skill under a category through the sponsor (task 59, ADR `0124`).
 *
 * The agent signs nothing and pays nothing. The sponsor checks the proposal against the same rules
 * as every category (`docs/25` §8) and writes it as the index's attestor. An existing category
 * writes only the tag; a new one needs a parent and a reason.
 *
 * Every IO is injected, so the test needs no server.
 */
export type FileCategoryArgs = { id: string; category: string; parent?: string; reason?: string };

export type FileCategoryAnswer =
  | { filed: string; new_category: boolean; written: boolean }
  | { refused: string; detail: string }
  | { error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export async function fileCategory(
  args: FileCategoryArgs,
  deps: { sponsorUrl: string; fetch: (url: string, init: RequestInit) => Promise<Response> },
): Promise<FileCategoryAnswer> {
  const body = {
    label: args.category,
    subjectId: args.id,
    ...(args.parent === undefined ? {} : { parent: args.parent }),
    ...(args.reason === undefined ? {} : { reason: args.reason }),
  };
  let response: Response;
  try {
    response = await deps.fetch(`${deps.sponsorUrl}/propose-category`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return { error: "ARP's sponsor is not reachable, so the category was not filed." };
  }
  const answer: unknown = await response.json().catch(() => null);
  if (response.ok && isRecord(answer) && typeof answer['label'] === 'string') {
    return {
      filed: answer['label'],
      new_category: answer['newCategory'] === true,
      written: answer['created'] === true,
    };
  }
  const rule = isRecord(answer) && typeof answer['rule'] === 'string' ? answer['rule'] : 'unknown';
  const detail =
    isRecord(answer) && typeof answer['error'] === 'string'
      ? answer['error']
      : `HTTP ${response.status}`;
  return { refused: rule, detail };
}
