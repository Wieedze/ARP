import {createContext, useContext} from "react";

/**
 * What a {@link import("./SceneDeck").SceneDeck} tells the subtree inside one scene.
 *
 * Two things read it. `Reveal` and `Words` need to know whether they are in a pinned deck, because
 * pinned they arrive on a longer timing while a Saffron cover opens over them; and the manifesto
 * needs `progress` to light one line at a time as the scroll crosses its band.
 *
 * It lives in its own module because a file exporting both a component and a context breaks React
 * Fast Refresh, which eslint enforces here.
 */
export type SceneState = {
    /** Whether a deck above this point is pinning scenes rather than stacking them. */
    pinned: boolean;
    /** Whether this particular scene is the one on screen. Always true when stacked. */
    isActive: boolean;
    /**
     * Scene-space scroll position: 0 is the first scene centred, 1 the second, and so on.
     *
     * Continuous, so a hand-over is a fraction and not a step. Stacked it stays at this scene's own
     * index, which is what makes a scrubbed effect read as finished rather than as never started.
     */
    progress: number;
    /** This scene's index in the deck. */
    index: number;
};

export const SceneContext = createContext<SceneState>({
    pinned: false,
    isActive: true,
    progress: 0,
    index: 0,
});

export function useScene(): SceneState {
    return useContext(SceneContext);
}
