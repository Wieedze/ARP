/**
 * `NavSplit`'s height in px, and the one place it is written.
 *
 * The nav is `sticky top-0 z-20` with an opaque background, and the landing's scene deck is built
 * around it: the stage reserves this band, the field centres below it, and the Saffron cover
 * measures its reach from it. It was `88` in four places; lowering the nav in one of them would
 * have left the other three describing a nav that no longer exists. 64 since 2026-10-29: the user
 * found 88 too tall.
 */
export const NAV_HEIGHT = 64;
