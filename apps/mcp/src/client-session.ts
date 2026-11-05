/**
 * What the client that launched this server can do, and the one request this server sends it.
 *
 * Until task 61 the server only answered: `initialize`, `tools/list`, `tools/call`. To ask a person
 * before a skill is installed it has to send the client a request — MCP elicitation — and wait for
 * the answer while a tool call is still open. Only the stdio transport can: it is a pipe from the
 * one client that launched it. Over HTTP there is no channel back, so elicitation is unavailable
 * there and nothing is installed.
 */
import type { SkillPrompt } from '@arp-protocol/core';

import type { GateAnswer } from './desktop/skill-gate.js';

type Requester = (method: string, params: unknown) => Promise<unknown>;

/** Fifteen minutes: time to read a skill's files at the link before answering. */
const ASK_TIMEOUT_MS = 15 * 60 * 1000;

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
 * Show the install question to the person and return their answer. `accepted` only for an explicit
 * accept with the box ticked; a decline, a cancel or an unticked box is `declined`; no channel, a
 * client that errors, or no answer within `timeoutMs` is `unavailable`. Both install nothing.
 */
export async function askPerson(
  prompt: SkillPrompt,
  timeoutMs = ASK_TIMEOUT_MS,
): Promise<GateAnswer> {
  if (!declaredElicitation || requester === null) return 'unavailable';
  let answer: unknown;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    // Bounded, so a client that never answers does not hold the tool call forever. Long, because
    // the person may be reading the files at the link. An answer after this installs nothing.
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('no answer')), timeoutMs);
    });
    answer = await Promise.race([
      timeout,
      requester('elicitation/create', {
        message: prompt.message,
        requestedSchema: {
          type: 'object',
          properties: {
            install: { type: 'boolean', title: prompt.confirm, description: prompt.confirmHelp },
          },
          required: ['install'],
        },
      }),
    ]);
  } catch {
    return 'unavailable';
  } finally {
    clearTimeout(timer);
  }
  const result = answer as { action?: unknown; content?: { install?: unknown } } | null; // narrowed field by field
  return result?.action === 'accept' && result.content?.install === true ? 'accepted' : 'declined';
}

type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void };

/**
 * The stdio transport's routing. Requests are handled one at a time, in order, as before task 61;
 * what changed is that reading goes on while one is open, so a tool call that waits on the person
 * receives the client's answer, which arrives on the same input. Installs itself as the requester
 * `askPerson` uses, and removes itself on `close`.
 *
 * Two messages do not wait in that line, because what they are about is the call holding it: `ping`
 * while a tool call is open, or a client watching the server thinks it dead, and the cancellation of
 * that call, which `onCancel` receives.
 */
export function stdioRouter(
  handle: (line: string) => Promise<void>,
  send: (line: string) => Promise<void>,
  onCancel: () => void = () => undefined,
) {
  const waiting = new Map<string, Pending>();
  let sent = 0;
  let openCall: { id: unknown } | null = null;
  let queue = Promise.resolve();
  setRequester(
    (method, params) =>
      new Promise((resolve, reject) => {
        const id = `arp-${++sent}`;
        waiting.set(id, { resolve, reject });
        void send(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
      }),
  );
  return {
    receive(line: string): void {
      const reply = replyTo(line, waiting);
      if (reply === null) {
        const message = requestIn(line);
        if (openCall !== null && message?.method === 'ping' && message.id !== undefined) {
          void send(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: {} }));
          return;
        }
        if (message?.method === 'notifications/cancelled') {
          if (openCall !== null && message.params?.requestId === openCall.id) onCancel();
          return;
        }
        queue = queue.then(async () => {
          openCall = message?.method === 'tools/call' ? { id: message.id } : null;
          await handle(line);
          openCall = null;
        });
        return;
      }
      waiting.delete(reply.id);
      if (reply.error === undefined) reply.pending.resolve(reply.result);
      else reply.pending.reject(new Error(reply.error));
    },
    async close(): Promise<void> {
      for (const pending of waiting.values())
        pending.reject(new Error('the client closed the connection'));
      waiting.clear();
      await queue;
      setRequester(null);
    },
  };
}

function requestIn(
  line: string,
): { method?: unknown; id?: unknown; params?: { requestId?: unknown } } | null {
  try {
    const parsed: unknown = JSON.parse(line);
    // `as`: an object, checked here; each field is compared, never trusted.
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as { method?: unknown; id?: unknown; params?: { requestId?: unknown } })
      : null;
  } catch {
    return null;
  }
}

/** A line that answers a request this server sent, or null for anything else. */
function replyTo(
  line: string,
  waiting: ReadonlyMap<string, Pending>,
): { id: string; result: unknown; error: string | undefined; pending: Pending } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || 'method' in parsed) return null;
  const message = parsed as { id?: unknown; result?: unknown; error?: unknown }; // an object with no method
  if (typeof message.id !== 'string') return null;
  const pending = waiting.get(message.id);
  if (pending === undefined) return null;
  return {
    id: message.id,
    result: message.result,
    error: message.error === undefined ? undefined : JSON.stringify(message.error),
    pending,
  };
}
