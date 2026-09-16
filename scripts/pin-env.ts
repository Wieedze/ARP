/**
 * Read the Intuition partner pinning credential from the environment.
 *
 * This is the **only** place in the repo that reads `INTUITION_PIN_API_KEY`
 * outside of `scripts/verify-pin-key.ts`. `app/src/services/` never touches
 * `process.env`: pinning takes its credential as an explicit parameter, so a
 * browser caller is a compile-time error rather than a leaked partner key
 * (ADR 0016). Node entry points close that gap by calling this helper and
 * threading the result down.
 *
 * Fails loudly on a missing key — no silent fallback, matching the
 * deployer-script rule in `.claude/rules/security.md`. A pin against an
 * unauthenticated endpoint would otherwise surface as an opaque 401 several
 * frames deeper.
 *
 * Env (in `.env` at the repo root; Bun auto-loads it):
 *   INTUITION_PIN_API_KEY          required — the partner pinning key
 *   INTUITION_PIN_API_KEY_HEADER   optional — defaults to "apikey"
 */

import type { PinAuth } from '../app/src/services/intuition-pin';

const DEFAULT_HEADER_NAME = 'apikey';

/**
 * Return the partner pinning credential, or throw with the remediation.
 *
 * The return type fixes `headerName`, so callers never have to re-apply the
 * default.
 */
export function requirePinAuth(): Required<PinAuth> {
  const apiKey = process.env.INTUITION_PIN_API_KEY;
  if (!apiKey) {
    throw new Error(
      'INTUITION_PIN_API_KEY is not set — every Intuition write path needs it.\n' +
        'Add it to .env at the repo root, NEVER with a VITE_ prefix (Vite inlines\n' +
        'VITE_* vars into the client bundle, publishing the partner key to every\n' +
        'visitor). Then confirm it with: bun run verify:pin',
    );
  }
  return {
    apiKey,
    headerName: process.env.INTUITION_PIN_API_KEY_HEADER ?? DEFAULT_HEADER_NAME,
  };
}
