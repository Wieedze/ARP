import {createContext, useContext} from "react";

/**
 * Opens the one onboarding panel from anywhere: the nav's Connect button, the landing's Get
 * started, and later any action that needs a connected agent (ADR `0114`). One panel, one way in.
 */
export type Onboarding = {open: () => void};

export const OnboardingContext = createContext<Onboarding>({open: () => undefined});

export function useOnboarding(): Onboarding {
    return useContext(OnboardingContext);
}
