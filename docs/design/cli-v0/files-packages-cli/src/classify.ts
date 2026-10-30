/**
 * Succeeded or failed, and how: the only thing the hook keeps from a tool's answer.
 *
 * | outcome | rule |
 * | --- | --- |
 * | `ok` | an answer, with no protocol error and no error flag |
 * | `tool_error` | the tool answered with an error: MCP `isError`, HTTP 5xx, or a failure nothing below explains |
 * | `auth` | 401 or 403, or an authentication message: counted apart, usually configuration |
 * | `timeout` | no answer in time |
 * | `unreachable` | DNS, TLS, connection refused or reset |
 * | `payment` | x402: a 402 or a refused payment |
 *
 * A call the user cancelled or refused is **not counted** (`null`).
 *
 * The text of an answer is read only when the call already failed, to put it in a category, and is
 * never returned: the result carries an outcome and at most a status code.
 *
 * **The input shape is not fully documented.** Claude Code documents `PostToolUseFailure` as a
 * distinct event but, at the time of writing, not the exact fields of its payload or of
 * `tool_response`. So this reads defensively: any of `error`, `tool_response` (string or object),
 * `isError`, `is_error`, `status`, `statusCode`. `test/classify.test.ts` pins the shapes seen so
 * far; a new shape falls through to `tool_error` on a failure and `ok` otherwise, never to a throw.
 */
export type Outcome = 'ok' | 'tool_error' | 'auth' | 'timeout' | 'unreachable' | 'payment';

export type Classified = { outcome: Outcome; code: string | null };

const CANCELLED =
  /\b(interrupted|cancel(l)?ed|aborted) by (the )?user\b|\buser (rejected|denied|declined)\b|\bpermission denied by user\b/i;
const AUTH =
  /\b(unauthori[sz]ed|forbidden|invalid (api )?(key|token)|authentication|not authenticated|expired token)\b/i;
const TIMEOUT = /\b(timed? ?out|timeout|deadline exceeded|ETIMEDOUT)\b/i;
const UNREACHABLE =
  /\b(ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|EHOSTUNREACH|ENETUNREACH|getaddrinfo|certificate|TLS|SSL|socket hang up|connection refused|fetch failed)\b/i;
const PAYMENT =
  /\b(payment required|insufficient (funds|balance)|payment (failed|refused|rejected)|x402)\b/i;
const STATUS = /\b(40[123]|429|5\d\d)\b/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Every string a failure might carry, from the places a payload has been seen to put one. */
function failureText(input: Record<string, unknown>): string {
  const parts: string[] = [];
  const push = (value: unknown) => {
    if (typeof value === 'string') parts.push(value);
    else if (isRecord(value)) {
      for (const key of ['error', 'message', 'reason']) {
        if (typeof value[key] === 'string') parts.push(value[key]);
      }
      const content = value.content;
      if (Array.isArray(content)) {
        for (const item of content) {
          if (isRecord(item) && typeof item.text === 'string') parts.push(item.text);
        }
      }
    }
  };
  push(input.error);
  push(input.tool_response);
  return parts.join('\n').slice(0, 4000);
}

function statusOf(input: Record<string, unknown>): number | null {
  for (const holder of [input, input.tool_response, input.error]) {
    if (!isRecord(holder)) continue;
    for (const key of ['status', 'statusCode', 'status_code']) {
      const value = holder[key];
      if (typeof value === 'number' && Number.isInteger(value)) return value;
    }
  }
  return null;
}

function flaggedError(response: unknown): boolean {
  if (!isRecord(response)) return false;
  return response.isError === true || response.is_error === true;
}

function categorise(text: string, status: number | null): Classified {
  const found = STATUS.exec(text);
  const match = status ?? (found === null ? null : Number(found[0]));
  const code = match === null ? null : String(match);
  if (match === 402 || PAYMENT.test(text)) return { outcome: 'payment', code };
  if (match === 401 || match === 403 || AUTH.test(text)) return { outcome: 'auth', code };
  if (TIMEOUT.test(text)) return { outcome: 'timeout', code };
  if (UNREACHABLE.test(text)) return { outcome: 'unreachable', code };
  return { outcome: 'tool_error', code };
}

/**
 * @param event the hook event: `PostToolUse` or `PostToolUseFailure`.
 * @param input the event's stdin payload, as parsed JSON.
 */
export function classifyCall(event: string, input: Record<string, unknown>): Classified | null {
  if (input.is_interrupt === true) return null;

  const failed = event === 'PostToolUseFailure' || flaggedError(input.tool_response);
  const status = statusOf(input);
  if (!failed && (status === null || status < 400)) return { outcome: 'ok', code: null };

  const text = failureText(input);
  if (CANCELLED.test(text)) return null;
  return categorise(text, status);
}
