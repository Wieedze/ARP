import type { ToolCall } from './payload.ts';

/**
 * Succeeded or failed, and how: the only thing the hook keeps from a call's outcome.
 *
 * | outcome | rule |
 * | --- | --- |
 * | `ok` | the call succeeded and nothing in the response flags an error |
 * | `tool_error` | the tool failed: `PostToolUseFailure`, MCP `isError`, HTTP 5xx, or a failure nothing below explains |
 * | `auth` | 401 or 403, or an authentication message — usually the operator's configuration |
 * | `timeout` | no answer in time |
 * | `unreachable` | DNS, TLS, connection refused or reset |
 * | `payment` | x402: a 402 or a refused payment |
 *
 * A call the user cancelled or interrupted returns `null` and is not recorded: nothing was used.
 *
 * The failure's text is read to pick a category and **never returned**. The result carries an
 * outcome and at most a status code. Taken from the `arp-cli-v0` patch
 * (`docs/design/cli-v0/files-packages-cli/src/classify.ts`), adapted to {@link ToolCall}.
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
function failureText(call: ToolCall): string {
  const parts: string[] = [];
  const push = (value: unknown) => {
    if (typeof value === 'string') parts.push(value);
    else if (isRecord(value)) {
      for (const key of ['error', 'message', 'reason']) {
        const text = value[key];
        if (typeof text === 'string') parts.push(text);
      }
      if (Array.isArray(value.content)) {
        for (const item of value.content) {
          if (isRecord(item) && typeof item.text === 'string') parts.push(item.text);
        }
      }
    }
  };
  push(call.error);
  push(call.response);
  return parts.join('\n').slice(0, 4000);
}

function statusOf(call: ToolCall): number | null {
  if (!isRecord(call.response)) return null;
  for (const key of ['status', 'statusCode', 'status_code']) {
    const value = call.response[key];
    if (typeof value === 'number' && Number.isInteger(value)) return value;
  }
  return null;
}

function flaggedError(response: unknown): boolean {
  return isRecord(response) && (response.isError === true || response.is_error === true);
}

export function classifyCall(call: ToolCall): Classified | null {
  if (call.interrupted) return null;

  const failed =
    call.event === 'PostToolUseFailure' || call.error !== null || flaggedError(call.response);
  const status = statusOf(call);
  if (!failed && (status === null || status < 400)) return { outcome: 'ok', code: null };

  const text = failureText(call);
  if (CANCELLED.test(text)) return null;
  const found = STATUS.exec(text);
  const match = status ?? (found === null ? null : Number(found[0]));
  const code = match === null ? null : String(match);
  if (match === 402 || PAYMENT.test(text)) return { outcome: 'payment', code };
  if (match === 401 || match === 403 || AUTH.test(text)) return { outcome: 'auth', code };
  if (TIMEOUT.test(text)) return { outcome: 'timeout', code };
  if (UNREACHABLE.test(text)) return { outcome: 'unreachable', code };
  return { outcome: 'tool_error', code };
}
