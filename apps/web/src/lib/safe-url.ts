/**
 * The value, if it is an absolute `http:` or `https:` URL; otherwise `null`.
 *
 * Every link this app renders from atom or agent metadata goes through here first. That metadata is
 * written by whoever paid for the atom, so a `javascript:` or `data:` URL in it would otherwise
 * become a live `href` on our page.
 */
export function safeHttpUrl(raw: string | null | undefined): string | null {
    if (raw === null || raw === undefined) return null;
    const trimmed = raw.trim();
    let parsed: URL;
    try {
        parsed = new URL(trimmed);
    } catch {
        return null;
    }
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? trimmed : null;
}
