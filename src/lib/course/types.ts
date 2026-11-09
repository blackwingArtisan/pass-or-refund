/** Records and views shared by server and browser. Types only. */
import type { Outcome } from "@/lib/grading/decide";
import type { ModelCap, Rubric, ScoredItem } from "@/lib/grading/frozen/score-items";
import type { Overdue } from "./overdue";

export type EnrollmentStatus = "unpaid" | "active" | "passed" | "under_review" | "refund_pending" | "refund_review" | "refund_declined" | "refund_blocked" | "refunded";

export interface GradeRun {
  total: number;
  /** Audit signal only: credit where the quote is found word for word. The decision uses total. */
  totalQuoteChecked: number;
  perQuestion: Record<string, number>;
  items: ScoredItem[];
  caps: ModelCap[];
  injectionAttempted: boolean;
  injectionQuote: string;
  mocked: boolean;
  model?: string;
  costUsd: number;
}

export interface GradedAttempt {
  outcome: Outcome;
  score: number;
  /** One grade, or three when the first landed in the band. */
  runs: GradeRun[];
  /** The grade shown to the learner: its total is the score. */
  shownRun: number;
  flagged: boolean;
  injectionQuote: string;
  costUsd: number;
}

export interface Attempt extends GradedAttempt {
  number: number;
  submittedAt: string;
  answers: Record<string, string>;
  /** The learner marked the study list from the attempt before as reviewed. */
  reviewedStudyList: boolean;
  /** The earlier attempt this one nearly copies. It's graded, but it can't count toward a refund. */
  nearCopyOf?: number;
  /** The questions this attempt was asked. Missing on the sample course, whose four questions they are. */
  questionIds?: string[];
  /** A person decided a 69-70 attempt. `outcome` holds their decision, and the score stays as graded. */
  settled?: ReviewDecision;
}

export interface ReviewDecision {
  outcome: "pass" | "fail";
  by: string;
  at: string;
  note: string;
  /** The rubric items the person went through, one by one, before deciding. */
  checkedItems: string[];
}

/** The rubric a purchase is graded against, fixed the moment the learner bought. */
export interface RubricLock {
  version: string;
  /** The first 12 hex characters of the rubric's SHA-256. Any edit to the rubric changes it. */
  fingerprint: string;
  lockedAt: string;
}

/** A learner's one challenge to a rubric line, made before their retake. */
export interface Contest {
  attempt: number;
  itemId: string;
  /** Why the learner thinks the line was marked wrong. */
  note: string;
  at: string;
  /** Taking the retake first withdraws a contest nobody has ruled on yet. */
  withdrawnAt?: string;
  ruling?: ContestRuling;
  /** Claude's recommendation to the person ruling. It never changes the grade by itself. */
  secondReader?: ContestRecommendation;
}

/** The second reader's recommendation on a contest: uphold or let the grade stand, one reason, both sides quoted. */
export interface ContestRecommendation {
  recommendation?: "uphold" | "stand";
  reason?: string;
  /** From the learner's note, checked by code to be in it. Empty when the model's quote wasn't. */
  learnerQuote?: string;
  /** From the learner's answer, checked by code to be in it. */
  answerQuote?: string;
  graderQuote: string;
  model?: string;
  mocked?: boolean;
  /** Set instead of a recommendation when the model couldn't read the contest. */
  error?: string;
  at: string;
}

export interface ContestRuling {
  /** Upheld: the line counts as met, and code rescores the attempt. */
  upheld: boolean;
  note: string;
  by: string;
  at: string;
  scoreBefore: number;
  scoreAfter: number;
  /** What the second reader had recommended when the person ruled, if it had. The ruling is the person's either way. */
  readerRecommended?: "uphold" | "stand";
}

export interface Payment {
  orderId: string;
  orderStatus?: string;
  /** When PayPal's PAYMENT.CAPTURE.COMPLETED webhook reached us for this payment. */
  webhookAt?: string;
  captureId?: string;
  captureStatus?: string;
  capturedCents?: number;
  paidAt?: string;
  /** PayPal's id for the buyer's account. Guest card payments don't have one. */
  payerId?: string;
  /** The email PayPal has for the buyer, wallet or guest. The server-side test card has none. */
  payerEmail?: string;
  /** PayPal had the money before our record did, and the record was rebuilt from PayPal. */
  recovered?: boolean;
}

/** What the refund agent asked for. The amount that moves is computed from PayPal, not from this. */
export interface RefundProposal {
  amountValue: string;
  reasons: string[];
  proposedAt: string;
  /** Written by the refund agent from the lines the learner fell short on: what the learner reads. */
  learnerNote?: string;
  /** Written by the refund agent for the person deciding, shown on the approval card. */
  teamSummary?: string;
}

