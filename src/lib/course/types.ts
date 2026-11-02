/** Records and views shared by server and browser. Types only. */
import type { Outcome } from "@/lib/grading/decide";
import type { ModelCap, ScoredItem } from "@/lib/grading/frozen/score-items";

export type EnrollmentStatus = "unpaid" | "active" | "passed" | "under_review" | "refund_pending" | "refund_blocked" | "refunded";

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
}

export interface Payment {
  orderId: string;
  orderStatus?: string;
  captureId?: string;
  captureStatus?: string;
  capturedCents?: number;
  paidAt?: string;
}

export interface Refund {
  runId: string;
  requestedAt: string;
  /** Why the money did not move: a decline, a timeout or a PayPal error. */
  error?: string;
  refundId?: string;
  /** Re-read from PayPal after the refund, not taken from our own request. */
  refundStatus?: string;
  refundedCents?: number;
  captureStatus?: string;
  rereadAt?: string;
}

export interface Enrollment {
  id: string;
  learnerName: string;
  status: EnrollmentStatus;
  createdAt: string;
  priceCents: number;
  payment?: Payment;
  attempts: Attempt[];
  refund?: Refund;
}

export interface PendingApproval {
  id: string;
  summary: string;
  reason: string;
  amountValue?: string;
}

export interface EnrollmentView extends Enrollment {
  approval: PendingApproval | null;
  completedFails: number;
  guaranteeVoid: boolean;
}
