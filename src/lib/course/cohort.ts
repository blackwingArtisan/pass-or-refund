/**
 * What a course creator reads: results across every learner, built from real attempts and
 * PayPal-confirmed refunds. Row-level sources feed AG Studio, and the rollups feed the plain grid,
 * so both views show the same numbers. No names or email addresses leave this file.
 */
import { formatCents } from "./policy";
import { course, lessonForItem, lessons, rubric } from "./content";
import type { Attempt, Enrollment, EnrollmentStatus, Refund } from "./types";

/** Getting this share of a question's points clears it: the same 70% the whole check asks for. */
export const QUESTION_CLEAR_SHARE = course.passMark / 100;

const QUESTION_NAMES: Record<string, string> = {
  q1: "Q1 Honing or sharpening",
  q2: "Q2 Setting up to sharpen",
  q3: "Q3 Reading the burr",
  q4: "Q4 Keeping the edge",
};

const OUTCOME_NAMES = { pass: "Passed", fail: "Failed", review: "Under review" } as const;
const VERDICT_NAMES = { met: "Met", partial: "Partial", not_met: "Missed" } as const;

const REFUND_STATES: Partial<Record<EnrollmentStatus, string>> = {
  refund_pending: "Waiting for a person",
  refund_declined: "Declined",
  refund_blocked: "Blocked",
  refunded: "Refunded",
};

/** One learner on one course. 0/1 columns so an average reads as a rate in AG Studio. */
export interface LearnerRow {
  id: string;
  course: string;
  lastResult: string;
  attempts: number;
  bestScore: number;
  passed: number;
  refunded: number;
  refundedUsd: number;
}

export interface AttemptRow {
  id: string;
  course: string;
  attempt: number;
  outcome: string;
  score: number;
  passed: number;
  flagged: number;
  submittedAt: string;
}

export interface QuestionRow {
  id: string;
  course: string;
  attempt: number;
  question: string;
  points: number;
  maxPoints: number;
  cleared: number;
}

export interface ItemRow {
  id: string;
  course: string;
  attempt: number;
  question: string;
  itemId: string;
  item: string;
  lesson: string;
  verdict: string;
  /** 1 when the learner fell short of the item: partial or missed. */
  missed: number;
  pointsLost: number;
}

export interface RefundRow {
  id: string;
  course: string;
  state: string;
  amountUsd: number;
  paypalStatus: string;
  reason: string;
  requestedAt: string;
}

export interface CourseSummary {
  course: string;
  learners: number;
  passed: number;
  passRate: number;
  attempts: number;
  refunds: number;
  refundedUsd: number;
}

export interface QuestionSummary {
  question: string;
  answered: number;
  cleared: number;
  passRate: number;
  averagePoints: number;
  maxPoints: number;
}

export interface ItemSummary {
  itemId: string;
  item: string;
  question: string;
  lesson: string;
  answered: number;
  met: number;
  partial: number;
  notMet: number;
  missRate: number;
  pointsLost: number;
}

export interface Cohort {
  /** Paid learners, including those who haven't taken the check yet. */
  paidLearners: number;
  /** Attempts left out of the question and rubric numbers because they tried to trick the grader. */
  flaggedAttempts: number;
  sources: { learners: LearnerRow[]; attempts: AttemptRow[]; questions: QuestionRow[]; items: ItemRow[]; refunds: RefundRow[] };
  courses: CourseSummary[];
  questions: QuestionSummary[];
  items: ItemSummary[];
}

/** The rubric text learners can see, without the note to the grader that follows it. */
const itemName = (text: string) => text.split(". ")[0].replace(/\.$/, "");

const ITEMS = rubric.questions.flatMap((question) => question.items.map((item) => ({ ...item, questionId: question.id })));

function lessonName(itemId: string): string {
  const lesson = lessons.find((l) => l.number === lessonForItem[itemId]);
  return lesson ? `${lesson.number}. ${lesson.name}` : "";
}

const ratio = (part: number, whole: number) => (whole ? part / whole : 0);
const dollars = (cents = 0) => cents / 100;
const countWhere = <T,>(rows: T[], test: (row: T) => boolean) => rows.filter(test).length;
const sum = <T,>(rows: T[], value: (row: T) => number) => rows.reduce((total, row) => total + value(row), 0);

/** The money that left, as PayPal reported it. A refund that didn't pay out counts for nothing. */
const paidOutUsd = (enrollment: Enrollment) => (enrollment.status === "refunded" ? dollars(enrollment.refund?.refundedCents) : 0);

const courseName = (enrollment: Enrollment) => (enrollment.courseSlug === course.slug ? course.title : enrollment.courseSlug);

function attemptRow(enrollment: Enrollment, attempt: Attempt): AttemptRow {
  return {
    id: `${enrollment.id}-${attempt.number}`,
    course: courseName(enrollment),
    attempt: attempt.number,
    outcome: OUTCOME_NAMES[attempt.outcome],
    score: attempt.score,
    passed: attempt.outcome === "pass" ? 1 : 0,
    flagged: attempt.flagged ? 1 : 0,
    submittedAt: attempt.submittedAt,
  };
}

function questionRows(enrollment: Enrollment, attempt: Attempt): QuestionRow[] {
  const run = attempt.runs[attempt.shownRun];
  return rubric.questions.map((question) => {
    const points = run.perQuestion[question.id] ?? 0;
    return {
      id: `${enrollment.id}-${attempt.number}-${question.id}`,
      course: courseName(enrollment),
      attempt: attempt.number,
      question: QUESTION_NAMES[question.id] ?? question.id,
      points,
      maxPoints: question.points,
      cleared: points >= question.points * QUESTION_CLEAR_SHARE ? 1 : 0,
    };
  });
}

