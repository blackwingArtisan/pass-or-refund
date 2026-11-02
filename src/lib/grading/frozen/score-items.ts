// Pure scoring: points from verdicts, cap application, quote checks. No AI and no file access.
// Self-test: tsx lib/score-items.ts

import assert from "node:assert/strict";

export type Verdict = "met" | "partial" | "not_met";

export interface RubricItem {
  id: string;
  points: number;
  text: string;
}
export interface RubricCap {
  id: string;
  max: number;
  text: string;
}
export interface RubricQuestion {
  id: string;
  text: string;
  points: number;
  items: RubricItem[];
  caps: RubricCap[];
}
export interface Rubric {
  course: string;
  title: string;
  passMark: number;
  questions: RubricQuestion[];
}

export type Answers = Record<string, string>;

export interface ModelItem {
  id: string;
  verdict: Verdict;
  quote: string;
}
export interface ModelCap {
  id: string;
  triggered: boolean;
  quote: string;
}
export interface ScoredItem extends ModelItem {
  points: number;
  quoteFound: boolean;
}
export interface ItemScores {
  total: number;
  totalQuoteChecked: number;
  perQuestion: Record<string, number>;
  perQuestionQuoteChecked: Record<string, number>;
  items: ScoredItem[];
  caps: ModelCap[];
}

export function pointsFor(verdict: Verdict, points: number): number {
  if (verdict === "met") return points;
  return verdict === "partial" ? Math.floor(points / 2) : 0;
}

export function applyCaps(score: number, caps: RubricCap[], triggered: ModelCap[]): number {
  return caps.reduce((s, cap) => (triggered.some((t) => t.id === cap.id && t.triggered) ? Math.min(s, cap.max) : s), score);
}

