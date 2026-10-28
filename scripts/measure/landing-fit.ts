/** Does every pinned scene of the landing page fit on screen, and does the page ever scroll sideways?
 *
 *      cd app && bun run build && bunx vite preview --port 4173 &
 *      bun run scripts/measure/landing-fit.ts [url]
 *
 *  ## Why this is a script and not a note to check by hand
 *
 *  `SceneDeck`'s stage is `position: sticky` and `overflow-hidden`, and a pinned scene **cannot
 *  scroll** — that is the point of it. So a scene taller than the space under the nav is cut off
 *  **with no way to reach the rest, and in silence**: nothing throws, nothing logs, and the page
 *  looks finished. `tasks/29`'s Gate asks for three viewports because the failure appears at one
 *  size and not another, and because a scene that grows later re-breaks it without touching the
 *  deck.
 *
 *  It also measures the other thing no gate here sees: **horizontal overflow**. The hero's field
 *  carries its own bleed with `calc(50% + 50vw)`, which is only correct when `50%` resolves against
 *  the content column; wrapped in a bleed div of its own it overran the viewport by
 *  `(100vw - column)/4` — 162px at 1920 — with nothing clipping it.
 *
 *  ## Against the BUILT bundle, not the dev server
 *
 *  Deliberate, and it is the reason the word scale shipped inert once: a CSS minifier rewrites a
 *  time to whichever unit is shorter, so `--line-step: 110ms` became `.11s` and `parseFloat` read
 *  0.11. `bun run dev` serves unminified CSS and shows none of it. Point this at `vite preview`.
 *
 *  ## No new dependency, deliberately
 *
 *  It drives Chromium over the DevTools Protocol with `fetch` and a `WebSocket`, both of which Bun
 *  has. `playwright-core` is in the lockfile as somebody else's transitive dependency and is **not**
 *  declared here; adding a browser driver to this repo is a tooling decision `rules/ui.md`'s
 *  dependency rule asks to be justified on its own, not slipped in by a measurement script. If a
 *  second script ever needs a browser, that is the moment to weigh it.
 *
 *  The Chromium it drives is the one the image already has, under `/root/.cache`. **So this needs
 *  the session to be running as root**, which is a real constraint and the reason to state it here
 *  rather than to report "no browser available".
 */

// A module, so top-level `await` is allowed. There is nothing to import: driving Chromium over the
// DevTools Protocol needs only `fetch` and `WebSocket`, both of which Bun has.
export {};

const CHROME = '/root/.cache/ms-playwright/chromium-1140/chrome-linux/chrome';

/** The nav is `sticky top-0` and 88px tall, so a pinned scene starts below it. */
const NAV = 88;

const PORT = 9333;

const url = process.argv[2] ?? 'http://localhost:4173/';

/** The three viewports the Gate names, plus a phone, where the deck must stack instead. */
const VIEWPORTS = [
  { width: 1440, height: 680, pins: true },
  { width: 1440, height: 900, pins: true },
  { width: 1920, height: 1080, pins: true },
  { width: 390, height: 844, pins: false },
] as const;

/**
 * What the page is asked to report about itself. Evaluated in the page, returned as JSON.
 *
 * **No backticks in here**: it is a template literal, so one ends the probe mid-expression.
 *
 * `samples` deliberately omits `0.11 TRUST`, which the design reference shows and which looks
 * invented. It is **mainnet's real floor** — `getTripleCost()` 0.1 plus `minDeposit` 0.01, read off
 * chain 1155 when the page loads. Listing it as sample data made the first run of this script
 * report a correct chain figure as fabricated, which is the mirror of the defect it looks for. The
 * amounts actually on screen are printed instead, so a wrong one is visible rather than asserted.
 */
