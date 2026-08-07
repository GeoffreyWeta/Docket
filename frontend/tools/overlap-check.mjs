/* Check the stacking model instead of eyeballing it, which is the standing rule
   in this codebase.

   Three defect classes, all of which put something on top of something else:

   1. an absolutely positioned rule whose intended parent is not a containing
      block, so the element escapes to the initial containing block and lands
      somewhere unrelated (this is how the in-flight bar ended up at the bottom
      of the first screen instead of under the app bar);
   2. two overlay layers whose z-index contradicts how they are used — a scrim
      under the thing it is meant to cover;
   3. a later block silently re-declaring `position` on a shared element. The
      CSS strings are concatenated, so a stray `.topbar{position:relative}` in
      MENU_CSS wins over `position:sticky` in CSS and unsticks the app bar on
      phones — which also unmoors the notification sheet, since that is placed
      a fixed distance below a bar it assumes is pinned.

   It parses the exported CSS strings in the order the app concatenates them,
   including the ${...} interpolations and :has() selector lists, which a naive
   brace scan gets wrong.

   usage: node tools/overlap-check.mjs
*/
import { readFileSync } from "fs";

const SRC = "src";
const read = (f) => readFileSync(`${SRC}/${f}`, "utf8");

/* The concatenation order in App.jsx (ALL_CSS) and superadmin.jsx.
 *
 * Keep this list in step with ALL_CSS. A module missing from here is a module
 * this check silently vouches for without reading — which is worse than not
 * running the check, because the PASS lines imply coverage. The chart, campaign,
 * finance and baseline sheets were all absent while all four shipped absolutely
 * positioned marks. */
const EXPORTS = [
  ["styles.js", "CSS"], ["styles.js", "EXTRA_CSS"], ["styles.js", "THEME_CSS"],
  ["motion.js", "MOTION_CSS"], ["icons.jsx", "ICON_CSS"], ["ui.jsx", "RADAR_CSS"],
  ["scorecards.jsx", "SCORECARD_CSS"], ["buyer.jsx", "MENU_CSS"], ["ui.jsx", "BOOT_CSS"],
  ["palette.jsx", "PALETTE_CSS"], ["charts-css.js", "CHART_CSS"],
  ["campaign.jsx", "CAMPAIGN_CSS"], ["finance.jsx", "FINANCE_CSS"],
  ["baselines.jsx", "BASELINE_CSS"], ["superadmin.jsx", "ADMIN_CSS"],
];

/** Pull `export const NAME = \`...\`` out of a module. */
function extract(file, name) {
  const src = read(file);
  const at = src.indexOf(`export const ${name} = \``);
  if (at < 0) throw new Error(`${name} not found in ${file}`);
  const start = src.indexOf("`", at) + 1;
  let i = start;
  for (; i < src.length; i++) {
    if (src[i] === "\\") { i++; continue; }
    if (src[i] === "`") break;
  }
  return src.slice(start, i);
}

const sheet = EXPORTS.map(([f, n]) => `/*<<${n}>>*/\n` + extract(f, n)).join("\n");

/* Strip comments, then walk declaration blocks, tracking which @media we are in
   and which source block the rule came from. */
