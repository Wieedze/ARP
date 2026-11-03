import {describe, expect, it} from "vitest";

import {safeHttpUrl} from "../safe-url";

describe("safeHttpUrl", () => {
    it("keeps an absolute http or https URL as written", () => {
        expect(safeHttpUrl("https://example.org/a?b=1")).toBe("https://example.org/a?b=1");
        expect(safeHttpUrl("  http://example.org ")).toBe("http://example.org");
    });

    it("refuses every other scheme, a relative path and nothing", () => {
        for (const raw of [
            "javascript:alert(1)",
            " JavaScript:alert(1)",
            "data:text/html,<script>alert(1)</script>",
            "vbscript:x",
            "ipfs://bafy",
            "/relative",
            "example.org",
            "",
            null,
            undefined,
        ]) {
            expect(safeHttpUrl(raw)).toBeNull();
        }
    });
});
