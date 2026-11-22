// scripts/generate-contrib-city.mjs
// Fetches your GitHub contribution calendar (GraphQL) and writes an animated "city" SVG:
// every day is a building as tall as that day's contributions, rising front to back,
// then a pin points at your biggest day.
// Usage:  node scripts/generate-contrib-city.mjs          (real data)
//         node scripts/generate-contrib-city.mjs --mock   (random data, for testing)
import { writeFileSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";

const USER = process.env.GH_USER || "IamHarriiii";
const OUT = "assets/contrib-city.svg";

const QUERY = `query($login: String!) {
  user(login: $login) {
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks { contributionDays { date contributionCount contributionLevel } }
      }
    }
  }
}`;
const LEVEL = { NONE: 0, FIRST_QUARTILE: 1, SECOND_QUARTILE: 2, THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4 };

async function load() {
  if (process.argv.includes("--mock")) {
    const days = Array.from({ length: 53 * 7 }, (_, i) => {
      const c = Math.random() < 0.3 ? 0 : Math.floor(Math.random() ** 2 * 40);
      const d = new Date(Date.UTC(2025, 10, 23) + i * 864e5).toISOString().slice(0, 10);
      return { date: d, count: c, level: c === 0 ? 0 : Math.min(4, 1 + Math.floor(c / 10)) };
    });
    return { total: days.reduce((s, d) => s + d.count, 0), days };
  }
  let token = process.env.GH_PAT || process.env.GITHUB_TOKEN;
  if (!token) {
    try { token = execSync("gh auth token").toString().trim(); } catch {}
  }
  if (!token) throw new Error("Set GH_PAT / GITHUB_TOKEN or log in with the gh CLI");
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: QUERY, variables: { login: USER } }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  const cal = json.data.user.contributionsCollection.contributionCalendar;
  const days = cal.weeks.flatMap((w) => w.contributionDays).map((d) => ({
    date: d.date, count: d.contributionCount, level: LEVEL[d.contributionLevel],
  }));
  return { total: cal.totalContributions, days };
}

// current streak: walk back from today until a zero day (start from yesterday if today is empty)
function streak(days) {
  let i = days.length - 1;
  if (days[i].count === 0) i--;
  let n = 0;
  while (i >= 0 && days[i].count > 0) { n++; i--; }
  return n;
}

// f > 0 lightens toward white, f < 0 darkens toward black
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const target = f < 0 ? 0 : 255, p = Math.abs(f);
  const mix = (v) => Math.round(v + (target - v) * p);
  return "#" + [n >> 16, (n >> 8) & 255, n & 255].map((v) => mix(v).toString(16).padStart(2, "0")).join("");
}

const { total, days } = await load();

const RAMP = ["#1b222c", "#0e4429", "#006d32", "#26a641", "#39d353"]; // GitHub dark greens
const ACCENT = "#64ffda";
const C = 10, GAP = 4, STEP = C + GAP; // building footprint and spacing
const DX = 4, DY = 4;                  // oblique offset: up and to the right
const PAD_X = 24, HEADER_H = 34, LABEL_H = 34;
const weeks = Math.ceil(days.length / 7);

const best = days.reduce((a, b) => (b.count > a.count ? b : a));
// height = sqrt(count), so one huge day doesn't flatten the rest of the year
const K = Math.min(5, 70 / Math.sqrt(Math.max(best.count, 1)));
const heightOf = (count) => Math.max(1.5, Math.sqrt(count) * K);
const maxH = heightOf(best.count);

const y0 = HEADER_H + LABEL_H + maxH + DY; // baseline of the back row
const W = PAD_X * 2 + weeks * STEP - GAP + DX;
const H = y0 + 6 * STEP + 40;

const f1 = (v) => Math.round(v * 10) / 10;
const poly = (pts, fill) => `<polygon points="${pts}" fill="${fill}"/>`;

function building(count, level, h) {
  const base = RAMP[level];
  return (
    poly(`0,0 ${C},0 ${C},${f1(-h)} 0,${f1(-h)}`, base) + // front
    poly(`${C},0 ${C + DX},${-DY} ${C + DX},${f1(-DY - h)} ${C},${f1(-h)}`, shade(base, -0.4)) + // shaded side
    poly(`0,${f1(-h)} ${C},${f1(-h)} ${C + DX},${f1(-h - DY)} ${DX},${f1(-h - DY)}`, shade(base, 0.3)) // lit top
  );
}

