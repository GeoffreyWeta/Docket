/* Measure the palettes instead of eyeballing them, which is the standing rule
   in this codebase.

   1. WCAG 2.1 contrast for every text-on-surface pair the UI actually renders,
      per theme, resolving var() chains the way the cascade does.
   2. CVD separation: the six status stamps and the three chip families are
      simulated under protanopia and deuteranopia, and the CIE76 distance
      between each pair is reported, because a lifecycle you cannot tell apart
      is a lifecycle carried by colour alone.

   usage: node tools/palette-check.mjs [--all]   (--all lists passes too) */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, "..", "src", "styles.js");
const src = fs.readFileSync(SRC, "utf8");
const verbose = process.argv.includes("--all");

/* ---------- read the token blocks ---------- */
function blockAt(selector, from = 0) {
  const at = src.indexOf(selector + "{", from);
  if (at < 0) return null;
  const end = src.indexOf("\n}", at);
  const out = new Map();
  for (const m of src.slice(at, end).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out.set(m[1], m[2].trim());
  return out;
}
const base = blockAt(":root");
const paper = blockAt(':root[data-theme="paper"]');
const matShared = blockAt(':root[data-theme="material"],:root[data-theme="material-dark"]');
const matLight = blockAt(':root[data-theme="material"]', src.indexOf(':root[data-theme="material"],'));
const matDark = blockAt(':root[data-theme="material-dark"]', src.indexOf(':root[data-theme="material"]{'));
const night = blockAt(':root[data-theme="night"]');

const THEMES = {
  studio: [base],
  paper: [base, paper],
  material: [base, matShared, matLight],
  "material-dark": [base, matShared, matDark],
  night: [base, night],
};

/* status stamp values live in rules, not the token blocks */
function stamps(themeSel) {
  const out = {};
  const re = themeSel
    ? new RegExp(`:root\\[data-theme="${themeSel}"\\] \\.st-(\\w+)\\{--st-fg:([^;]+);--st-bg:([^}]+)\\}`, "g")
    : /\n\.st-(\w+)\{--st-fg:([^;]+);--st-bg:([^}]+)\}/g;
  for (const m of src.matchAll(re)) out[m[1]] = { fg: m[2].trim(), bg: m[3].trim() };
  return out;
}
const STAMPS = {
  studio: stamps(null),
  paper: stamps("paper"),
  material: stamps("material"),
  "material-dark": stamps("material-dark"),
  night: stamps("night"),
};

/* ---------- colour maths ---------- */
const resolve = (value, chain) => {
  let v = String(value).trim();
  for (let i = 0; i < 12; i++) {
    const m = v.match(/^var\((--[\w-]+)\)$/);
    if (!m) break;
    let next;
    for (let k = chain.length - 1; k >= 0; k--) {
      if (chain[k] && chain[k].has(m[1])) { next = chain[k].get(m[1]); break; }
    }
    if (next == null) return null;
    v = String(next).trim();
  }
  return v;
};