function itemRows(enrollment: Enrollment, attempt: Attempt): ItemRow[] {
  const run = attempt.runs[attempt.shownRun];
  return ITEMS.flatMap((item) => {
    const scored = run.items.find((i) => i.id === item.id);
    if (!scored) return [];
    return [
      {
        id: `${enrollment.id}-${attempt.number}-${item.id}`,
        course: courseName(enrollment),
        attempt: attempt.number,
        question: QUESTION_NAMES[item.questionId] ?? item.questionId,
        itemId: item.id,
        item: itemName(item.text),
        lesson: lessonName(item.id),
        verdict: VERDICT_NAMES[scored.verdict],
        missed: scored.verdict === "met" ? 0 : 1,
        pointsLost: item.points - scored.points,
      },
    ];
  });
}

function refundRow(enrollment: Enrollment, refund: Refund): RefundRow {
  return {
    id: enrollment.id,
    course: courseName(enrollment),
    state: REFUND_STATES[enrollment.status] ?? enrollment.status,
    amountUsd: paidOutUsd(enrollment),
    paypalStatus: refund.refundStatus ?? "No refund at PayPal",
    reason: refund.declineNote ?? refund.error ?? refund.proposal?.reasons[0] ?? "",
    requestedAt: refund.requestedAt,
  };
}

function summariseCourses(learners: LearnerRow[], attempts: AttemptRow[]): CourseSummary[] {
  return [...new Set(learners.map((l) => l.course))].map((name) => {
    const own = learners.filter((l) => l.course === name);
    const passed = sum(own, (l) => l.passed);
    return {
      course: name,
      learners: own.length,
      passed,
      passRate: ratio(passed, own.length),
      attempts: countWhere(attempts, (a) => a.course === name),
      refunds: sum(own, (l) => l.refunded),
      refundedUsd: sum(own, (l) => l.refundedUsd),
    };
  });
}

function summariseQuestions(rows: QuestionRow[]): QuestionSummary[] {
  return rubric.questions.map((question) => {
    const name = QUESTION_NAMES[question.id] ?? question.id;
    const own = rows.filter((r) => r.question === name);
    const cleared = sum(own, (r) => r.cleared);
    return {
      question: name,
      answered: own.length,
      cleared,
      passRate: ratio(cleared, own.length),
      averagePoints: ratio(sum(own, (r) => r.points), own.length),
      maxPoints: question.points,
    };
  });
}

/** Most missed first, and by the points it cost when two items tie. */
function summariseItems(rows: ItemRow[]): ItemSummary[] {
  return ITEMS.map((item) => {
    const own = rows.filter((r) => r.itemId === item.id);
    return {
      itemId: item.id,
      item: itemName(item.text),
      question: QUESTION_NAMES[item.questionId] ?? item.questionId,
      lesson: lessonName(item.id),
      answered: own.length,
      met: countWhere(own, (r) => r.verdict === VERDICT_NAMES.met),
      partial: countWhere(own, (r) => r.verdict === VERDICT_NAMES.partial),
      notMet: countWhere(own, (r) => r.verdict === VERDICT_NAMES.not_met),
      missRate: ratio(sum(own, (r) => r.missed), own.length),
      pointsLost: sum(own, (r) => r.pointsLost),
    };
  }).sort((a, b) => b.missRate - a.missRate || b.pointsLost - a.pointsLost);
}

export function buildCohort(enrollments: Enrollment[]): Cohort {
  const paid = enrollments.filter((e) => e.status !== "unpaid");
  const tested = paid.filter((e) => e.attempts.length > 0);

  const learners: LearnerRow[] = tested.map((enrollment) => ({
    id: enrollment.id,
    course: courseName(enrollment),
    lastResult: OUTCOME_NAMES[enrollment.attempts.at(-1)!.outcome],
    attempts: enrollment.attempts.length,
    bestScore: Math.max(...enrollment.attempts.map((a) => a.score)),
    passed: enrollment.status === "passed" ? 1 : 0,
    refunded: enrollment.status === "refunded" ? 1 : 0,
    refundedUsd: paidOutUsd(enrollment),
  }));

  const pairs = tested.flatMap((enrollment) => enrollment.attempts.map((attempt) => ({ enrollment, attempt })));
  // A trick attempt says nothing about what the course teaches.
  const honest = pairs.filter(({ attempt }) => !attempt.flagged);
  const attempts = pairs.map(({ enrollment, attempt }) => attemptRow(enrollment, attempt));
  const questions = honest.flatMap(({ enrollment, attempt }) => questionRows(enrollment, attempt));
  const items = honest.flatMap(({ enrollment, attempt }) => itemRows(enrollment, attempt));
  const refunds = paid.flatMap((enrollment) => (enrollment.refund ? [refundRow(enrollment, enrollment.refund)] : []));

  return {
    paidLearners: paid.length,
    flaggedAttempts: pairs.length - honest.length,
    sources: { learners, attempts, questions, items, refunds },
    courses: summariseCourses(learners, attempts),
    questions: summariseQuestions(questions),
    items: summariseItems(items),
  };
}

export const formatUsd = (usd: number) => formatCents(Math.round(usd * 100));
