import {useQuery} from "@tanstack/react-query";

import {parseToolLabel} from "../lib/tool-label";
import {parseSkillMd, rawSkillUrl, type SkillMd} from "../services/skill-md";

/**
 * One skill's SKILL.md, read from its repository when its page opens.
 *
 * The path comes from `skill-paths.json` (`scripts/build-skill-paths.ts`), because it is not a
 * function of the repository and the name: 19 layouts across 31 repositories. A skill with no
 * entry is one whose file is not in its repository, or whose several files differ, and the page
 * says it has none rather than reading somebody else's file.
 *
 * `raw.githubusercontent.com` answers CORS with no per-visitor quota, so this is one request per
 * page and nothing ships a token.
 */
export type SkillMdRead =
    | {status: "none"}
    | {status: "pending"}
    | {status: "failed"; url: string}
    | {status: "ok"; url: string; path: string; md: SkillMd};

export function useSkillMd(label: string | null): SkillMdRead {
    const parsed = label === null ? null : parseToolLabel(label);
    const repo = parsed?.kind === "skill" ? `${parsed.owner}/${parsed.repo}` : null;

    const paths = useQuery({
        queryKey: ["skill-paths"],
        queryFn: async () =>
            ((await import("../data/skill-paths.json")).default as {paths?: Record<string, string>})
                .paths ?? {},
        staleTime: Infinity,
        gcTime: Infinity,
    });
    const path = label === null ? undefined : paths.data?.[label];
    const url = repo === null || path === undefined ? null : rawSkillUrl(repo, path);

    const file = useQuery({
        queryKey: ["skill-md", url],
        enabled: url !== null,
        queryFn: async () => {
            // `url` is non-null whenever the query is enabled; the guard is for the type.
            if (url === null) throw new Error("no SKILL.md path");
            const response = await fetch(url);
            if (!response.ok) throw new Error(`${response.status} from ${url}`);
            return parseSkillMd(await response.text());
        },
        staleTime: 60 * 60 * 1000,
        retry: 1,
    });

    if (repo === null) return {status: "none"};
    if (paths.data === undefined) return {status: "pending"};
    if (url === null || path === undefined) return {status: "none"};
    if (file.data !== undefined) return {status: "ok", url, path, md: file.data};
    if (file.isError) return {status: "failed", url};
    return {status: "pending"};
}
