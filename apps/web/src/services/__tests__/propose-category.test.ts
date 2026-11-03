import {describe, expect, it, vi} from "vitest";

import {proposeCategory, proposeCategoryMessage} from "../propose-category";

const SKILL = `0x${"c".repeat(64)}`;

function answering(status: number, body: unknown): typeof fetch {
    return vi.fn(async () => new Response(JSON.stringify(body), {status}));
}

describe("proposing a category through the sponsor", () => {
    it("tags with an existing category by sending only the label and the subject", async () => {
        const fetch = answering(200, {label: "design", newCategory: false, created: true});
        const result = await proposeCategory(
            {label: "design", subjectId: SKILL},
            {endpoint: "http://sponsor", fetch},
        );

        expect(fetch).toHaveBeenCalledWith("http://sponsor/propose-category", {
            method: "POST",
            headers: {"content-type": "application/json"},
            body: JSON.stringify({label: "design", subjectId: SKILL}),
        });
        expect(proposeCategoryMessage(result)).toBe("Filed under “design”.");
    });

    it("files a new category, and says when nothing needed writing", async () => {
        const filed = await proposeCategory(
            {
                label: "slides",
                parent: "design",
                reason: "no presentation category",
                subjectId: SKILL,
            },
            {
                endpoint: "http://sponsor",
                fetch: answering(200, {label: "slides", newCategory: true, created: true}),
            },
        );
        expect(proposeCategoryMessage(filed)).toBe("Filed under the new category “slides”.");

        const already = await proposeCategory(
            {label: "design", subjectId: SKILL},
            {
                endpoint: "http://sponsor",
                fetch: answering(200, {label: "design", newCategory: false, created: false}),
            },
        );
        expect(proposeCategoryMessage(already)).toBe("Already in “design”.");
    });

    it("names the rule that refused it", async () => {
        const cases = [
            [422, {rule: "charset"}, "One word, letters and digits only."],
            [422, {rule: "reason"}, "Say why no category fits."],
            [422, {rule: "exists"}, "That name is already in the tree. Pick it from the list."],
            [422, {rule: "root"}, "Pick a category under tool, not tool itself."],
            [429, {rule: "limit"}, "Today's limit is reached. Try again tomorrow."],
            [503, {retry: true}, "Not answered right now. Try again."],
        ] as const;
        for (const [status, body, message] of cases) {
            const result = await proposeCategory(
                {label: "x", subjectId: SKILL},
                {endpoint: "http://sponsor", fetch: answering(status, body)},
            );
            expect(proposeCategoryMessage(result)).toBe(message);
        }
    });

    it("sends nothing without a sponsor", async () => {
        const fetch = vi.fn();
        expect(
            await proposeCategory({label: "x", subjectId: SKILL}, {endpoint: undefined, fetch}),
        ).toEqual({
            status: "unavailable",
        });
        expect(fetch).not.toHaveBeenCalled();
    });
});