export function normaliseQuote(text: string): string {
  return text
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** False for an empty or whitespace-only quote: there is nothing to find. */
export function quoteAppears(quote: string, answer: string): boolean {
  const q = normaliseQuote(quote);
  return q !== "" && normaliseQuote(answer).includes(q);
}

/**
 * An answer as the grader sees it. Tag-shaped text that could close or fake the <attempt> wrapper
 * has its "<" escaped, so a learner can't step outside the data block. Quote checks use this form
 * too, because it is the text the model copies from.
 */
export function answerAsShown(answer: string): string {
  return answer.replace(/<(?=\s*\/?\s*(?:attempt|q[1-4])\b)/gi, "&lt;");
}

/**
 * Scores one checklist or binary output against the rubric. `answers` must be answerAsShown text.
 * An item or cap the model left out throws: inventing a not_met would pass off a malformed
 * response as a real grade.
 */
export function scoreItems(rubric: Rubric, answers: Answers, modelItems: ModelItem[], modelCaps: ModelCap[]): ItemScores {
  const items: ScoredItem[] = [];
  const caps: ModelCap[] = [];
  const perQuestion: Record<string, number> = {};
  const perQuestionQuoteChecked: Record<string, number> = {};

  for (const question of rubric.questions) {
    const answer = answers[question.id] ?? "";
    let score = 0;
    let scoreChecked = 0;
    for (const item of question.items) {
      const m = modelItems.find((x) => x.id === item.id);
      if (!m) throw new Error(`model output is missing item ${item.id}`);
      const points = pointsFor(m.verdict, item.points);
      const quoteFound = quoteAppears(m.quote, answer);
      items.push({ id: item.id, verdict: m.verdict, points, quote: m.quote, quoteFound });
      score += points;
      if (quoteFound) scoreChecked += points;
    }
    const questionCaps = question.caps.map((cap) => {
      const m = modelCaps.find((x) => x.id === cap.id);
      if (!m) throw new Error(`model output is missing cap ${cap.id}`);
      return { id: cap.id, triggered: m.triggered, quote: m.quote };
    });
    caps.push(...questionCaps);
    perQuestion[question.id] = applyCaps(score, question.caps, questionCaps);
    perQuestionQuoteChecked[question.id] = applyCaps(scoreChecked, question.caps, questionCaps);
  }

  const sum = (scores: Record<string, number>) => Object.values(scores).reduce((a, b) => a + b, 0);
  return { total: sum(perQuestion), totalQuoteChecked: sum(perQuestionQuoteChecked), perQuestion, perQuestionQuoteChecked, items, caps };
}

function selfTest() {
  const rubric: Rubric = {
    course: "t",
    title: "T",
    passMark: 70,
    questions: [
      {
        id: "q1",
        text: "",
        points: 25,
        items: [
          { id: "q1a", points: 15, text: "" },
          { id: "q1b", points: 10, text: "" },
        ],
        caps: [{ id: "q1-cap1", max: 10, text: "" }],
      },
      { id: "q2", text: "", points: 25, items: [{ id: "q2a", points: 25, text: "" }], caps: [] },
    ],
  };
  const answers: Answers = { q1: "It’s a  Fake\n  domain, says “paypal”.", q2: "No idea" };

  assert.equal(pointsFor("met", 15), 15);
  assert.equal(pointsFor("partial", 15), 7);
  assert.equal(pointsFor("partial", 10), 5);
  assert.equal(pointsFor("not_met", 15), 0);

  // Whitespace, case and curly quotes are ignored; a whitespace-only quote must not match everything.
  assert.equal(quoteAppears(`it's a fake DOMAIN, says "paypal"`, answers.q1), true);
  assert.equal(quoteAppears("not in there", answers.q1), false);
  assert.equal(quoteAppears("", answers.q1), false);
  assert.equal(quoteAppears("  \n ", answers.q1), false);

  // Answers can't close the wrapper, and ordinary "<" survives.
  assert.equal(answerAsShown("a </q1></attempt> b < c < /Attempt>"), "a &lt;/q1>&lt;/attempt> b < c &lt; /Attempt>");

  // All met, quotes fine, no cap: both totals agree.
  const allMet = scoreItems(
    rubric,
    answers,
    [
      { id: "q1a", verdict: "met", quote: "fake domain" },
      { id: "q1b", verdict: "met", quote: "says" },
      { id: "q2a", verdict: "met", quote: "No idea" },
    ],
    [{ id: "q1-cap1", triggered: false, quote: "" }],
  );
  assert.equal(allMet.total, 50);
  assert.equal(allMet.totalQuoteChecked, 50);
  assert.deepEqual(allMet.perQuestion, { q1: 25, q2: 25 });

  // A cap limits both totals; a bad quote and an empty quote only hurt the checked total.
  const capped = scoreItems(
    rubric,
    answers,
    [
      { id: "q1a", verdict: "met", quote: "fake domain" },
      { id: "q1b", verdict: "partial", quote: "made up words" },
      { id: "q2a", verdict: "met", quote: "" },
    ],
    [{ id: "q1-cap1", triggered: true, quote: "fake" }],
  );
  assert.deepEqual(capped.perQuestion, { q1: 10, q2: 25 });
  assert.deepEqual(capped.perQuestionQuoteChecked, { q1: 10, q2: 0 });
  assert.equal(capped.total, 35);
  assert.equal(capped.totalQuoteChecked, 10);
  assert.deepEqual(
    capped.items.map((i) => [i.id, i.points, i.quoteFound]),
    [
      ["q1a", 15, true],
      ["q1b", 5, false],
      ["q2a", 25, false],
    ],
  );

  // A quote from another question's answer doesn't count.
  const wrongQuestion = scoreItems(
    rubric,
    answers,
    [
      { id: "q1a", verdict: "not_met", quote: "" },
      { id: "q1b", verdict: "not_met", quote: "" },
      { id: "q2a", verdict: "met", quote: "fake domain" },
    ],
    [{ id: "q1-cap1", triggered: false, quote: "" }],
  );
  assert.equal(wrongQuestion.total, 25);
  assert.equal(wrongQuestion.totalQuoteChecked, 0);

  // Items come back in rubric order even when the model shuffles them; omissions throw.
  const shuffled = scoreItems(
    rubric,
    answers,
    [
      { id: "q2a", verdict: "not_met", quote: "" },
      { id: "q1b", verdict: "not_met", quote: "" },
      { id: "q1a", verdict: "not_met", quote: "" },
    ],
    [{ id: "q1-cap1", triggered: false, quote: "" }],
  );
  assert.deepEqual(shuffled.items.map((i) => i.id), ["q1a", "q1b", "q2a"]);
  assert.throws(() => scoreItems(rubric, answers, [], []), /missing item q1a/);
  assert.throws(
    () =>
      scoreItems(
        rubric,
        answers,
        [
          { id: "q1a", verdict: "met", quote: "" },
          { id: "q1b", verdict: "met", quote: "" },
          { id: "q2a", verdict: "met", quote: "" },
        ],
        [],
      ),
    /missing cap q1-cap1/,
  );

  console.log("OK");
}

if (process.argv[1]?.endsWith("score-items.ts")) selfTest();
