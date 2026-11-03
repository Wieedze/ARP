/**
 * Read the Intuition partner pinning credential from the environment.
 *
 * This is the **only** place in `scripts/` that reads `INTUITION_PIN_API_KEY`
 * outside of `scripts/verify/verify-pin-key.ts` (ADR 0016). It builds the plain
 * `PinAuth` of `scripts/helpers/intuition-pin.ts`; scripts import nothing from
 * `apps/web/src`, whose own branded `PinAuth` stays browser-side.
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

import { DEFAULT_HEADER_NAME, type PinAuth } from './intuition-pin.js';

/**
 * Return the partner pinning credential, or throw with the remediation.
 *
 * `headerName` is always resolved here so the value can be logged and compared
 * without re-deriving the default.
 */
export function requirePinAuth(): PinAuth {
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
