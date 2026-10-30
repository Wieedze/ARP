/**
 * One tool call as the hook needs it, whichever runtime sent it.
 *
 * Chosen by the payload's **shape**, never by the file the hook was installed from: Grok Build runs
 * the hooks in `~/.claude/settings.json` too, and its envelope "uses camelCase keys throughout where
 * Claude uses snake_case" (xai-org/grok-build, `docs/user-guide/10-hooks.md`). So one hook entry
 * receives both.
 *
 * | format | keys | sent by |
 * | --- | --- | --- |
 * | `claude` | `tool_name`, `tool_use_id`, `tool_response`, `duration_ms` | Claude Code, and any runtime that copied its format |
 * | `grok` | `toolName`, `toolUseId`, `toolResult` | Grok Build |
 *
 * The format is recorded, not the runtime: a snake_case payload says how it was written, not who
 * wrote it. Codex and Gemini CLI are not adapted until a real payload of theirs is captured as a
 * fixture (`docs/tasks/33-one-installer.md`, 33a).
 */
export type PayloadFormat = 'claude' | 'grok';

export type ToolCall = {
  format: PayloadFormat;
  /** `PostToolUse`, `PostToolUseFailure`, or `null` when the payload does not say. */
  event: string | null;
  session: string | null;
  /** The runtime's id for this one call. Two hooks firing on one call share it. */
  id: string | null;
  tool: string;
  input: Record<string, unknown> | undefined;
  /** `true` when the payload carried a response field at all, which is not the same as an empty one. */
  hasResponse: boolean;
  response: unknown;
  /** The failure's text. Read to classify, never written down. */
  error: string | null;
  /** The call was aborted rather than failing on its own. */
  interrupted: boolean;
  ms: number | null;
  cwd: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function ms(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : null;
}

/** The first of `keys` the payload holds, so a renamed field is one more key and not a new branch. */
function first(raw: Record<string, unknown>, keys: readonly string[]): unknown {
  for (const key of keys) if (key in raw) return raw[key];
  return undefined;
}

export function toolCallOf(raw: unknown): ToolCall | null {
  if (!isRecord(raw)) return null;
  const format: PayloadFormat =
    typeof raw.toolName === 'string' && typeof raw.tool_name !== 'string' ? 'grok' : 'claude';
  const camel = format === 'grok';

  const tool = str(camel ? raw.toolName : raw.tool_name);
  if (tool === null) return null;

  const input = camel ? raw.toolInput : raw.tool_input;
  // Grok documents `toolResult` and, per the summary read, `tool_response` as an alias.
  const responseKeys = camel ? ['toolResult', 'tool_response'] : ['tool_response'];
  const hasResponse = responseKeys.some((key) => key in raw && raw[key] !== undefined);
  return {
    format,
    event: str(camel ? first(raw, ['hookEventName', 'hook_event_name']) : raw.hook_event_name),
    session: str(camel ? raw.sessionId : raw.session_id),
    id: str(camel ? raw.toolUseId : raw.tool_use_id),
    tool,
    input: isRecord(input) ? input : undefined,
    hasResponse,
    response: hasResponse ? first(raw, responseKeys) : undefined,
    error: str(raw.error),
    interrupted: (camel ? first(raw, ['isInterrupt', 'is_interrupt']) : raw.is_interrupt) === true,
    ms: ms(camel ? first(raw, ['durationMs', 'duration_ms']) : raw.duration_ms),
    cwd: str(raw.cwd),
  };
}