const PROBE = String.raw`(() => {
    const doc = document.documentElement;
    const scenes = [...document.querySelectorAll("[data-scene]")];
    const canvas = document.querySelector("canvas");
    const heading = document.querySelector("h1");
    const rect = (el) => el.getBoundingClientRect();
    const header = document.querySelector("header");
    return JSON.stringify({
        pinned: document.querySelector(".arp-deck-pinned") !== null,
        sceneCount: scenes.length,
        scenes: scenes.map((s) => ({
            index: s.getAttribute("data-scene"),
            active: s.getAttribute("aria-hidden") === null,
            inert: s.hasAttribute("inert"),
            top: Math.round(rect(s).top),
            bottom: Math.round(rect(s).bottom),
        })),
        scrollWidth: doc.scrollWidth,
        clientWidth: doc.clientWidth,
        clipped: (() => {
            const before = doc.style.overflowX;
            doc.style.overflowX = 'visible';
            void doc.offsetWidth;
            const over = doc.scrollWidth - doc.clientWidth;
            doc.style.overflowX = before;
            void doc.offsetWidth;
            return over;
        })(),
        scrollbar: window.innerWidth - doc.clientWidth,
        navHeight: header === null ? 0 : Math.round(rect(header).height),
        navPosition: header === null ? null : getComputedStyle(header).position,
        // Scoped to the scene the reader is looking at. An inactive pinned scene is transparent
        // by design, and a stacked scene below the fold has not been revealed yet — counting
        // those made this report 26 hidden elements on a page with nothing wrong with it.
        hidden: (() => {
            const scene = scenes.find((s) => s.getAttribute("aria-hidden") === null) ?? scenes[0];
            if (scene === undefined) return 0;
            return [...scene.querySelectorAll(".arp-rev, .arp-word, .arp-line, .arp-row")]
                .filter((el) => Number(getComputedStyle(el).opacity) < 0.99).length;
        })(),
        // Under reduced motion nothing anywhere may be hidden, which is a stronger claim.
        hiddenAnywhere: [...document.querySelectorAll(".arp-rev, .arp-word, .arp-line, .arp-row")]
            .filter((el) => Number(getComputedStyle(el).opacity) < 0.99).length,
        fieldOverlapsCopy: canvas !== null && heading !== null
            ? rect(canvas).bottom > rect(heading).top && rect(canvas).top < rect(heading).bottom
            : null,
        samples: ["vault-auditor", "crytic-runner", "maturity-bot", "Echidna"]
            .filter((name) => (document.body.textContent ?? "").includes(name)),
        amounts: [...document.querySelectorAll("dd, strong")]
            .map((el) => el.textContent ?? "")
            .filter((text) => /[\d.]+\s*t?TRUST/.test(text)),
        anchors: [...document.querySelectorAll('a[href^="#"]')]
            .map((a) => a.getAttribute("href"))
            .filter((href) => href !== null && document.querySelector(href) === null),
    });
})()`;

/**
 * Scroll to one scene's band and report whether the scene that becomes active fits.
 *
 * The whole reason this script exists. At scroll 0 only scene 0 is active, so a one-shot
 * measurement checks one of six — and the stage is `overflow-hidden`, so the other five clip in
 * silence. `scrollTo` rather than a wheel event on purpose: the deck owns the wheel (ADR `0066`)
 * and swallows it, but the scrollbar stays native, which is exactly what this uses.
 */
const BAND = (index: number) =>
  String.raw`(() => {
    const deck = document.querySelector(".arp-deck-pinned");
    if (deck === null) return JSON.stringify({pinned: false});
    const top = window.scrollY + deck.getBoundingClientRect().top;
    window.scrollTo({top: top + ` +
  index +
  String.raw` * window.innerHeight, behavior: "instant"});
    return JSON.stringify({pinned: true});
})()`;

const ACTIVE = String.raw`(() => {
    const scene = [...document.querySelectorAll("[data-scene]")]
        .find((s) => s.getAttribute("aria-hidden") === null);
    if (scene === undefined) return JSON.stringify({index: null});
    const box = scene.getBoundingClientRect();
    return JSON.stringify({
        index: scene.getAttribute("data-scene"),
        top: Math.round(box.top),
        bottom: Math.round(box.bottom),
        opacity: Number(getComputedStyle(scene).opacity).toFixed(2),
        hidden: [...scene.querySelectorAll(".arp-rev, .arp-word, .arp-line, .arp-row")]
            .filter((el) => Number(getComputedStyle(el).opacity) < 0.99).length,
        heading: (scene.querySelector("h1, h2, p")?.textContent ?? "")
            .replace(/\s+/g, " ").trim().slice(0, 52),
    });
})()`;

type Probe = {
  pinned: boolean;
  sceneCount: number;
  scenes: { index: string | null; active: boolean; inert: boolean; top: number; bottom: number }[];
  scrollWidth: number;
  clientWidth: number;
  clipped: number;
  scrollbar: number;
  navHeight: number;
  navPosition: string | null;
  hidden: number;
  hiddenAnywhere: number;
  fieldOverlapsCopy: boolean | null;
  samples: string[];
  amounts: string[];
  anchors: string[];
};

