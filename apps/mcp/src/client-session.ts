/**
 * What the client that launched this server can do, and the one request this server sends it.
 *
 * Until task 61 the server only answered: `initialize`, `tools/list`, `tools/call`. To ask a person
 * before a skill is installed it has to send the client a request — MCP elicitation — and wait for
 * the answer while a tool call is still open. Only the stdio transport can: it is a pipe from the
 * one client that launched it. Over HTTP there is no channel back, so elicitation is unavailable
 * there and a skill goes to the pending folder instead.
 */
import type { GateAnswer } from './desktop/skill-gate.js';

type Requester = (method: string, params: unknown) => Promise<unknown>;

let declaredElicitation = false;
let requester: Requester | null = null;

/** From `initialize`: whether the client said it can show a form to its user. */
export function recordClientCapabilities(params: unknown): void {
  const capabilities = (params as { capabilities?: { elicitation?: unknown } } | null)
    ?.capabilities; // narrowed below
  declaredElicitation =
    typeof capabilities?.elicitation === 'object' && capabilities.elicitation !== null;
}

/** Set by the stdio transport, which is the only one that can send a request back. */
export function setRequester(next: Requester | null): void {
  requester = next;
}

/**
 * Show the page to the person and return their answer. `accepted` only for an explicit accept with
 * `install: true`; a decline, a cancel or a closed dialog is `declined`; no channel, or a client
 * that errors, is `unavailable`, which parks the skill rather than installing it.
 */
export async function askPerson(page: string): Promise<GateAnswer> {
  if (!declaredElicitation || requester === null) return 'unavailable';
  let answer: unknown;
  try {
    answer = await requester('elicitation/create', {
      message: page,
      requestedSchema: {
        type: 'object',
        properties: { install: { type: 'boolean', title: 'Install this skill' } },
        required: ['install'],
      },
    });
  } catch {
    return 'unavailable';
  }
  const result = answer as { action?: unknown; content?: { install?: unknown } } | null; // narrowed field by field
  return result?.action === 'accept' && result.content?.install === true ? 'accepted' : 'declined';
}
