/**
 * The rubric's fingerprint, worked out the same way on the server and in a buyer's browser: the
 * first 12 hex characters of the SHA-256 of the rubric's JSON text. Web Crypto only, so it runs in
 * both places; rubric-lock.ts takes its text from here.
 *
 *   await fingerprintOf(rubric)              // "ada21f9fbe03"
 *   changedLine(rubric, edited)              // which line an edit touched, in plain words
 */
import type { Rubric } from "@/lib/grading/frozen/score-items";

/** The exact text the fingerprint is taken from (and /api/rubric/v1.json serves). */
export const rubricText = (rubric: Rubric) => JSON.stringify(rubric);

/** SHA-256 of the text, first 12 hex characters. */
export async function fingerprintOfText(text: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 12);
}

export const fingerprintOf = (rubric: Rubric) => fingerprintOfText(rubricText(rubric));

export interface RubricLine {
  /** "q1/q1a" */
  key: string;
  question: number;
  line: number;
  label: string;
  text: string;
  points: number;
}

/** Every marking line, in order: what a visitor can pick to change. */
export function rubricLines(rubric: Rubric): RubricLine[] {
  return rubric.questions.flatMap((q, qi) =>
    q.items.map((item, ii) => ({ key: `${q.id}/${item.id}`, question: qi + 1, line: ii + 1, label: `Question ${qi + 1}, line ${ii + 1}`, text: item.text, points: item.points })),
  );
}

/** A copy of the rubric with one marking line's words replaced. The original is untouched. */
export function withLine(rubric: Rubric, key: string, text: string): Rubric {
  const [qid, iid] = key.split("/");
  return { ...rubric, questions: rubric.questions.map((q) => (q.id !== qid ? q : { ...q, items: q.items.map((item) => (item.id === iid ? { ...item, text } : item)) })) };
}

/** The first marking line whose words differ between two rubrics, or null when none does. */
export function changedLine(before: Rubric, after: Rubric): { label: string; before: string; after: string } | null {
  const was = rubricLines(before);
  const now = rubricLines(after);
  for (const line of now) {
    const old = was.find((w) => w.key === line.key);
    if (old && old.text !== line.text) return { label: line.label, before: old.text, after: line.text };
  }
  return null;
}