const findings: { where: string; what: string; detail: string }[] = [];
const note = (where: string, what: string, detail: string) =>
  findings.push({ where, what, detail });

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** One CDP session over a page target: send a command, await its reply by id. */
async function session(socketUrl: string) {
  const socket = new WebSocket(socketUrl);
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener('open', () => resolve(), { once: true });
    socket.addEventListener('error', () => reject(new Error('CDP socket failed')), { once: true });
  });
  let nextId = 0;
  const pending = new Map<number, (value: unknown) => void>();
  const events = new Map<string, ((params: Record<string, unknown>) => void)[]>();
  socket.addEventListener('message', (event) => {
    const frame = JSON.parse(String(event.data)) as {
      id?: number;
      result?: unknown;
      method?: string;
      params?: Record<string, unknown>;
    };
    if (frame.id === undefined) {
      if (frame.method === undefined) return;
      for (const handler of events.get(frame.method) ?? []) handler(frame.params ?? {});
      return;
    }
    pending.get(frame.id)?.(frame.result);
    pending.delete(frame.id);
  });
  return {
    send(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
      const id = (nextId += 1);
      const reply = new Promise<unknown>((resolve) => pending.set(id, resolve));
      socket.send(JSON.stringify({ id, method, params }));
      return reply;
    },
    /** Subscribe to a CDP event, for the ones that arrive unprompted. */
    on(method: string, handler: (params: Record<string, unknown>) => void) {
      const listeners = events.get(method) ?? [];
      listeners.push(handler);
      events.set(method, listeners);
    },
    close: () => socket.close(),
  };
}

