import {controlClass} from "../../lib/control-class";
import {useOnboarding} from "./onboarding-context";

/**
 * Where an action needs a connection and there is none, a button that opens the onboarding, not a
 * sentence (ADR `0114`: the action is gated, not the read). One component, so every gate opens the
 * same panel.
 */
export function ConnectPrompt({label, className = ""}: {label: string; className?: string}) {
    const onboarding = useOnboarding();
    return (
        <div className={className}>
            <button type="button" onClick={onboarding.open} className={controlClass}>
                {label}
            </button>
        </div>
    );
}
