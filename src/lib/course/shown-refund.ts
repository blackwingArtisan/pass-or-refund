/**
 * A refund this app really paid, read back from PayPal's sandbox after a test run on 9 Nov 2026:
 * two failed final checks, a person's approval on /team, then POST /v2/payments/captures/{id}/refund.
 * The note is PayPal's note_to_payer on that refund, as PayPal returned it.
 */
export const SHOWN_REFUND = {
  id: "4UD1730725427671R",
  orderId: "3B616040ST1440937",
  amount: "$49.00",
  invoiceId: "PR-v1-ada21f9fbe03-en_020ff237",
  note: "Guarantee refund, rubric v1 ada21f9fbe03: scored 34 and 52, pass mark 70. Sorry we let you down.",
};
