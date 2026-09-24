// Reports translation coverage against English and flags keys that do not exist in English.
// Usage: npm run check:i18n
import { readFileSync } from "node:fs";

const read = (locale) => JSON.parse(readFileSync(new URL(`../src/i18n/messages/${locale}.json`, import.meta.url), "utf8"));

function leaves(obj, prefix = "") {
  return Object.entries(obj).flatMap(([key, value]) => {
    if (key === "_unreviewed") return [];
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === "string" ? [path] : leaves(value, path);
  });
}

const english = new Set(leaves(read("en")));
let failed = false;

for (const locale of ["sw", "fr", "ar"]) {
  const file = read(locale);
  const keys = leaves(file);
  const unknown = keys.filter((k) => !english.has(k));
  const unreviewed = file._unreviewed ?? [];
  const translated = keys.filter((k) => english.has(k) && !unreviewed.some((p) => k === p || k.startsWith(`${p}.`)));
  const pct = Math.round((translated.length / english.size) * 100);
  console.log(`${locale}: ${translated.length}/${english.size} keys translated (${pct}%), falls back to English for the rest`);
  if (unreviewed.length) console.log(`   held back as unreviewed: ${unreviewed.join(", ")}`);
  if (unknown.length) {
    failed = true;
    console.log(`   UNKNOWN keys (not in en.json): ${unknown.join(", ")}`);
  }
}

process.exit(failed ? 1 : 0);
