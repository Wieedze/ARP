# ARP — motion reference

`index.html` is the **design base** for the landing page: a standalone page, no build, nothing to
run but the file. Open it in a browser. It is the visual and timing truth, and
[`MOTION-V2.md`](MOTION-V2.md) is the build contract derived from it.

**Where the two disagree, `MOTION-V2.md` wins** — it was written after the page and corrects parts
of the page's own header comment.

It replaced the 2026-10-27 reproduction of the then-current React page on 2026-10-28, at the user's
decision: _« garde tout ce qui vient de ce dossier, c'est la nouvelle base. »_ The file it replaced
is in git at `660989c`; it described the page as "a correct skeleton, not a design", which this one
is not.

## What changed against the page it replaces

|                | 2026-10-27 reproduction                         | this                                                                                                               |
| -------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| hand-over      | neighbours overlap, `HOLD` 0.55                 | **no overlap** — a scene is gone at `GONE` 0.48, signed drift, 4% of a band empty between them                     |
| input          | native scroll only, "nothing hijacks the wheel" | **one gesture, one scene**, glided over 1.7–2.9 s; the scrollbar stays native and the end scenes hand back         |
| the field      | `PulseField` — dots read from chain counts      | **`SourceField`** — 22 rings of 6k dots, a Saffron core, and a dive into it on the first hand-over                 |
| between scenes | nothing                                         | a **Saffron seed** per scene, half out of frame, that grows into a cover and opens onto the next                   |
| word scale     | not built                                       | the hero h1 arrives word by word, delay from the **rendered** line                                                 |
| route scale    | not built                                       | in 200 ms, opacity only, loader only past 150 ms. **The out-fade is in this file and not in the app** — ADR `0070` |
| scenes         | hero + 4 figures + the evidence ladder          | **six**, the ladder removed                                                                                        |

## The numbers, in one place

Everything here is a token in the page's `:root`, or a JS constant named in `MOTION-V2.md` §1.

| what                       | value                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------- |
| element arrival, pinned    | `--scene-reveal` **700 ms**, `--scene-step` **150 ms**, `--scene-rise` **28px**             |
| one word of the h1         | `--word-rise` **380 ms**, `--word-step` **34 ms**, `--line-step` **110 ms**                 |
| total stagger of a heading | `--stagger-ceiling` **560 ms**, never more                                                  |
| list rows                  | `--list-step` **30 ms**, first **8** only                                                   |
| route                      | `--route-in` **200 ms**, `--loader-delay` **150 ms**. `--route-out` **120 ms** is here only |
| hand-over                  | `GONE` 0.48 of a band, `SLIDE` 70px, `STEP` dive 2400 / seed 2900 / other 1700 ms           |
| stacks below               | **680px tall / 900px wide** — a pinned scene cannot scroll, so it must fit                  |

## What it asks of whoever builds it

`MOTION-V2.md` §0 lists **seven decisions that were the user's**, three of which go against a
written rule in `.claude/rules/ui.md`. They are recorded as ADRs `0066`–`0069`, and what §4 and §5
became is ADR `0070`. Read those before changing any of them back.

§4 lists six traps that no checker in this repo sees. §5 is the definition of done.

## The one thing motion must not break

Every figure on the real page is somebody's actual deposit, read live from a chain, and **the page
shows nothing it has not read** — where there is no data it says so. The sample names and amounts in
this file (`vault-auditor`, `crytic-runner`, `0.11 TRUST`) are **samples and must not ship**: in the
app each one is a chain read or a sentence saying there is none. Never animate a placeholder into a
figure — the swap underneath is a lie the motion told.