const clean = sheet
  .replace(/\$\{[^{}]*\}/g, "X")                                   // ${DUR.base} → X: braces would break tokenising
  .replace(/\/\*[\s\S]*?\*\//g, (m) => (m.includes("<<") ? m : " "));

/** Split a selector list on top-level commas only: :has(a,b) is one selector. */
function splitSelectors(list) {
  const out = [];
  let depth = 0, cur = "";
  for (const ch of list) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === "," && depth === 0) { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

const rules = [];
let origin = "CSS";
let media = null;
let depth = 0;
const re = /(@media[^{]*\{)|(\})|(\/\*<<(\w+)>>\*\/)|([^{}@]+)\{([^{}]*)\}/g;
let m;
while ((m = re.exec(clean))) {
  if (m[3]) { origin = m[4]; continue; }
  if (m[1]) { media = m[1].replace(/\s+/g, " ").trim(); depth++; continue; }
  if (m[2]) { if (depth > 0) { depth--; media = depth ? media : null; } continue; }
  if (m[5]) {
    for (const sel of splitSelectors(m[5])) {
      rules.push({ sel: sel.trim(), body: m[6], media, origin });
    }
  }
}

const fails = [];
const warn = (msg) => { console.log("  FAIL  " + msg); fails.push(msg); };
const pass = (msg) => console.log("  PASS  " + msg);

const decl = (body, prop) => {
  const mm = body.match(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`));
  return mm ? mm[1].trim() : null;
};

/* ---- 1. every absolutely positioned rule needs a positioned ancestor ---- */

// Selectors that establish a containing block for absolute descendants.
const POSITIONED = new Set();
for (const r of rules) {
  const p = decl(r.body, "position");
  if (p && ["relative", "absolute", "fixed", "sticky"].includes(p)) POSITIONED.add(r.sel);
  // filter/backdrop-filter/transform also create one for fixed descendants
  if (decl(r.body, "backdrop-filter") || decl(r.body, "filter") || decl(r.body, "transform")) {
    POSITIONED.add(r.sel + " [cb-by-filter]");
  }
}
const positionedNames = new Set();
for (const sel of POSITIONED) {
  for (const cls of sel.match(/\.[A-Za-z0-9_-]+/g) || []) positionedNames.add(cls);
  for (const tag of sel.match(/^[a-z]+/g) || []) positionedNames.add(tag);
}

// class -> the DOM parent chain we assert for it, from the components
const PARENT_OF = {
  ".topprog": [".topbar"],
  ".navind": [".navlist"],
  ".menu": [".acctwrap"],
  ".ndrop": [".bellwrap"],
  ".sparktip": [".sparkwrap"],
  ".shard": [".sealstage"],
  ".statgo": [".statlink"],
  ".fill": [".hold"],
};

console.log("\n--- absolutely positioned elements have a containing block ---");
for (const r of rules) {
  if (decl(r.body, "position") !== "absolute") continue;
  const key = (r.sel.match(/\.[A-Za-z0-9_-]+(?=(::?[a-z-]+)?$)/) || [])[0];
  const own = r.sel.match(/\.[A-Za-z0-9_-]+/g) || [];
  // a rule like ".stg::before" or ".tline li::before" is anchored by its own subject
  const subject = own[own.length - 1];
  const parents = PARENT_OF[key] || PARENT_OF[subject] || [];
  const anchored = parents.some((p) => positionedNames.has(p))
    || positionedNames.has(subject)            // .stg::before anchored by .stg
    || /::(before|after)$/.test(r.sel);        // pseudo of a rule positioned elsewhere
  if (anchored) pass(`${r.sel}  ←  ${parents.join(", ") || "own subject"}`);
  else warn(`${r.sel} is absolute with no positioned ancestor — it escapes to the page`);
}

/* ---- 2. the overlay ladder must be ordered the way it is used ---- */

console.log("\n--- overlay layering ---");
const z = {};
for (const r of rules) {
  const v = decl(r.body, "z-index");
  if (v && /^\d+$/.test(v)) z[r.sel] = Math.max(z[r.sel] ?? -1, Number(v));
}
// what must sit above what, and why
const ORDER = [
  [".topbar", ".ndrop", "the notification sheet drops over the bar that opens it"],
  [".topbar", ".menu", "the account menu drops over the bar that opens it"],
  [".ndrop", ".panelwrap", "a full-screen panel covers any dropdown left open"],
  [".panelwrap", ".navscrim", "the drawer scrim covers the panels beneath it"],
  [".navscrim", ".side", "the drawer sits on its own scrim"],
  [".side", ".scrim", "a dialog covers the navigation drawer"],
  [".scrim", ".toasts", "a toast is the last word on screen"],
];
for (const [below, above, why] of ORDER) {
  const a = z[above], b = z[below];
  if (a == null || b == null) warn(`missing z-index for ${above} or ${below}`);
  else if (a > b) pass(`${above} (${a}) over ${below} (${b}) — ${why}`);
  else warn(`${above} (${a}) is NOT above ${below} (${b}) — ${why}`);
}

/* ---- 3. nothing may quietly re-declare position on a shared element ---- */

console.log("\n--- position is not overridden across source blocks ---");
const byClass = {};
for (const r of rules) {
  const p = decl(r.body, "position");
  if (!p) continue;
  if (!/^\.[A-Za-z0-9_-]+$/.test(r.sel)) continue;   // bare class only
  (byClass[r.sel] ||= []).push({ ...r, p });
}
for (const [sel, list] of Object.entries(byClass)) {
  const unmediated = list.filter((r) => !r.media);
  const distinct = new Set(unmediated.map((r) => r.p));
  if (unmediated.length > 1 && distinct.size > 1) {
    warn(`${sel} has conflicting position outside any media query: ` +
         unmediated.map((r) => `${r.p} (${r.origin})`).join(" then "));
  } else {
    const shape = list.map((r) => `${r.p}${r.media ? " @desktop" : ""}`).join(" / ");
    pass(`${sel}: ${shape}`);
  }
}

/* ---- 4. bottom-anchored overlays must not share the same edge ---- */

console.log("\n--- bottom-anchored overlays ---");
const bottomFixed = rules.filter((r) => decl(r.body, "position") === "fixed"
  && decl(r.body, "bottom") && !decl(r.body, "top"));
const names = bottomFixed.map((r) => r.sel);
if (names.length > 1) {
  const toastLift = rules.find((r) => /:has\(/.test(r.sel) && /\.toasts/.test(r.sel));
  if (toastLift) pass(`${names.join(", ")} share the bottom edge, and ${toastLift.sel} moves the stack away`);
  else warn(`${names.join(", ")} are all pinned to the bottom edge with nothing separating them`);
} else pass(`only ${names[0] || "nothing"} is pinned to the bottom edge`);
const lift = rules.find((r) => /:has\(/.test(r.sel) && /\.toasts$/.test(r.sel.trim()));
if (lift && decl(lift.body, "bottom") === "auto") {
  pass(`${lift.sel} lifts the stack off the dialog's action row`);
} else {
  warn("nothing moves .toasts away from an open dialog's bottom edge");
}

console.log("\n" + (fails.length ? `${fails.length} PROBLEM(S)` : "NO OVERLAP DEFECTS FOUND"));
process.exit(fails.length ? 1 : 0);
