import {createContext, useContext} from "react";

/**
 * What a {@link import("./SceneDeck").SceneDeck} tells the subtree inside one scene.
 *
 * `Reveal` reads it and changes what it listens to. In a pinned deck every scene is mounted and
 * inside the viewport the whole time, just at `opacity: 0`, so an `IntersectionObserver` fires for
 * all of them at once and every stagger plays off-screen before anybody scrolls. Pinned, the
 * trigger is **the scene becoming active** instead; stacked, it stays the observer.
 *
 * It lives in its own module because a file exporting both a component and a context breaks React
 * Fast Refresh, which eslint enforces here.
 */
export type SceneState = {
    /** Whether a deck above this point is pinning scenes rather than stacking them. */
    pinned: boolean;
    /** Whether this particular scene is the one on screen. Always true when stacked. */
    isActive: boolean;
};

export const SceneContext = createContext<SceneState>({pinned: false, isActive: true});

export function useScene(): SceneState {
    return useContext(SceneContext);
}
