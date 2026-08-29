import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const scanExts = new Set([".html", ".css"]);
const ignoredDirs = new Set([".git", ".wrangler", "node_modules"]);
const files = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (scanExts.has(path.extname(entry.name).toLowerCase())) files.push(full);
  }
}

function shouldCheck(raw) {
  return raw &&
    !/^(?:https?:|data:|blob:|mailto:|javascript:|#|\/\/)/i.test(raw) &&
    !/[${}]/.test(raw) &&
    !raw.startsWith("var(");
}

walk(root);
const missing = [];
let checked = 0;

for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  const refs = [];
  if (file.endsWith(".html")) {
    for (const match of source.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)) refs.push(match[1]);
  } else {
    for (const match of source.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) refs.push(match[1]);
  }

  for (const raw of refs) {
    if (!shouldCheck(raw)) continue;
    const clean = decodeURIComponent(raw.split(/[?#]/, 1)[0]);
    const target = path.resolve(path.dirname(file), clean);
    checked += 1;
    if (!fs.existsSync(target)) {
      missing.push(`${path.relative(root, file)} -> ${raw}`);
    }
  }
}

if (missing.length) {
  throw new Error(`Missing local asset references:\n${missing.join("\n")}`);
}
console.log(`PASS asset references: ${checked} local HTML/CSS paths exist across ${files.length} files`);
