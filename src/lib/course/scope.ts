/**
 * What belongs to this course on a shared PayPal account: its orders, their captures, their
 * refunds and the disputes learners open on them. Authorizations, invoices and payouts come from
 * the starter kit's other demos, so the course's timelines and the webhook route leave them out.
 * Safe to import in the browser.
 */
const COURSE_EVENT = /^(CHECKOUT\.ORDER\.|PAYMENT\.CAPTURE\.|CUSTOMER\.DISPUTE\.)/;

export const isCourseEvent = (eventType: string) => COURSE_EVENT.test(eventType);

/**
 * Timeline channels. Each PayPal webhook goes to the course team, and to the one enrollment it
 * belongs to, so a learner sees their own payment's events and nobody else's.
 */
export const TEAM_CHANNEL = "team";
export const enrollmentChannel = (enrollmentId: string) => `enrollment:${enrollmentId}`;

/** Timeline steps worth showing to the course: this session's own steps, plus course webhooks. */
export const isCourseStep = (step: { channel?: string; kind: string; title: string }) =>
  step.kind === "webhook" ? isCourseEvent(step.title) || step.title === "Webhook rejected" : step.channel !== "global";