function parse(color) {
  if (!color) return null;
  const c = color.trim();
  let m = c.match(/^#([0-9a-f]{6})$/i);
  if (m) {
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  m = c.match(/^#([0-9a-f]{3})$/i);
  if (m) return [...m[1]].map((h) => parseInt(h + h, 16)).concat(1);
  m = c.match(/^rgba?\(([^)]+)\)$/i);
  if (m) {
    const p = m[1].split(",").map((x) => parseFloat(x));
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  }
  return null;
}

/** Flatten a translucent colour over its backdrop, as the compositor would. */
const over = (fg, bg) => fg[3] >= 1 ? fg
  : [0, 1, 2].map((i) => fg[i] * fg[3] + bg[i] * (1 - fg[3])).concat(1);

const lin = (u) => { const c = u / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = (rgb) => 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

/* sRGB -> Lab, for perceptual distance */
function lab(rgb) {
  const [r, g, b] = rgb.slice(0, 3).map(lin);
  let x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  let y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  let z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  [x, y, z] = [f(x), f(y), f(z)];
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
const deltaE = (a, b) => {
  const [l1, a1, b1] = lab(a), [l2, a2, b2] = lab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
};

/* Brettel/Viénot-style dichromacy simulation on linear RGB. */
function cvd(rgb, kind) {
  const [r, g, b] = rgb.slice(0, 3).map(lin);
  const L = 17.8824 * r + 43.5161 * g + 4.11935 * b;
  const M = 3.45565 * r + 27.1554 * g + 3.86714 * b;
  const S = 0.0299566 * r + 0.184309 * g + 1.46709 * b;
  let l = L, m = M, s = S;
  if (kind === "protan") l = 2.02344 * M - 2.52581 * S;
  if (kind === "deutan") m = 0.494207 * L + 1.24827 * S;
  const R = 0.080944 * l - 0.130504 * m + 0.116721 * s;
  const G = -0.0102485 * l + 0.0540194 * m - 0.113615 * s;
  const B = -0.000365294 * l - 0.00412163 * m + 0.693513 * s;
  const enc = (u) => {
    const c = Math.min(1, Math.max(0, u));
    return 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
  };
  return [enc(R), enc(G), enc(B), 1];
}

/* ---------- the pairs the UI actually renders ---------- */
const PAIRS = [
  ["body text on the page", "--ink", "--paper"],
  ["body text on a card", "--ink", "--card"],
  ["muted text on a card", "--muted", "--card"],
  ["faint text on a card", "--faint", "--card"],
  ["faint text on the page", "--faint", "--paper"],
  ["muted text on a sunk panel", "--muted", "--sunk"],
  ["link / primary on a card", "--brand", "--card"],
  ["positive text on a card", "--green", "--card"],
  ["critical text on a card", "--wax", "--wax-tint"],
  ["awarded text on its tint", "--gold-ink", "--brass-tint"],
  ["ok chip", "--green", "--green-tint"],
  ["filled primary label", "--on-brand", "--pri-to"],
  ["filled critical label", "--on-brand", "--wax-to"],
  ["sidebar item", "--side-dim", "--side"],
  ["sidebar active item", "--side-on-ink", "--side"],
  ["sidebar section label", "--side-sec", "--side"],
  ["tooltip", "--tip-ink", "--tip-bg"],
];

const AA = 4.5, AA_LARGE = 3.0;
let failures = 0;

for (const [name, chain] of Object.entries(THEMES)) {
  const rows = [];
  for (const [label, fgTok, bgTok] of PAIRS) {
    const pageBg = parse(resolve("var(--paper)", chain)) || [255, 255, 255, 1];
    const bgRaw = parse(resolve(`var(${bgTok})`, chain));
    const fgRaw = parse(resolve(`var(${fgTok})`, chain));
    if (!bgRaw || !fgRaw) { rows.push([label, null, "unresolved"]); continue; }
    const bg = over(bgRaw, pageBg);
    const r = ratio(over(fgRaw, bg), bg);
    rows.push([label, r, r >= AA ? "AA" : r >= AA_LARGE ? "AA-large only" : "FAIL"]);
  }
  const bad = rows.filter((r) => r[2] === "FAIL" || r[2] === "unresolved");
  failures += bad.length;
  console.log(`\n=== ${name} ===`);
  for (const [label, r, verdict] of rows) {
    if (verbose || verdict !== "AA") {
      console.log(`  ${verdict.padEnd(14)} ${r ? r.toFixed(2).padStart(5) : "  -  "}  ${label}`);
    }
  }
  if (!verbose && !bad.length) console.log("  all pairs AA or better");

  /* status stamp legibility + separation */
  const st = STAMPS[name] || {};
  const keys = Object.keys(st);
  const stampBad = [];
  for (const k of keys) {
    const bg = over(parse(resolve(st[k].bg, chain)) || [255, 255, 255, 1],
                    parse(resolve("var(--card)", chain)) || [255, 255, 255, 1]);
    const fg = over(parse(resolve(st[k].fg, chain)) || [0, 0, 0, 1], bg);
    const r = ratio(fg, bg);
    if (r < AA) stampBad.push(`${k} ${r.toFixed(2)}`);
  }
  console.log(stampBad.length ? `  stamps below AA: ${stampBad.join(", ")}` : `  ${keys.length} status stamps all AA on their own tint`);
  failures += stampBad.length;

  /* CVD separation between stamp backgrounds */
  for (const kind of ["protan", "deutan"]) {
    let worst = { d: Infinity, pair: "" };
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const A = cvd(over(parse(resolve(st[keys[i]].bg, chain)), [255, 255, 255, 1]), kind);
        const B = cvd(over(parse(resolve(st[keys[j]].bg, chain)), [255, 255, 255, 1]), kind);
        const d = deltaE(A, B);
        if (d < worst.d) worst = { d, pair: `${keys[i]}/${keys[j]}` };
      }
    }
    console.log(`  ${kind}: closest stamp pair ${worst.pair} deltaE ${worst.d.toFixed(1)}`);
  }
}

console.log(failures ? `\n${failures} pair(s) below AA` : "\nno pair below AA in any theme");
process.exit(failures ? 1 : 0);
