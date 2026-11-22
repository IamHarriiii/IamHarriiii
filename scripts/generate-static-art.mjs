// scripts/generate-static-art.mjs
// Writes two static SVGs (no network, no API token needed):
//   assets/divider.svg   - thin strip of small isometric tiles, used between README sections
//   assets/timeline.svg  - education + internships on one time axis, shown above the experience text
// Run once with `node scripts/generate-static-art.mjs` and commit the two files.
// Dates below come from the resume; edit them here if they change.
import { writeFileSync, mkdirSync } from "node:fs";

const RAMP = ["#1b222c", "#0e4429", "#006d32", "#26a641", "#39d353"]; // GitHub dark greens
const ACCENT = "#64ffda";
const MUTED = "#8b949e";

// f > 0 lightens toward white, f < 0 darkens toward black
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const target = f < 0 ? 0 : 255, p = Math.abs(f);
  const mix = (v) => Math.round(v + (target - v) * p);
  return "#" + [n >> 16, (n >> 8) & 255, n & 255].map((v) => mix(v).toString(16).padStart(2, "0")).join("");
}
const f1 = (v) => Math.round(v * 10) / 10;
const poly = (pts, fill) => `<polygon points="${pts}" fill="${fill}"/>`;

// an oblique box whose front-bottom-left corner is at (x, y); it grows up and to the right
function box(x, y, w, h, color, dx, dy, title = "") {
  return (
    `<g transform="translate(${f1(x)} ${f1(y)})">${title ? `<title>${title}</title>` : ""}` +
    poly(`0,0 ${f1(w)},0 ${f1(w)},${-h} 0,${-h}`, color) +
    poly(`${f1(w)},0 ${f1(w + dx)},${-dy} ${f1(w + dx)},${-dy - h} ${f1(w)},${-h}`, shade(color, -0.4)) +
    poly(`0,${-h} ${f1(w)},${-h} ${f1(w + dx)},${-h - dy} ${dx},${-h - dy}`, shade(color, 0.3)) +
    `</g>`
  );
}

// same width as the contribution city (53 columns) so everything lines up
const C = 10, GAP = 4, STEP = C + GAP, PAD_X = 24, COLS = 53;
const W = PAD_X * 2 + COLS * STEP - GAP + 4;

// ---------- divider ----------
function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(7); // fixed seed, so the strip is identical every time you regenerate it
let tiles = "";
for (let i = 0; i < COLS; i++) {
  const envelope = Math.sin((Math.PI * (i + 0.5)) / COLS); // low at the edges, taller in the middle
  const v = envelope * 0.8 + rand() * 0.5;
  const level = v < 0.2 ? 0 : v < 0.45 ? 1 : v < 0.7 ? 2 : v < 0.95 ? 3 : 4;
  tiles += box(PAD_X + i * STEP, 15, C, 1.5 + level * 1.3, RAMP[level], 4, 4);
}
const dividerH = 20;
const divider = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${dividerH}" viewBox="0 0 ${W} ${dividerH}" role="presentation">\n${tiles}\n</svg>\n`;

// ---------- timeline ----------
const m = (y, mo) => y * 12 + (mo - 1); // month index
const START = m(2022, 11), END = m(2026, 8) + 1; // axis: Nov 2022 to the end of Aug 2026
const SLAB_DX = 6, BLOCK_DX = 5;
const usable = W - 2 * PAD_X - SLAB_DX;
const px = (mi) => PAD_X + ((mi - START) * usable) / (END - START);

const items = [
  { name: "TiVo", role: "Software Developer Intern", dates: "Aug – Nov 2024", from: m(2024, 8), to: m(2024, 11) + 1, color: RAMP[3] },
  { name: "RevGain AI", role: "Software Developer Intern", dates: "Sep 2025 – Feb 2026", from: m(2025, 9), to: m(2026, 2) + 1, color: RAMP[4] },
];

const baseY = 100, slabH = 10, blockH = 30;
const slabX = px(START), slabW = px(END) - px(START);
let tl = box(slabX, baseY, slabW, slabH, RAMP[2], SLAB_DX, SLAB_DX, "B.Tech CSE, Amrita Vishwa Vidyapeetham: Nov 2022 – Aug 2026");

for (const it of items) {
  const x = px(it.from), w = px(it.to) - px(it.from);
  const y = baseY - slabH - 2; // stands on the slab's top face
  tl += box(x, y, w, blockH, it.color, BLOCK_DX, BLOCK_DX, `${it.name}: ${it.role}, ${it.dates}`);
  const cx = f1(x + w / 2 + BLOCK_DX / 2);
  tl += `<text class="lab" x="${cx}" y="30" text-anchor="middle">${it.name}</text>`;
  tl += `<text x="${cx}" y="44" text-anchor="middle">${it.dates}</text>`;
}

for (const yr of [2023, 2024, 2025, 2026]) {
  const x = f1(px(m(yr, 1)));
  tl += `<line x1="${x}" y1="${baseY + 3}" x2="${x}" y2="${baseY + 9}" stroke="#30363d" stroke-width="1"/>`;
  tl += `<text x="${x}" y="${baseY + 22}" text-anchor="middle">${yr}</text>`;
}
tl += `<text class="lab" x="${PAD_X}" y="${baseY + 46}">B.Tech CSE · Amrita Vishwa Vidyapeetham</text>`;
tl += `<text x="${W - PAD_X}" y="${baseY + 46}" text-anchor="end">Nov 2022 – Aug 2026</text>`;

const tlH = baseY + 62;
const timeline = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${tlH}" viewBox="0 0 ${W} ${tlH}" role="img" aria-label="Timeline: B.Tech at Amrita Nov 2022 to Aug 2026; TiVo internship Aug to Nov 2024; RevGain AI internship Sep 2025 to Feb 2026">
<rect width="${W}" height="${tlH}" rx="8" fill="#0d1117"/>
<style>text{font-family:'JetBrains Mono',ui-monospace,Menlo,monospace;fill:${MUTED};font-size:11px}.lab{fill:${ACCENT};font-size:12px;font-weight:600}</style>
${tl}
</svg>
`;

mkdirSync("assets", { recursive: true });
writeFileSync("assets/divider.svg", divider);
writeFileSync("assets/timeline.svg", timeline);
console.log(`Wrote assets/divider.svg and assets/timeline.svg (${W}px wide)`);
