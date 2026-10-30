// Render the badges the way GitHub does (inside <img>), light and dark, and check that each
// message fits its segment. Run: node test-badges.mjs (builds badge.ts with tsc first).
import {writeFileSync, mkdirSync, readFileSync} from "node:fs";
import {chromium} from "playwright";
import {renderBadge, badgeWidth} from "./dist/badge.js";

const CASES = [
    {message: "used by 312 operators"},
    {message: "uses 7 working tools"},
    {message: "no declared use yet", muted: true},
    {message: "declared by 4 agents"},
    {message: "used by 1,284,551 operators"},
    {message: "used by 1 operator"},
    {message: "a <tag> & \"quote\""},
];
mkdirSync("out", {recursive: true});
const files = CASES.map((c, i) => {
    const svg = renderBadge(c);
    writeFileSync(`out/badge-${i}.svg`, svg);
    return {file: `badge-${i}.svg`, ...c, width: badgeWidth(c.message)};
});

const page = (theme) => `<!doctype html><html><head><meta charset="utf-8"><meta name="color-scheme" content="${theme}"><style>
body{margin:0;padding:24px;background:${theme === "dark" ? "#0d1117" : "#ffffff"};font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:${theme === "dark" ? "#e6edf3" : "#1f2328"}}
p{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 10px}img{display:block;height:20px}</style></head><body>
<h3>README · ${theme}</h3>
${files.map((f) => `<p><img alt="ARP" src="${f.file}"><img alt="shield" src="data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="20"><rect width="80" height="20" rx="3" fill="#4c1"/></svg>')}"></p>`).join("")}
</body></html>`;

const browser = await chromium.launch();
const results = [];
for (const theme of ["light", "dark"]) {
    writeFileSync(`out/readme-${theme}.html`, page(theme));
    const p = await browser.newPage({viewport: {width: 520, height: 420}, colorScheme: theme});
    await p.goto(`http://127.0.0.1:8765/out/readme-${theme}.html`);
    await p.waitForTimeout(300);
    await p.screenshot({path: `out/readme-${theme}.png`});
    // Paint each badge on a canvas at 4x and check: it loaded, it has the expected size, the
    // right segment's last 4 px before the edge hold no text pixel, and the dark rule switched the segment colour.
    const checks = await p.evaluate(async (expected) => {
        const out = [];
        for (const [i, img] of [...document.querySelectorAll('img[alt="ARP"]')].entries()) {
            await img.decode();
            const s = 4, w = img.naturalWidth, h = img.naturalHeight;
            const c = document.createElement("canvas"); c.width = w * s; c.height = h * s;
            const g = c.getContext("2d"); g.drawImage(img, 0, 0, w * s, h * s);
            const px = (x, y) => [...g.getImageData(x, y, 1, 1).data];
            const bg = px((w - 4) * s, 4 * s);
            let clean = true;
            for (let x = (w - 6) * s; x < (w - 2) * s; x++) for (let y = 3 * s; y < 17 * s; y++) {
                const d = px(x, y); if (Math.abs(d[0] - bg[0]) + Math.abs(d[1] - bg[1]) + Math.abs(d[2] - bg[2]) > 40) clean = false;
            }
            out.push({i, w, h, expected: expected[i], rightBg: bg.slice(0, 3), edgeClean: clean, core: px(12 * s, 10 * s).slice(0, 3)});
        }
        return out;
    }, files.map((f) => f.width.total));
    results.push({theme, checks});
    await p.close();
}
await browser.close();
let failed = 0;
for (const {theme, checks} of results) for (const c of checks) {
    const ok = c.w === c.expected && c.h === 20 && c.edgeClean && c.core[0] > 240 && c.core[1] > 160;
    if (!ok) failed++;
    console.log(theme.padEnd(5), files[c.i].message.padEnd(30), `${c.w}x${c.h}`, "segment", c.rightBg.join(","), c.edgeClean ? "fits" : "OVERFLOW", ok ? "ok" : "FAIL");
}
const light = results[0].checks[0].rightBg, dark = results[1].checks[0].rightBg;
const themed = light[0] > 200 && dark[0] < 60;
console.log(themed ? "theme switch: ok" : "theme switch: FAIL");
process.exitCode = failed === 0 && themed ? 0 : 1;
