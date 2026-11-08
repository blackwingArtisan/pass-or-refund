/** Records and views shared by server and browser. Types only. */
import type { Outcome } from "@/lib/grading/decide";
import type { ModelCap, ScoredItem } from "@/lib/grading/frozen/score-items";

export type EnrollmentStatus = "unpaid" | "active" | "passed" | "under_review" | "refund_pending" | "refund_declined" | "refund_blocked" | "refunded";

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
  /** Re-read from PayPal after the refund, not taken from our own request. */
  refundStatus?: string;
  /** PayPal's reason when the refund is PENDING. ECHECK: it is being paid from the seller's bank. */
  refundStatusReason?: string;
  /** Set when code built the proposal because the AI agent couldn't. Says why. */
  proposedWithoutAi?: string;
  refundedCents?: number;
  captureStatus?: string;
  rereadAt?: string;
  /** When PayPal's PAYMENT.CAPTURE.REFUNDED webhook reached us, and the status it carried. */
  webhookAt?: string;
  webhookStatus?: string;
  /** Paid by accepting the learner's PayPal dispute, not by a refund call. */
  viaDispute?: string;
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

export interface EnrollmentView extends Enrollment {
  approval: PendingApproval | null;
  completedFails: number;
  guaranteeVoid: boolean;
  guarantee: GuaranteeDecision;
  /** When the next attempt opens, or null if it's open now. */
  nextAttemptAt: string | null;
}
