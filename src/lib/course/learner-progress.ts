/**
 * The learner page's three steps, Buy, Take the test, Pass or refund, and which one the learner is
 * on. Read from the enrollment alone, so the strip says what the rest of the page says. Safe in the browser.
 */
import { formatCents } from "./policy";
import type { EnrollmentView } from "./types";

export type StepState = "done" | "current" | "todo";
export interface ProgressStep {
  id: "buy" | "test" | "result";
  label: string;
  state: StepState;
  /** One short line: what happened, or what happens next. */
  detail: string;
}

type Progress = Pick<EnrollmentView, "status" | "attempts" | "payment" | "refund" | "nextAttemptAt">;

const scores = (attempts: Progress["attempts"]) => attempts.map((a) => a.score).join(", then ");

function testDetail(p: Progress, passMark: number): string {
  if (p.attempts.length === 0) return `Pass mark ${passMark} of 100`;
  const tried = `${p.attempts.length === 1 ? "Try 1" : "Tries"}: ${scores(p.attempts)}`;
  if (p.status !== "active") return tried;
  return p.nextAttemptAt ? `${tried}. Next try after the study list` : `${tried}. Try ${p.attempts.length + 1} is open`;
}

function resultStep(p: Progress): Omit<ProgressStep, "id" | "label"> {
  const refunded = p.refund?.refundedCents ?? p.payment?.capturedCents;
  switch (p.status) {
    case "passed":
      return { state: "done", detail: "Passed: your certificate is below" };
    case "refunded":
      return { state: "done", detail: refunded === undefined ? "Refunded through PayPal" : `Refunded: ${formatCents(refunded)} back through PayPal` };
    case "refund_pending":
      return { state: "current", detail: "Refund earned: waiting for a person to approve" };
    case "refund_review":
      return { state: "current", detail: "A person is looking at your case" };
    case "under_review":
      return { state: "current", detail: "Right at the pass mark: a person reviews it" };
    case "refund_declined":
      return { state: "current", detail: "The course team declined the refund" };
    case "refund_blocked":
      return { state: "current", detail: "The refund hasn't gone through yet" };
    default:
      return { state: "todo", detail: "Pass, or fail twice honestly and get your money back" };
  }
}

export function learnerProgress(p: Progress, passMark: number): ProgressStep[] {
  const paid = p.status !== "unpaid";
  const price = p.payment?.capturedCents;
  return [
    { id: "buy", label: "Buy", state: paid ? "done" : "current", detail: paid ? (price === undefined ? "Enrolled" : `${formatCents(price)} paid through PayPal`) : "Not paid yet: PayPal hasn't taken any money" },
    { id: "test", label: "Take the test", state: !paid ? "todo" : p.status === "active" ? "current" : "done", detail: paid ? testDetail(p, passMark) : `Pass mark ${passMark} of 100` },
    { id: "result", label: "Pass or refund", ...resultStep(p) },
  ];
}
