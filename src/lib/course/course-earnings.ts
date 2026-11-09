/**
 * What a course earned, from PayPal's own records only. The app's ledger says which PayPal orders
 * were this course's; each one is read back with GET /v2/checkout/orders/{id}, and only the
 * captures and refunds PayPal returns, on an order whose invoice_id carries this course's rubric
 * fingerprint, are counted. No payouts: the money stays in the seller's PayPal account. Server only.
 */
import { getPayPal } from "@/lib/paypal";
import type { Order } from "@/lib/paypal/types";
import { toMinor } from "@/lib/money";
import { listEnrollments } from "./enrollments";
import { creatorCourse, creatorPriceCents } from "./creator-store";
import { course as sampleCourse, COURSE_PRICE_CENTS, rubric as sampleRubric } from "./content";
import { rubricFingerprint } from "./rubric-lock";

/** The most orders one card reads back. Newest first; the card says when it stopped short. */
export const EARNINGS_MAX_ORDERS = 25;
export const SAMPLE_COURSE_KEY = "sample";

export interface EarningsOrder {
  orderId: string;
  invoiceId?: string;
  /** Captured on this order, as PayPal reports it, in cents. */
  capturedCents: number;
  captureStatus?: string;
  refundedCents: number;
  refundStatus?: string;
}

export interface CourseEarnings {
  course: string;
  title: string;
  priceCents: number;
  fingerprint: string;
  /** Orders PayPal confirmed as paid for this course. */
  sales: number;
  /** Orders with a COMPLETED refund. */
  refunds: number;
  soldCents: number;
  refundedCents: number;
  netCents: number;
  /** refunds / sales, 0 with no sales. */
  refundRate: number;
  /** Refunds PayPal holds as PENDING: not counted in refunded yet. */
  pendingRefundCents: number;
  orders: EarningsOrder[];
  /** Orders in the ledger PayPal didn't return, or whose invoice_id isn't this course's. Left out. */
  leftOut: number;
  /** More orders than the card reads: the oldest are left out. */
  capped: boolean;
  calls: number;
  call: string;
  readAt: string;
}

/** Minor units of a PayPal amount, or 0. */
const cents = (amount?: { value: string; currency_code: string }) => (amount ? toMinor(amount.value, amount.currency_code) : 0);

/** The invoice_id every order for this course carries: PR-v<version>-<fingerprint>-<enrollment>. */
export const courseInvoiceMatch = (fingerprint: string) => new RegExp(`^PR-v[^-]+-${fingerprint}-`);

/** One order as PayPal returned it, reduced to its money. Captures and refunds are PayPal's, not ours. */
export function orderMoney(order: Order): EarningsOrder {
  const unit = order.purchase_units?.[0];
  const captures = unit?.payments?.captures ?? [];
  const refunds = unit?.payments?.refunds ?? [];
  const completed = refunds.filter((r) => r.status === "COMPLETED");
  return {
    orderId: order.id,
    invoiceId: unit?.invoice_id,
    capturedCents: captures.filter((c) => c.status === "COMPLETED" || c.status === "REFUNDED" || c.status === "PARTIALLY_REFUNDED").reduce((t, c) => t + cents(c.amount), 0),
    captureStatus: captures[0]?.status,
    refundedCents: completed.reduce((t, r) => t + cents(r.amount), 0),
    refundStatus: refunds.at(-1)?.status,
  };
}

/** Pure: adds up the orders PayPal returned for one course. */
export function sumEarnings(orders: (Order | null)[], fingerprint: string): Pick<CourseEarnings, "sales" | "refunds" | "soldCents" | "refundedCents" | "netCents" | "refundRate" | "pendingRefundCents" | "orders" | "leftOut"> {
  const match = courseInvoiceMatch(fingerprint);
  const read = orders.filter((o): o is Order => o !== null).map((o) => ({ o, m: orderMoney(o) }));
  const ours = read.filter(({ m }) => m.invoiceId !== undefined && match.test(m.invoiceId) && m.capturedCents > 0);
  const soldCents = ours.reduce((t, { m }) => t + m.capturedCents, 0);
  const refundedCents = ours.reduce((t, { m }) => t + m.refundedCents, 0);
  const refunds = ours.filter(({ m }) => m.refundedCents > 0).length;
  const pendingRefundCents = ours.reduce((t, { o }) => t + (o.purchase_units?.[0]?.payments?.refunds ?? []).filter((r) => r.status === "PENDING").reduce((s, r) => s + cents(r.amount), 0), 0);
  return {
    sales: ours.length,
    refunds,
    soldCents,
    refundedCents,
    netCents: soldCents - refundedCents,
    refundRate: ours.length ? refunds / ours.length : 0,
    pendingRefundCents,
    orders: ours.map(({ m }) => m),
    leftOut: orders.length - ours.length,
  };
}

function courseFacts(key: string) {
  if (key === SAMPLE_COURSE_KEY) return { title: sampleCourse.title, priceCents: COURSE_PRICE_CENTS, fingerprint: rubricFingerprint(sampleRubric), courseId: undefined };
  const own = creatorCourse(key);
  return { title: own.rubric.title, priceCents: creatorPriceCents(own), fingerprint: own.fingerprint, courseId: own.id };
}

/** The course's orders from the app's ledger of PayPal ids, read back from PayPal one GET each. */
export async function readCourseEarnings(key: string, opts: { includeTestRuns: boolean }): Promise<CourseEarnings> {
  const facts = courseFacts(key);
  const sold = listEnrollments({ includeTestRuns: opts.includeTestRuns }).filter((e) => (e.courseId ?? undefined) === facts.courseId && e.payment?.orderId && e.payment.captureId);
  const orderIds = sold.slice(0, EARNINGS_MAX_ORDERS).map((e) => e.payment!.orderId);
  const paypal = getPayPal();
  const orders: (Order | null)[] = [];
  // A few at a time, so a busy course doesn't trip PayPal's rate limit.
  for (let i = 0; i < orderIds.length; i += 5) orders.push(...(await Promise.all(orderIds.slice(i, i + 5).map((id) => paypal.orders.get(id).catch(() => null)))));
  return {
    course: key,
    title: facts.title,
    priceCents: facts.priceCents,
    fingerprint: facts.fingerprint,
    ...sumEarnings(orders, facts.fingerprint),
    capped: sold.length > EARNINGS_MAX_ORDERS,
    calls: orderIds.length,
    call: "GET /v2/checkout/orders/{id}",
    readAt: new Date().toISOString(),
  };
}
