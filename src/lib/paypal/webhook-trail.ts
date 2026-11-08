/**
 * The last webhook deliveries this server saw, and what it did with each: rejected, ignored as
 * another app's, a repeat, or handled (and for a course webhook, which enrollment it settled).
 * In memory, so it starts empty on each deploy. Ids and event types only: no payer details.
 */
import { singleton } from "../singleton";

export type WebhookOutcome = "rejected" | "invalid" | "other-app" | "duplicate" | "handled" | "failed";

export interface WebhookDelivery {
  at: string;
  eventId?: string;
  eventType?: string;
  /** The PayPal object the event is about, and the capture above it for a refund. */
  resourceId?: string;
  captureId?: string;
  outcome: WebhookOutcome;
  enrollmentId?: string;
  detail?: string;
}

const MAX = 300;
const trail = () => singleton("paypal:webhook-trail", () => [] as WebhookDelivery[]);

export function noteDelivery(entry: Omit<WebhookDelivery, "at">) {
  const list = trail();
  list.push({ at: new Date().toISOString(), ...entry });
  if (list.length > MAX) list.splice(0, list.length - MAX);
}

/** Newest first. */
export const webhookTrail = (): WebhookDelivery[] => [...trail()].reverse();
