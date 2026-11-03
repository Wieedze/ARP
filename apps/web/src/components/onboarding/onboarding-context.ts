import {createContext, useContext} from "react";

/**
 * Opens the one onboarding panel from anywhere: Get started in the nav and on the landing (ADR
 * `0114`, task 62). One panel, one way in. An action that needs a wallet asks for the wallet
 * itself, not for this panel (`ConnectPrompt`, ADR `0128`).
 */
export type Onboarding = {
    open: () => void;
    /** Called by a path's page once it is mounted: the panel closes then, not on the click. */
    landed: () => void;
};

export const OnboardingContext = createContext<Onboarding>({
    open: () => undefined,
    landed: () => undefined,
});

export function useOnboarding(): Onboarding {
    return useContext(OnboardingContext);
}
