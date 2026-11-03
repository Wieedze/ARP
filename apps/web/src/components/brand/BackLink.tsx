import {Link} from "react-router-dom";

/**
 * The way out of a detail page, back to the index it belongs to. One shape on every detail page
 * (task 48): the agent page had it and the skill, repo and atom pages did not.
 */
export function BackLink({to, label}: {to: string; label: string}) {
    return (
        <Link
            to={to}
            // Banged: the unlayered `a { color }` in `index.css` beats an unbanged colour utility.
            className="inline-block font-mono text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]! hover:text-[color:var(--color-fg)]!"
        >
            {`← ${label}`}
        </Link>
    );
}
