/**
 * What belongs to this course on a shared PayPal account: its orders, their captures and their
 * refunds. Authorizations, invoices, payouts and disputes come from the starter kit's other demos,
 * so the course team's timeline and the webhook route leave them out. Safe to import in the browser.
 */
const COURSE_EVENT = /^(CHECKOUT\.ORDER\.|PAYMENT\.CAPTURE\.)/;

export const isCourseEvent = (eventType: string) => COURSE_EVENT.test(eventType);

/** Timeline steps worth showing to the course: this session's own steps, plus course webhooks. */
export const isCourseStep = (step: { channel?: string; kind: string; title: string }) =>
  step.kind === "webhook" ? isCourseEvent(step.title) || step.title === "Webhook rejected" : step.channel !== "global";
