# ARP — motion reference

`index.html` is a **standalone, exact reproduction** of ARP's landing page as it stands on
2026-10-27. Open it in a browser; no build, no install, nothing to run but the file. Every number in
it is lifted from the running app, not approximated.

It exists so a design agent can rework the page without reading the React app, and so that whatever
comes back can be compared against what it replaces.

## Read the file's own comments first

The header comment splits everything into two lists:

- **Mechanism** — seven things that are load-bearing. Each one was arrived at by a failure, and each
  failure is named. Change them if you have a better answer, but say which one you changed.
- **Decoration** — the per-scene composition, what moves and in which direction, the stagger order,
  type scale within a scene, the field, the rail. **This is where the creativity goes**, and the
  current version has close to none: it is a correct skeleton, not a design.

## The numbers, in one place

| what                     | value                                   | where it came from                                        |
| ------------------------ | --------------------------------------- | --------------------------------------------------------- |
| scene cross-fade         | **240ms**, `cubic-bezier(0.16, 1, 0.3, 1)` | 520ms first, and "il faut rendre ça plus fluide"        |
| element reveal           | **260ms**, same curve                   | practitioner range for a scroll reveal is 150–250ms       |
| stagger between siblings | **80ms**                                | far enough to read as a sequence, short enough not to wait |
| scene slide              | **18px**                                | larger reads as a carousel rather than a hand-over         |
| hold before hand-over    | **0.55** of a scene's band              | the rest is overlap, so neighbours cross-fade              |
| stacks below             | **680px tall / 900px wide**             | a pinned scene cannot scroll, so it must fit               |

## What it does not include

Two of the three motion scales in [`../docs/18_THE_MOTION_SPEC.md`](../docs/18_THE_MOTION_SPEC.md)
are **not built**, and that spec is where their constraints are written:

- **word-level arrival** — §4, including why splitting a headline into one `<span>` per word breaks
  the accessible name;
- **route transitions** — §5, which must be the _least_ visible of the three.

The other four pages of the app (`/agents`, `/tools`, `/atom/:id`, `/agent`) have **no motion at
all** today, not even the block-level reveal. That inconsistency is visible the moment you leave the
landing page.

## The one thing motion must not break

Every figure on the real page is somebody's actual deposit, read live from a chain, and **the page
shows nothing it has not read** — where there is no data it says so. Never animate a placeholder
into a figure: the swap underneath is a lie the motion told.
