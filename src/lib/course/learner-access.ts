/**
 * Who may read a learner's record in full. A learner's name and answers go only to the browser that
 * bought (it holds the enrollment's owner key in an HttpOnly cookie, set when the purchase starts)
 * and to the course team (the passcode cookie). Anyone else who has the enrollment id gets its status
 * and scores. The sample learners are made up and stay public. Server only.
 *
 *   learnerCookie(req, enrollment)   // the Set-Cookie on the response that starts a purchase
 *   viewFor(req, enrollment)         // the full view, or status and scores
 *   requireLearnerAction(req, id)    // 403 unless it's the learner's browser or the team
 */
import { randomBytes, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { HttpError } from "@/lib/http";
import { requireEnrollment, saveEnrollment, viewEnrollment } from "./enrollments";
import { isSampleId } from "./sample-ids";
import { isTeam } from "./team-access";
import type { Enrollment, EnrollmentView, LimitedEnrollmentView } from "./types";

export const LEARNER_COOKIE = "por_learner";
/** One browser can buy more than once; the newest purchases are kept. */
const MAX_PURCHASES = 20;
const YEAR = 60 * 60 * 24 * 365;

export const newOwnerKey = () => randomBytes(16).toString("hex");

/** "en_1a2b3c4d.<key> en_5e6f7a8b.<key>", newest first. */
function entries(cookie: string | undefined): [string, string][] {
  return (cookie ?? "")
    .split(/[\s+]+/)
    .map((pair) => pair.split(".") as [string, string])
    .filter(([id, key]) => /^en_[A-Za-z0-9_-]+$/.test(id ?? "") && /^[0-9a-f]{32}$/.test(key ?? ""));
}

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** The browser that bought this enrollment. */
export function ownsEnrollment(req: NextRequest, enrollment: Pick<Enrollment, "id" | "ownerKey">): boolean {
  const key = enrollment.ownerKey;
  return Boolean(key && entries(req.cookies.get(LEARNER_COOKIE)?.value).some(([id, held]) => id === enrollment.id && same(held, key)));
}

export function canSeeLearner(req: NextRequest, enrollment: Pick<Enrollment, "id" | "ownerKey">): boolean {
  return isSampleId(enrollment.id) || isTeam(req) || ownsEnrollment(req, enrollment);
}

/** Refuses the request unless it comes from the learner's own browser or the course team. */
export function requireLearnerOrTeam(req: NextRequest, enrollment: Pick<Enrollment, "id" | "ownerKey">): void {
  if (!canSeeLearner(req, enrollment)) throw new HttpError(403, "Only the learner's own browser, the one that bought the course, or the course team can see this.", "not_your_enrollment");
}

/** For the learner's own actions (an attempt, a contest, the study list, skipping the wait): their browser or the course team. */
export function requireLearnerAction(req: NextRequest, id: string): void {
  requireLearnerOrTeam(req, requireEnrollment(id));
}

/** The Set-Cookie value that adds this purchase to the browser's own list. */
export function learnerCookie(req: NextRequest, enrollment: Pick<Enrollment, "id" | "ownerKey">): string | null {
  if (!enrollment.ownerKey) return null;
  const kept = entries(req.cookies.get(LEARNER_COOKIE)?.value).filter(([id]) => id !== enrollment.id);
  const value = [[enrollment.id, enrollment.ownerKey], ...kept]
    .slice(0, MAX_PURCHASES)
    .map((pair) => pair.join("."))
    .join("+");
  const secure = req.nextUrl.protocol === "https:" || req.headers.get("x-forwarded-proto") === "https";
  return `${LEARNER_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${YEAR}${secure ? "; Secure" : ""}`;
}

export function limitedView(view: Pick<EnrollmentView, "id" | "status" | "courseId" | "attempts">): LimitedEnrollmentView {
  return { id: view.id, limited: true, status: view.status, courseId: view.courseId, attempts: view.attempts.map((a) => ({ number: a.number, score: a.score, outcome: a.outcome, flagged: a.flagged })) };
}

/** The view this request may have: in full for the learner's own browser and the team, else status and scores. */
export function viewFor(req: NextRequest, enrollment: Enrollment): EnrollmentView | LimitedEnrollmentView {
  const view = viewEnrollment(enrollment);
  return canSeeLearner(req, enrollment) ? view : limitedView(view);
}

/** A purchase from before owner keys gets one, so the browser carrying on with it can own it. */
export function withOwnerKey(enrollment: Enrollment): Enrollment {
  return enrollment.ownerKey ? enrollment : saveEnrollment({ ...enrollment, ownerKey: newOwnerKey() });
}