async function launch(width: number, height: number, reduced: boolean) {
  const args = [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=/tmp/arp-fit-${width}x${height}${reduced ? '-reduced' : ''}`,
    // `--window-size` is the WINDOW, not the viewport, and includes chrome even in
    // `headless=new`: 1440x680 gave `innerHeight` 487, so the Gate's first viewport was
    // silently being tested at 1440x487 — below `MIN_HEIGHT`, which is why it reported "does
    // not pin". The exact viewport comes from `Emulation.setDeviceMetricsOverride` below;
    // this is only a starting size.
    `--window-size=${width},${height + 400}`,
    // Chromium's own switch rather than CDP emulation, because the deck reads the media query
    // once at mount to decide whether to pin at all — emulating it after load is too late.
    ...(reduced ? ['--force-prefers-reduced-motion'] : []),
    'about:blank',
  ];
  const child = Bun.spawn([CHROME, ...args], { stdout: 'ignore', stderr: 'ignore' });
  for (let attempt = 0; attempt < 60; attempt += 1) {
    await sleep(250);
    try {
      const targets = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()) as {
        type: string;
        webSocketDebuggerUrl: string;
      }[];
      const page = targets.find((target) => target.type === 'page');
      if (page !== undefined) return { child, socketUrl: page.webSocketDebuggerUrl };
    } catch {
      // Not listening yet.
    }
  }
  child.kill();
  throw new Error(`Chromium did not expose a page target on ${PORT}.`);
}

for (const reduced of [false, true]) {
  for (const viewport of VIEWPORTS) {
    const where = `${viewport.width}x${viewport.height}${reduced ? ' reduced' : ''}`;
    const { child, socketUrl } = await launch(viewport.width, viewport.height, reduced);
    const cdp = await session(socketUrl);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    // A throw inside a scroll handler would leave every geometric assertion below passing.
    await cdp.send('Log.enable');
    const consoleErrors: string[] = [];
    cdp.on('Log.entryAdded', (params) => {
      const entry = (params as { entry?: { level?: string; text?: string } }).entry;
      if (entry?.level === 'error') consoleErrors.push(entry.text ?? 'unknown');
    });
    cdp.on('Runtime.exceptionThrown', (params) => {
      const details = (params as { exceptionDetails?: { text?: string } }).exceptionDetails;
      consoleErrors.push(details?.text ?? 'uncaught exception');
    });
    // Set before navigating, so the deck's one-time measurement at mount sees the real size.
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await cdp.send('Page.navigate', { url });
    // The chain reads fail in here, which is one of the states worth seeing. The wait is for
    // layout and for the deck's own measurement to settle.
    await sleep(2500);
    const reply = (await cdp.send('Runtime.evaluate', {
      expression: PROBE,
      returnByValue: true,
    })) as { result?: { value?: string } };

    const raw = reply.result?.value;
    if (raw === undefined) {
      note(where, 'probe returned nothing', 'the page did not evaluate');
      cdp.close();
      child.kill();
      await sleep(300);
      continue;
    }
    const page = JSON.parse(raw) as Probe;

    console.log(
      `\n${where}  pinned=${page.pinned}  scenes=${page.sceneCount}  nav=${page.navHeight}px ${page.navPosition}`,
    );

    if (reduced && page.pinned) {
      note(where, 'pins under reduced motion', 'reduced means none, not less');
    }
    if (!reduced && page.pinned !== viewport.pins) {
      note(where, 'wrong mode', `expected pinned=${viewport.pins}, got ${page.pinned}`);
    }
    if (page.sceneCount !== 6) {
      note(where, 'wrong scene count', `expected 6, got ${page.sceneCount}`);
    }
    if (page.scrollWidth > page.clientWidth) {
      note(
        where,
        'horizontal scroll',
        `scrollWidth ${page.scrollWidth} > clientWidth ${page.clientWidth} (+${page.scrollWidth - page.clientWidth}px)`,
      );
    }
    // **The check above cannot fail while `overflow-x: clip` is in place**, because `clip` clamps
    // `scrollWidth` to `clientWidth` — the 162px bleed overrun this script's header cites as its
    // reason for existing would be clipped and reported as passing. So the probe lifts the clip,
    // measures, and restores it, and the figure is printed rather than failed: a bleed that runs
    // past the viewport and is cut is the design, since no CSS unit excludes the scrollbar. It
    // should be 0, or about half a scrollbar where a `calc(50% + 50vw)` element is in the stacked
    // flow.
    console.log(
      `  bleed past the viewport, clip lifted: ${page.clipped}px (scrollbar ${page.scrollbar}px)`,
    );
    if (page.clipped > page.scrollbar) {
      note(
        where,
        'the clip hides more than a scrollbar',
        `${page.clipped}px past the viewport against a ${page.scrollbar}px scrollbar — a bleed should overrun by at most half of one`,
      );
    }
    if (page.hidden > 0) {
      note(
        where,
        'the active scene has transparent content',
        `${page.hidden} element(s) under opacity 0.99`,
      );
    }
    if (reduced && page.hiddenAnywhere > 0) {
      note(
        where,
        'reduced motion still hides content',
        `${page.hiddenAnywhere} element(s) under opacity 0.99 — reduced means none`,
      );
    }
    if (page.samples.length > 0) {
      note(where, 'sample data on the page', page.samples.join(', '));
    }
    console.log(`  amounts on screen: ${page.amounts.join(' / ') || 'none'}`);
    if (page.anchors.length > 0) {
      note(where, 'anchor with no target', page.anchors.join(', '));
    }
    // Below 900px the field sits above the copy rather than behind it, in **every** run at that
    // width — the reduced-motion ones included, which is the configuration the Gate line is
    // actually about. The guard used to exclude them and so fired in one run of eight.
    if (viewport.width <= 900 && page.fieldOverlapsCopy === true) {
      note(where, 'field behind the hero copy', 'below 900px it sits above it, 320px tall');
    }
    if (page.pinned && page.navPosition !== 'sticky') {
      note(where, 'nav is not sticky', `position: ${page.navPosition}; the deck assumes 88px`);
    }

    if (!page.pinned) {
      // Stacked, every scene is in the document flow and scrolls normally; "fit" is not a
      // question. What matters here is the two checks already made above: no sideways
      // scroll, and nothing left hidden.
      console.log('  stacked — fit does not apply');
      cdp.close();
      child.kill();
      await sleep(300);
      continue;
    }

    // Each scene in turn, which is the check the Gate actually asks for.
    for (let index = 0; index < page.sceneCount; index += 1) {
      await cdp.send('Runtime.evaluate', { expression: BAND(index), returnByValue: true });
      // Long enough for the slowest thing in any scene to finish: `--reveal-index` reaches
      // 11, so 11 x `--scene-step` 150ms + `--scene-reveal` 700ms = 2350ms, and Fig. 02's
      // authored diagram runs to `--draw-at` 3700ms. 700ms measured mid-stagger and reported
      // four scenes as hiding content that was simply still arriving.
      await sleep(4200);
      const activeReply = (await cdp.send('Runtime.evaluate', {
        expression: ACTIVE,
        returnByValue: true,
      })) as { result?: { value?: string } };
      const scene = JSON.parse(activeReply.result?.value ?? '{}') as {
        index: string | null;
        top: number;
        bottom: number;
        opacity: string;
        hidden: number;
        heading: string;
      };
      if (scene.index === null) {
        note(where, `band ${index} has no active scene`, 'every scene is aria-hidden');
        continue;
      }
      const fits = scene.top >= NAV - 1 && scene.bottom <= viewport.height + 1;
      console.log(
        `  band ${index} -> scene ${scene.index} (${scene.opacity}): ${scene.top}..${scene.bottom} ${fits ? 'fits' : 'DOES NOT FIT'}  "${scene.heading}"`,
      );
      if (!fits) {
        note(
          where,
          `scene ${scene.index} does not fit`,
          `top ${scene.top} (needs >= ${NAV}), bottom ${scene.bottom} (needs <= ${viewport.height}) — overflows by ${Math.max(NAV - scene.top, scene.bottom - viewport.height)}px`,
        );
      }
      if (scene.index !== String(index)) {
        note(
          where,
          `band ${index} activates scene ${scene.index}`,
          'one viewport of scroll should be one scene',
        );
      }
      if (scene.hidden > 0) {
        note(
          where,
          `scene ${scene.index} still has transparent content`,
          `${scene.hidden} element(s) under opacity 0.99 after the hand-over settled`,
        );
      }
    }

    // --- Gate check 2: one gesture, one scene (ADR `0066`) ------------------------------
    //
    // The decision this deck is most likely to be wrong about, and the one nothing static can
    // see. `SETTLE` is tuned rather than derived, so a burst is the test that matters: a
    // trackpad delivers momentum events for up to a second after the finger lifts, and without
    // the settle window one flick advanced three scenes.
    await cdp.send('Runtime.evaluate', { expression: BAND(0), returnByValue: true });
    await sleep(1200);

    const wheel = async (times: number) => {
      for (let i = 0; i < times; i += 1) {
        await cdp.send('Input.dispatchMouseEvent', {
          type: 'mouseWheel',
          x: Math.round(viewport.width / 2),
          y: Math.round(viewport.height / 2),
          deltaX: 0,
          deltaY: 120,
        });
        await sleep(30);
      }
    };
    const activeIndex = async (): Promise<string | null> => {
      const reply = (await cdp.send('Runtime.evaluate', {
        expression: ACTIVE,
        returnByValue: true,
      })) as { result?: { value?: string } };
      return (JSON.parse(reply.result?.value ?? '{}') as { index: string | null }).index;
    };

    await wheel(1);
    // The dive is the longest hand-over at `STEP.dive` 2400ms, plus `SETTLE` 300ms.
    await sleep(3400);
    const afterOne = await activeIndex();
    console.log(`  one wheel notch from the top -> scene ${afterOne}`);
    if (afterOne !== '1') {
      note(where, 'one notch did not play one scene', `landed on scene ${afterOne}, want 1`);
    }

    await wheel(6);
    await sleep(3800);
    const afterBurst = await activeIndex();
    console.log(`  a burst of six notches -> scene ${afterBurst}`);
    if (afterBurst !== '2') {
      note(
        where,
        'a burst advanced more than one scene',
        `landed on scene ${afterBurst}, want 2 — SETTLE is not swallowing the tail`,
      );
    }

    // --- Gate check 3: `#build` lands on the LAST scene (`data-scene` is 0-based), visible --------------------------------
    //
    // It once moved the page 268px and left the target at `opacity: 0`, because an inactive
    // scene is `position: absolute` inside the sticky stage and the browser's own anchor
    // handling scrolls to its box.
    await cdp.send('Runtime.evaluate', { expression: BAND(0), returnByValue: true });
    await sleep(1200);
    await cdp.send('Runtime.evaluate', {
      expression: String.raw`document.querySelector('a[href="#build"]')?.click()`,
      returnByValue: true,
    });
    await sleep(2600);
    const jumpReply = (await cdp.send('Runtime.evaluate', {
      expression: ACTIVE,
      returnByValue: true,
    })) as { result?: { value?: string } };
    const jumped = JSON.parse(jumpReply.result?.value ?? '{}') as {
      index: string | null;
      opacity: string;
    };
    console.log(`  #build -> scene ${jumped.index} at opacity ${jumped.opacity}`);
    if (jumped.index !== '5') {
      note(where, '#build landed on the wrong scene', `scene ${jumped.index}, want 5`);
    } else if (Number(jumped.opacity) < 0.99) {
      note(where, '#build landed on a transparent scene', `opacity ${jumped.opacity}`);
    }

    if (consoleErrors.length > 0) {
      note(where, 'console errors', consoleErrors.slice(0, 3).join(' | '));
    }

    cdp.close();
    child.kill();
    await sleep(300);
  }
}

if (findings.length === 0) {
  console.log('\nEvery viewport passes: scenes fit, no sideways scroll, nothing left hidden.');
  process.exit(0);
}
console.error(`\n${findings.length} finding(s):\n`);
for (const finding of findings) {
  console.error(`  ${finding.where}  ${finding.what}\n      ${finding.detail}`);
}
process.exit(1);