// draw back row (row 0) first, front row last, so nearer buildings cover farther ones
let city = "";
for (let row = 0; row < 7; row++) {
  for (let col = 0; col < weeks; col++) {
    const i = col * 7 + row;
    if (i >= days.length) continue;
    const d = days[i];
    const h = heightOf(d.count);
    const label = `${d.date}: ${d.count} contribution${d.count === 1 ? "" : "s"}`;
    const shape = building(d.count, d.level, h);
    const x = PAD_X + col * STEP, y = y0 + row * STEP;
    if (d.count === 0) {
      city += `<g transform="translate(${x} ${y})"><title>${label}</title>${shape}</g>\n`; // flat ground, no animation
    } else {
      const begin = ((6 - row) * 0.14 + col * 0.014).toFixed(3); // rises front to back
      city +=
        `<g transform="translate(${x} ${y})"><title>${label}</title>` +
        `<g transform="scale(1 0)"><animateTransform attributeName="transform" type="scale" from="1 0" to="1 1" ` +
        `begin="${begin}s" dur="0.6s" calcMode="spline" keyTimes="0;1" keySplines="0.2 0.8 0.2 1" fill="freeze"/>` +
        `${shape}</g></g>\n`;
    }
  }
}

// pin on the biggest day, appears after the city has risen
let pin = "";
if (best.count > 0) {
  const bi = days.indexOf(best);
  const bcol = Math.floor(bi / 7), brow = bi % 7;
  const px = f1(PAD_X + bcol * STEP + C / 2 + DX / 2);
  const topY = f1(y0 + brow * STEP - heightOf(best.count) - DY);
  const lineY = HEADER_H + 20;
  const anchor = px < 190 ? "start" : px > W - 190 ? "end" : "middle";
  const when = new Date(best.date + "T00:00:00Z").toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  });
  const T = 2.4; // seconds
  pin =
    `<g opacity="0"><animate attributeName="opacity" from="0" to="1" begin="${T}s" dur="0.4s" fill="freeze"/>` +
    `<text x="${px}" y="${HEADER_H + 10}" text-anchor="${anchor}" class="pin">biggest day · ${best.count} on ${when}</text>` +
    `<line x1="${px}" y1="${lineY}" x2="${px}" y2="${topY}" stroke="${ACCENT}" stroke-width="1" stroke-dasharray="2 2"/>` +
    `<circle cx="${px}" cy="${topY}" r="2.5" fill="${ACCENT}"/></g>`;
}

const legendX = W - PAD_X - 5 * STEP - 74;
const legend = RAMP.map((c, i) => `<rect x="${legendX + 32 + i * STEP}" y="${H - 24}" width="${C}" height="${C}" rx="2" fill="${c}"/>`).join("");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${f1(H)}" viewBox="0 0 ${W} ${f1(H)}" role="img" aria-label="GitHub contributions for ${USER} drawn as a city skyline">
<rect width="${W}" height="${f1(H)}" rx="8" fill="#0d1117"/>
<style>text{font-family:'JetBrains Mono',ui-monospace,Menlo,monospace;fill:#8b949e;font-size:11px}.big{fill:${ACCENT};font-size:14px;font-weight:600}.pin{fill:${ACCENT}}</style>
<text class="big" x="${PAD_X}" y="22">${total.toLocaleString("en-US")} contributions in the last year</text>
<text x="${W - PAD_X}" y="22" text-anchor="end">${streak(days)}-day streak</text>
${city}${pin}
<text x="${legendX}" y="${H - 15}">Less</text>${legend}<text x="${legendX + 32 + 5 * STEP + 6}" y="${H - 15}">More</text>
</svg>
`;

mkdirSync("assets", { recursive: true });
writeFileSync(OUT, svg);
console.log(`Wrote ${OUT}: ${total} contributions, ${streak(days)}-day streak, best day ${best.count} on ${best.date}`);
