/**
 * Proves the public build carries no trial-licence sponsor code: with NEXT_PUBLIC_SPONSOR_UI off,
 * nothing under .next/static may mention AG Studio or Bryntum. Part of `npm run check`.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dist = process.env.NEXT_DIST_DIR || ".next";
const NAMES = /ag-?studio|bryntum/i;

if (process.env.NEXT_PUBLIC_SPONSOR_UI === "1") {
  console.error("Run this on a build with NEXT_PUBLIC_SPONSOR_UI unset.");
  process.exit(1);
}

const files = readdirSync(join(dist, "static"), { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile());
const hits = files.map((entry) => join(entry.parentPath, entry.name)).filter((path) => NAMES.test(path) || NAMES.test(readFileSync(path, "latin1")));

if (hits.length) {
  console.error(`Sponsor code found in the public build:\n${hits.join("\n")}`);
  process.exit(1);
}
console.log(`No sponsor code in ${files.length} static files.`);
