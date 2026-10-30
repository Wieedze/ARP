import "@testing-library/jest-dom/vitest";
import {cleanup} from "@testing-library/react";
import {afterEach} from "vitest";

/**
 * Unmount between tests.
 *
 * Without it every render stacks in the same document and a `getByText` that should find one node
 * finds three — which fails as "multiple elements" rather than as the thing that is actually wrong,
 * and sends the next reader looking in the wrong place.
 */
afterEach(() => {
    cleanup();
});
