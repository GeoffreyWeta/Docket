/* Docket does not use the em dash. Not in the interface, not in a server
   message, not in a comment or a doc. This runs before every build (the
   "prebuild" script) and stops it with the file and line of any that crept in.

   Use a comma, a colon, a full stop, brackets, or a spaced hyphen (" - ").

   It scans the repository from the folder above frontend/, skipping installed
   packages and build output. Inside the Docker build that is just the frontend
   and the vocabulary file, which is the part that reaches a screen. */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const EM = "\u2014";
const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const SKIP_DIRS = new Set([".git", "node_modules", ".venv", "venv", "dist", "__pycache__",
                           "staticfiles", ".pytest_cache"]);
const TEXT = /\.(jsx?|mjs|cjs|tsx?|py|json|html|css|md|txt|ya?ml|sh|toml|cfg|ini|template|example|service)$|^(Dockerfile|crontab|docket-manage|\.dockerignore|\.gitignore)$/;

const hits = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    let st;
    try { st = statSync(path); } catch { continue; }
    if (st.isDirectory()) {
      if (!SKIP_DIRS.has(name)) walk(path);
      continue;
    }
    if (!TEXT.test(name) || st.size > 2_000_000) continue;
    const text = readFileSync(path, "utf8");
    if (!text.includes(EM)) continue;
    text.split("\n").forEach((line, i) => {
      if (line.includes(EM)) hits.push(`${relative(ROOT, path)}:${i + 1}: ${line.trim().slice(0, 120)}`);
    });
  }
}
walk(ROOT);

if (hits.length) {
  console.error(`\nFound ${hits.length} em dash${hits.length === 1 ? "" : "es"}. Docket does not use them;` +
                ` use a comma, colon, full stop or " - " instead.\n`);
  for (const h of hits) console.error("  " + h);
  console.error("");
  process.exit(1);
}
console.log("no em dashes");
