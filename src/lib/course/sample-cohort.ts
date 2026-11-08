/**
 * Made-up learners for the dashboard, labelled "Sample cohort" wherever they show. They live in
 * their own collection, so they never reach the refund flow or the course team's list. Seeded by
 * `npm run seed`, `npm run seed:sandbox`, or the dashboard's first read. Scores come from the real
 * rubric and pass rule.
 */
import { isDecidedByFirstGrade, outcomeOfMedian } from "@/lib/grading/decide";
import { pointsFor, type ScoredItem } from "@/lib/grading/frozen/score-items";
import { collection } from "@/lib/store/collection";
import { COURSE_PRICE_CENTS, course, rubric } from "./content";
import type { Attempt, Enrollment, EnrollmentStatus } from "./types";

const LEARNERS = 36;
const DAY_MS = 24 * 60 * 60 * 1000;

/** How often a learner gets each item right. The weak spots are what the dashboard should find. */
const CHANCE_OF_MET: Record<string, number> = { q2d: 0.35, q3b: 0.4, q1b: 0.55, q4c: 0.6 };
const USUAL_CHANCE = 0.76;

export const sampleCohort = () => collection<Enrollment>("sample-cohort");

/** A small seeded generator (mulberry32), so every load gives the same cohort. */
function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sampleAttempt(number: number, submittedAt: string, skill: number, roll: () => number): Attempt {
  const items: ScoredItem[] = [];
  const perQuestion: Record<string, number> = {};
  for (const question of rubric.questions) {
    perQuestion[question.id] = 0;
    for (const item of question.items) {
      const chance = (CHANCE_OF_MET[item.id] ?? USUAL_CHANCE) * skill;
      const r = roll();
      const verdict = r < chance ? "met" : r < chance + 0.12 ? "partial" : "not_met";
      const points = pointsFor(verdict, item.points);
      perQuestion[question.id] += points;
      items.push({ id: item.id, verdict, points, quote: "", quoteFound: true });
    }
  }
  const score = Object.values(perQuestion).reduce((a, b) => a + b, 0);
  const outcome = outcomeOfMedian(score);
  const run = { total: score, totalQuoteChecked: score, perQuestion, items, caps: [], injectionAttempted: false, injectionQuote: "", mocked: true, costUsd: 0 };
  // A score from 66 to 73 took three grades under the real rule; the sample's is their middle one.
  const runs = isDecidedByFirstGrade(score) ? [run] : [run, run, run];
  return { number, submittedAt, answers: {}, reviewedStudyList: number > 1, outcome, score, runs, shownRun: 0, flagged: false, injectionQuote: "", costUsd: 0 };
}

function sampleEnrollment(index: number, now: number): Enrollment {
  const roll = random(index + 1);
  const createdAt = new Date(now - (LEARNERS - index) * DAY_MS).toISOString();
  const skill = 0.65 + roll() * 0.45;
  const attempts = [sampleAttempt(1, createdAt, skill, roll)];
  if (attempts[0].outcome === "fail") attempts.push(sampleAttempt(2, createdAt, skill * 1.1, roll));
  const last = attempts.at(-1)!;

  const status: EnrollmentStatus = last.outcome === "pass" ? "passed" : last.outcome === "review" ? "under_review" : attempts.length === 2 ? "refunded" : "active";
  const id = `sample_${index + 1}`;
  return {
    id,
    learnerName: `Sample learner ${index + 1}`,
    learnerEmail: `${id}@example.com`,
    courseSlug: course.slug,
    status,
    createdAt,
    priceCents: COURSE_PRICE_CENTS,
    attempts,
    refund:
      status === "refunded"
        ? { runId: id, requestedAt: createdAt, refundStatus: "COMPLETED", refundedCents: COURSE_PRICE_CENTS, proposal: { amountValue: "49.00", reasons: ["Both attempts complete and under the pass mark."], proposedAt: createdAt } }
        : undefined,
  };
}

/** The same 36 learners every time: only their dates move with `now`. */
export const sampleEnrollments = (now = Date.now()): Enrollment[] => Array.from({ length: LEARNERS }, (_, index) => sampleEnrollment(index, now));

export function seedSampleCohort(now = Date.now()): void {
  sampleCohort().replaceAll(sampleEnrollments(now));
}

/** The sample cohort, seeded on first read so the dashboard is never empty on a fresh deploy. */
export function readSampleCohort(): Enrollment[] {
  if (sampleCohort().list().length === 0) seedSampleCohort();
  return sampleCohort().list();
}
