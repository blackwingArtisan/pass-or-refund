// Loads a set and renders the parts the grader may see. Reads only packet.md, rubric.json and
// attempts.json: author-intent.json and judges/ are deliberately never touched. Paths are relative
// to the cwd, which must be fresh-1.
import fs from "node:fs";
import path from "node:path";
import type { Answers, Rubric } from "./score-items";

export const SETS = ["dev", "test", "fixture"] as const;
export type SetName = (typeof SETS)[number];

export function isSetName(name: string): name is SetName {
  return (SETS as readonly string[]).includes(name);
}

export interface Course {
  slug: string;
  /** packet.md above the "## Rubric" heading: course content and final check. */
  text: string;
  rubric: Rubric;
}

export interface Attempt {
  id: string;
  course: string;
  answers: Answers;
}

export interface LoadedSet {
  courses: Map<string, Course>;
  attempts: Attempt[];
}

/** Cuts packet.md at the rubric heading, so the human-readable rubric never reaches the grader. */
export function courseTextOf(packetMd: string): string {
  const cut = packetMd.search(/^## Rubric\b/m);
  if (cut < 0) throw new Error('packet.md has no "## Rubric" heading');
  return packetMd.slice(0, cut).trim();
}

export function loadCourse(set: SetName, slug: string): Course {
  const dir = path.join(set, "courses", slug);
  const rubric: Rubric = JSON.parse(fs.readFileSync(path.join(dir, "rubric.json"), "utf8"));
  for (const q of rubric.questions) {
    const sum = q.items.reduce((s, item) => s + item.points, 0);
    if (sum !== q.points) throw new Error(`${slug} ${q.id}: items sum to ${sum}, question is worth ${q.points}`);
  }
  return { slug, text: courseTextOf(fs.readFileSync(path.join(dir, "packet.md"), "utf8")), rubric };
}

export function loadSet(set: SetName): LoadedSet {
  const slugs = fs
    .readdirSync(path.join(set, "courses"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  const courses = new Map(slugs.map((slug) => [slug, loadCourse(set, slug)]));
  const attempts: Attempt[] = JSON.parse(fs.readFileSync(path.join(set, "attempts.json"), "utf8"));
  for (const a of attempts) {
    if (!courses.has(a.course)) throw new Error(`${a.id}: no course folder for "${a.course}"`);
  }
  return { courses, attempts };
}

export function renderRubric(rubric: Rubric): string {
  const worth = rubric.questions.reduce((s, q) => s + q.points, 0);
  const questions = rubric.questions.map((q) => {
    const lines = [`**${q.id.toUpperCase()} (${q.points} points)** ${q.text}`];
    for (const item of q.items) lines.push(`Item ${item.id} (${item.points} points): ${item.text}`);
    for (const cap of q.caps) lines.push(`Cap ${cap.id} (question scores at most ${cap.max}): ${cap.text}`);
    return lines.join("\n");
  });
  return [`## Rubric (${worth} points, pass mark ${rubric.passMark})`, ...questions].join("\n\n");
}
