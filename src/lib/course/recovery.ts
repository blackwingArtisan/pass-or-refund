/** Brings one record up to date with PayPal when someone looks at it. PayPal is the record of the money. */
import { getPayPal } from "@/lib/paypal";
import { recoverRefund, withSettledRefund } from "./enrollments";
import { recoverPayment } from "./purchase";
import type { Enrollment } from "./types";

export async function caughtUpWithPayPal(enrollment: Enrollment): Promise<Enrollment> {
  const paid = await recoverPayment(enrollment);
  const refunded = await recoverRefund(paid, getPayPal()).catch(() => paid);
  return withSettledRefund(refunded);
}