/** The refund agent asked a person to look before any refund is proposed: a contested or borderline case. */
export interface RefundReview {
  reason: string;
  teamSummary: string;
  learnerNote: string;
  at: string;
  /** What the person did: sent it on to the approval gate, or declined it. */
  decision?: "propose" | "decline";
  decidedBy?: string;
  decidedAt?: string;
  note?: string;
}

export interface Refund {
  /** The agent run that proposed this refund. */
  runId: string;
  requestedAt: string;
  proposal?: RefundProposal;
  /** Why the money did not move: a timeout, a refusal in code or a PayPal error. */
  error?: string;
  /** Set when a person declined at the Guard's approval step. */
  declinedAt?: string;
  declinedBy?: string;
  declineNote?: string;
  refundId?: string;
  /** PayPal-Debug-Id of the refund call: PayPal's own reference for it, shown on the refund card. */
  debugId?: string;
  /** Re-read from PayPal after the refund, not taken from our own request. */
  refundStatus?: string;
  /** PayPal's reason when the refund is PENDING. ECHECK: it is being paid from the seller's bank. */
  refundStatusReason?: string;
  /** Set when code built the proposal because the AI agent couldn't. Says why. */
  proposedWithoutAi?: string;
  refundedCents?: number;
  /** The note_to_payer on PayPal's refund, as PayPal reads it back: what PayPal told the learner. */
  paypalNote?: string;
  /** The invoice_id on PayPal's refund, read back: the rubric fingerprint the purchase locked. */
  paypalInvoiceId?: string;
  captureStatus?: string;
  rereadAt?: string;
  /** When PayPal's PAYMENT.CAPTURE.REFUNDED webhook reached us, and the status it carried. */
  webhookAt?: string;
  webhookStatus?: string;
  /** Paid by accepting the learner's PayPal dispute, not by a refund call. */
  viaDispute?: string;
  /** Set when the agent sent the case to a person first. */
  review?: RefundReview;
  /** When the approval ran out with nobody on the course team deciding. Shown as overdue until someone acts. */
  overdueSince?: string;
}

/** A PayPal dispute the learner opened on this payment (CUSTOMER.DISPUTE.* webhooks). */
export interface CourseDispute {
  id: string;
  reason: string;
  status: string;
  amountCents: number;
  openedAt: string;
  updatedAt: string;
  /** PayPal's outcome once resolved, e.g. RESOLVED_BUYER_FAVOUR. */
  outcome?: string;
  /** What the course does about it, in plain words for the team. */
  note?: string;
}

export interface Enrollment {
  id: string;
  learnerName: string;
  learnerEmail: string;
  /** Held by the buyer's browser in an HttpOnly cookie (learner-access.ts): only it and the course team read the name and answers. Never shown. */
  ownerKey?: string;
  courseSlug: string;
  status: EnrollmentStatus;
  createdAt: string;
  priceCents: number;
  payment?: Payment;
  attempts: Attempt[];
  /** The attempt whose study list the learner marked as reviewed. */
  reviewedAttempt?: number;
  /** Study list items ticked off so far, for the latest attempt. */
  studyTicks?: string[];
  /** The attempt after which the learner chose to skip the wait. */
  gapSkippedAfter?: number;
  refund?: Refund;
  dispute?: CourseDispute;
  /** Bought by a browser test suite. Kept off the course team's list unless the viewer is a test run too. */
  testRun?: boolean;
  /** Missing only on enrollments made before rubrics were locked: those use version 1. */
  rubric?: RubricLock;
  /** Set when this is a creator's own course (cc_<fingerprint>) rather than the sample course. */
  courseId?: string;
  contest?: Contest;
}

export interface PendingApproval {
  id: string;
  summary: string;
  reason: string;
  amountValue?: string;
}

export interface RuleCheck {
  rule: "two_completed_fails" | "no_injection" | "one_refund_per_learner";
  passed: boolean;
  detail: string;
}

export interface GuaranteeDecision {
  due: boolean;
  checks: RuleCheck[];
}

/** What the API sends. The learner's email stays on the server. */
/** What anyone with an enrollment id may read: where the purchase stands and the scores, without the learner's name or words. */
export interface LimitedEnrollmentView {
  id: string;
  limited: true;
  status: EnrollmentStatus;
  courseId?: string;
  attempts: { number: number; score: number; outcome: Outcome; flagged: boolean }[];
}

export interface EnrollmentView extends Omit<Enrollment, "learnerEmail" | "ownerKey"> {
  approval: PendingApproval | null;
  completedFails: number;
  guaranteeVoid: boolean;
  guarantee: GuaranteeDecision;
  /** When the next attempt opens, or null if it's open now. */
  nextAttemptAt: string | null;
  /** Set when the course team has taken longer than the guarantee allows. */
  overdue: Overdue | null;
  /** A creator's own course: what the learner's screens show instead of the sample course. */
  creatorCourse?: { id: string; path: string; title: string; rubric: Rubric };
}
