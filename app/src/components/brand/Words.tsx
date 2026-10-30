import {Fragment, useEffect, useLayoutEffect, useRef} from "react";

import {retimeWords} from "./words-timing";

/**
 * A display heading that arrives one word at a time.
 *
 * ## One readable sentence, and a pile of hidden spans
 *
 * `docs/18` §4 names the trap and it is not hypothetical: a headline split into one `<span>` per
 * word can be announced word by word, with a pause at each, and both find-in-page and text
 * selection degrade. So the heading holds **two** children — the full sentence, visually hidden and
 * the only thing in the accessibility tree, and the animated words, `aria-hidden`.
 *
 * The cost is that the sentence exists twice in the DOM. That is the trade `docs/18` §4 asks for
 * explicitly, and the alternative — animating the real text — is the version that breaks.
 *
 * ## The delay comes from the rendered line, not the word index
 *
 * `--text-display` is a `clamp()`, so the headline wraps at a different word at every width. An
 * index-based delay staggers *across* a line break: word 7 is the last word of line 1 at 1440px and
 * the first word of line 2 at 1024px, and at the second width the second line starts mid-stagger,
 * which reads as a glitch at some widths and not others.
 *
 * So the delay is measured. After layout, each word's `offsetTop` says which rendered line it is
 * on, and the delay is `line * --line-step + position * --word-step`. Re-measured on resize,
 * without re-splitting — the spans are stable, only their `--word-delay` changes.
 *
 * ## Capped, because a stagger is a wait
 *
 * Past about 600ms of total stagger the reader is waiting rather than reading, so the whole set is
 * scaled down to fit `--stagger-ceiling` when it would exceed it. A twelve-word headline on one
 * line compresses its own step rather than taking 400ms longer than a six-word one.
 *
 * ## It never gates the text
 *
 * The hidden state lives in a descendant selector under `[data-on="false"]`, so if JavaScript never
 * runs the words are simply visible, and the measurement failing leaves every delay at its token
 * default of `0ms` — all the words arrive together, which is a worse animation and a correct page.
 */
export function Words({text, className = ""}: {text: string; className?: string}) {
    const ref = useRef<HTMLSpanElement | null>(null);

    /**
     * Measure after layout and before paint, so the first frame already carries the right delays.
     * In a `useEffect` the browser can paint once with every delay at zero, which shows the whole
     * headline arriving at once and then nothing.
     */
    useLayoutEffect(() => {
        retimeWords(ref.current);
    }, [text]);

    useEffect(() => {
        const node = ref.current;
        if (node === null) return;
        // Width-driven, so `resize` is the event. No rAF throttle: a reflow of one heading is
        // cheap, and `offsetTop` forces a synchronous layout either way.
        function onResize() {
            retimeWords(node);
        }
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, []);

    const words = text.split(" ");

    return (
        <span className={`arp-words ${className}`}>
            <span className="sr-only">{text}</span>
            <span aria-hidden="true" ref={ref}>
                {/* The space goes **between** the spans, not inside them. `.arp-word` is an
                    inline-block, and a trailing space inside one is dropped at the end of its own
                    box, so the headline rendered as "Thereputation pulsefor…". */}
                {words.map((word, index) => (
                    <Fragment key={`${index}-${word}`}>
                        <span className="arp-word">{word}</span>
                        {index < words.length - 1 ? " " : null}
                    </Fragment>
                ))}
            </span>
        </span>
    );
}
