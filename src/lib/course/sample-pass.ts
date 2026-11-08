/**
 * One made-up learner who passed, so a judge can see the certificate path without passing the
 * check themselves. Graded from the recorded verdicts for the strong sample answers, added up by
 * the sealed scoring code: no AI call and no PayPal objects. Labelled wherever it shows, and kept
 * off the course team's list and the cohort numbers. Server only.
 */
import { outcomeOfFirstGrade } from "@/lib/grading/decide";
import { answerAsShown, scoreItems } from "@/lib/grading/frozen/score-items";
import type { ChecklistGrade } from "@/lib/grading/frozen/schemas";
import verdicts from "@/lib/grading/mock-verdicts.json";
import { COURSE_PRICE_CENTS, course, rubric } from "./content";
import { enrollmentIfAny, saveEnrollment } from "./enrollments";
import { SAMPLE_PASS_ID } from "./sample-ids";
import { samples } from "./samples";
import type { Attempt, Enrollment } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

function passingAttempt(submittedAt: string): Attempt {
  const grade = (verdicts as Record<string, ChecklistGrade[]>).pass[0];
  const shown = Object.fromEntries(Object.entries(samples.pass).map(([id, answer]) => [id, answerAsShown(answer)]));
  const scored = scoreItems(rubric, shown, grade.items, grade.caps);
  const run = { total: scored.total, totalQuoteChecked: scored.totalQuoteChecked, perQuestion: scored.perQuestion, items: scored.items, caps: scored.caps, injectionAttempted: false, injectionQuote: "", mocked: true, costUsd: 0 };
  return { number: 1, submittedAt, answers: samples.pass, reviewedStudyList: true, outcome: outcomeOfFirstGrade(scored.total), score: scored.total, runs: [run], shownRun: 0, flagged: false, injectionQuote: "", costUsd: 0 };
}

/** The sample passing learner, made on first use. */
export function ensureSamplePass(now = Date.now()): Enrollment {
  const existing = enrollmentIfAny(SAMPLE_PASS_ID);
  if (existing) return existing;
  const createdAt = new Date(now - 3 * DAY_MS).toISOString();
  return saveEnrollment({
    id: SAMPLE_PASS_ID,
    learnerName: "Mara Lind",
    learnerEmail: `${SAMPLE_PASS_ID}@example.com`,
    courseSlug: course.slug,
    status: "passed",
    createdAt,
    priceCents: COURSE_PRICE_CENTS,
    attempts: [passingAttempt(new Date(now - 2 * DAY_MS).toISOString())],
  });
}
