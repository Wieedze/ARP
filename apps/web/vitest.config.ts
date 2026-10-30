import react from "@vitejs/plugin-react";
import {defineConfig} from "vitest/config";

/**
 * Two projects, because this app has two kinds of test and only one of them needs a DOM.
 *
 * `*.test.ts` runs in `node`: services and query options are pure functions, and a DOM would only
 * slow them down. `*.test.tsx` runs in `happy-dom`, because `docs/tasks/26` is the bill for having no
 * way to render a component — eight defects on one page across three review rounds, three of them
 * live on mainnet data, each a single render assertion away from being caught.
 *
 * **Projects, not `environmentMatchGlobs`.** That option is gone in Vitest 4; a config carrying it
 * fails silently, every `.tsx` test runs in `node`, and the only symptom is `document is not
 * defined` at the first render — which reads as a missing dependency rather than a dead config
 * key.
 *
 * `happy-dom` rather than `jsdom`, which `docs/tasks/26` names: same contract, faster. Both are
 * dev-only and ship nothing, which is the justification `rules/ui.md`'s bundle rule asks for.
 *
 * ADR `0011` said "services only, no hooks/components". Hooks have been tested since the query
 * options pattern arrived and nobody recorded that the scope moved; ADR `0063` records both moves
 * rather than letting the old one keep misdescribing the repo.
 */
export default defineConfig({
    plugins: [react()],
    test: {
        globals: false,
        projects: [
            {
                plugins: [react()],
                test: {
                    name: "node",
                    environment: "node",
                    include: ["src/**/*.test.ts"],
                },
            },
            {
                plugins: [react()],
                test: {
                    name: "dom",
                    environment: "happy-dom",
                    include: ["src/**/*.test.tsx"],
                    setupFiles: ["./src/test/setup.ts"],
                },
            },
        ],
    },
});
