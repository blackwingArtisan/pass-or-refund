/**
 * A creator's own rubric, from pasted JSON or the simple form on /creator. Validation speaks in
 * plain words, and every rubric comes out in one normal shape (ids by position, keys in the same
 * order as the sample course's rubric.json), so the same rubric always gets the same fingerprint
 * and pasting the public sample rubric gives the sample's own fingerprint. Safe in the browser.
 */
import type { Rubric } from "@/lib/grading/frozen/score-items";

export const LIMITS = { questions: 6, lines: 8, caps: 3, titleChars: 80, textChars: 600, notesChars: 6000 } as const;

/** What the simple form sends: one question per entry, rubric lines as "7 Says honing ..." text. */
export interface RubricForm {
  title: string;
  passMark: string | number;
  questions: { text: string; lines: string }[];
}

export type CreatorRubricResult = { ok: true; rubric: Rubric } | { ok: false; problems: string[] };

const LETTERS = "abcdefghijklmnopqrstuvwxyz";

export const slugOf = (title: string) =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "course";

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");
const wholeNumber = (v: unknown): number | null => {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isInteger(n) ? n : null;
};

/** "7 Says honing ...", "7: Says ..." or "7 | Says ..." -> points and text. */
export function parseLine(line: string): { points: number | null; text: string } {
  const m = line.match(/^\s*(\d+)\s*(?:points?|pts?)?\s*[|:.)-]?\s*(.*)$/i);
  return m ? { points: Number(m[1]), text: text(m[2]) } : { points: null, text: text(line) };
}

/** The simple form, as the same shape a pasted rubric has. */
export function formToInput(form: RubricForm): unknown {
  return {
    title: form.title,
    passMark: form.passMark,
    questions: form.questions.map((q) => ({
      text: q.text,
      items: q.lines
        .split("\n")
        .filter((l) => l.trim())
        .map((l) => parseLine(l)),
    })),
  };
}

/** Pasted text: JSON in the shape of /api/rubric/1. */
export function parsePasted(pasted: string): CreatorRubricResult {
  let data: unknown;
  try {
    data = JSON.parse(pasted);
  } catch (error) {
    const where = error instanceof Error ? error.message : "";
    return { ok: false, problems: [`That isn't valid JSON, so nothing was read. Check for a missing comma, quote or bracket${where ? ` (${where})` : ""}.`] };
  }
  return checkRubric(data);
}

/** Checks a rubric and returns it in the one normal shape, or every problem in plain words. */
export function checkRubric(input: unknown): CreatorRubricResult {
  const problems: string[] = [];
  if (!isRecord(input)) return { ok: false, problems: ["The rubric needs a title, a pass mark and a list of questions."] };

  const title = text(input.title);
  if (!title) problems.push("Give the course a title.");
  else if (title.length > LIMITS.titleChars) problems.push(`Keep the title to ${LIMITS.titleChars} characters or fewer.`);

  const passMark = wholeNumber(input.passMark);
  if (passMark === null || passMark < 1 || passMark > 100) problems.push("The pass mark has to be a whole number from 1 to 100.");

  const rawQuestions = Array.isArray(input.questions) ? input.questions : [];
  if (rawQuestions.length === 0) problems.push("Add at least one question.");
  if (rawQuestions.length > LIMITS.questions) problems.push(`Keep it to ${LIMITS.questions} questions or fewer.`);

  const questions: Rubric["questions"] = rawQuestions.slice(0, LIMITS.questions).map((raw, qi) => {
    const n = qi + 1;
    const q = isRecord(raw) ? raw : {};
    const qText = text(q.text);
    if (!qText) problems.push(`Question ${n} needs its wording, what the learner is asked.`);
    else if (qText.length > LIMITS.textChars) problems.push(`Question ${n} is too long. Keep it to ${LIMITS.textChars} characters.`);
    const rawItems = Array.isArray(q.items) ? q.items : [];
    if (rawItems.length === 0) problems.push(`Question ${n} needs at least one rubric line: something a good answer says, with its points.`);
    if (rawItems.length > LIMITS.lines) problems.push(`Question ${n} has ${rawItems.length} rubric lines. Keep it to ${LIMITS.lines}.`);
    const items = rawItems.slice(0, LIMITS.lines).map((rawItem, ii) => {
      const item = isRecord(rawItem) ? rawItem : {};
      const points = wholeNumber(item.points);
      const itemText = text(item.text);
      if (points === null || points < 1) problems.push(`Question ${n}, line ${ii + 1} needs a whole number of points above 0, written first, like "7 Says ...".`);
      if (!itemText) problems.push(`Question ${n}, line ${ii + 1} needs to say what a good answer includes.`);
      else if (itemText.length > LIMITS.textChars) problems.push(`Question ${n}, line ${ii + 1} is too long. Keep it to ${LIMITS.textChars} characters.`);
      return { id: `q${n}${LETTERS[ii]}`, points: points ?? 0, text: itemText };
    });
    const qPoints = items.reduce((sum, item) => sum + item.points, 0);
    const rawCaps = Array.isArray(q.caps) ? q.caps : [];
    if (rawCaps.length > LIMITS.caps) problems.push(`Question ${n} has ${rawCaps.length} limits. Keep it to ${LIMITS.caps}.`);
    const caps = rawCaps.slice(0, LIMITS.caps).map((rawCap, ci) => {
      const cap = isRecord(rawCap) ? rawCap : {};
      const max = wholeNumber(cap.max);
      const capText = text(cap.text);
      if (!capText) problems.push(`Question ${n}, limit ${ci + 1} needs to say what answer it limits.`);
      if (max === null || max < 0 || max >= qPoints) problems.push(`Question ${n}, limit ${ci + 1} has to cap the score below the question's ${qPoints} points.`);
      return { id: `q${n}-cap${ci + 1}`, max: max ?? 0, text: capText };
    });
    return { id: `q${n}`, text: qText, points: qPoints, items, caps };
  });

  const total = questions.reduce((sum, q) => sum + q.points, 0);
  if (questions.length && total !== 100) problems.push(`The points add up to ${total}. They have to add up to 100, so the pass mark reads as a percentage.`);

  if (problems.length) return { ok: false, problems };
  return { ok: true, rubric: { course: slugOf(title), title, passMark: passMark!, questions } };
}
