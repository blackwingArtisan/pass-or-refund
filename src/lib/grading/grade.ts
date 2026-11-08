/**
 * Grades one attempt with the sealed method: Sonnet gives verdicts, code does the arithmetic, and
 * the band in decide.ts turns totals into an outcome. Server only.
 */
import { generateObject } from "@/lib/ai";
import { modelLabel } from "@/lib/ai/config";
import { rubric as published } from "@/lib/course/content";
import type { GradeRun, GradedAttempt } from "@/lib/course/types";
import { isDecidedByFirstGrade, medianOfThree, outcomeOfFirstGrade, outcomeOfMedian } from "./decide";
import { ChecklistGrade } from "./frozen/schemas";
import { answerAsShown, scoreItems, type Answers, type Rubric } from "./frozen/score-items";
import { mockGrade } from "./mock";
import { graderSystemPrompt, graderUserPrompt } from "./prompt";

/** FROZEN.md: kit role "smart", kit defaults otherwise, maxTokens 4000. */
const GRADER = { model: "smart", maxTokens: 4000 } as const;

/** One grade. `rubric` is the version the learner bought (or a creator's own), `course` its course text; the method is the same for every rubric. */
export type GradeOnce = (answers: Answers, run: number, label: string, rubric?: Rubric, course?: string) => Promise<GradeRun>;

export const gradeOnce: GradeOnce = async (answers, run, label, rubric = published, course) => {
  const { data, mocked, model, costUsd } = await generateObject({
    ...GRADER,
    schema: ChecklistGrade,
    system: graderSystemPrompt(rubric, course),
    prompt: graderUserPrompt(answers, rubric),
    feature: `Grade ${label}, grade ${run + 1}`,
    mock: () => mockGrade(answers, run, rubric),
  });
  const shown: Answers = Object.fromEntries(Object.entries(answers).map(([id, answer]) => [id, answerAsShown(answer)]));
  const { total, totalQuoteChecked, perQuestion, items, caps } = scoreItems(rubric, shown, data.items, data.caps);
  return {
    total,
    totalQuoteChecked,
    perQuestion,
    items,
    caps,
    injectionAttempted: data.injection_attempted,
    injectionQuote: data.injection_quote,
    mocked,
    model: model ? modelLabel(model) : undefined,
    costUsd,
  };
};

export async function gradeAttempt(answers: Answers, label: string, grade: GradeOnce = gradeOnce, rubric: Rubric = published, course?: string): Promise<GradedAttempt> {
  const first = await grade(answers, 0, label, rubric, course);
  const inBand = !isDecidedByFirstGrade(first.total);
  const runs = inBand ? [first, ...(await Promise.all([grade(answers, 1, label, rubric, course), grade(answers, 2, label, rubric, course)]))] : [first];

  const score = inBand ? medianOfThree([runs[0].total, runs[1].total, runs[2].total]) : first.total;
  const outcome = inBand ? outcomeOfMedian(score) : outcomeOfFirstGrade(score);
  const flaggedRun = runs.find((r) => r.injectionAttempted);
  return {
    outcome,
    score,
    runs,
    shownRun: runs.findIndex((r) => r.total === score),
    flagged: Boolean(flaggedRun),
    injectionQuote: flaggedRun?.injectionQuote ?? "",
    costUsd: runs.reduce((sum, r) => sum + r.costUsd, 0),
  };
}
