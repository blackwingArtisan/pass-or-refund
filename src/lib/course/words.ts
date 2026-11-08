/** Plain words for the audit log and approval cards, so nobody reads a tool name. Browser safe. */

const TOOL: Record<string, string> = {
  capture_course_payment: "Take the course payment",
  check_refund_policy: "Check the refund policy",
  refund_course_purchase: "Refund the course",
  accept_dispute_claim: "Accept the learner's PayPal dispute",
};

const ACTION: Record<string, string> = {
  "tool.requested": "Asked to",
  "tool.denied": "Stopped by the Guard",
  "tool.replayed": "Asked again, not repeated",
  "tool.executed": "Done",
  "tool.failed": "Failed",
  "approval.requested": "Waiting for a person",
  "approval.approved": "Approved",
  "approval.denied": "Declined",
  "approval.expired": "Approval timed out",
  "review.settled": "Close grade settled",
  "attempt.wait_skipped": "Learner skipped the wait",
};

const ACTOR: Record<string, string> = {
  learner: "Learner",
  user: "Learner",
  you: "Course team",
  "course team": "Course team",
  webhook: "PayPal",
  PayPal: "PayPal",
  system: "The app",
  seed: "Sample data",
};

/** "refund_course_purchase" -> "Refund the course". Unknown names lose their underscores. */
export const toolWords = (name?: string) => (name ? (TOOL[name] ?? name.replace(/_/g, " ")) : "");

export const actionWords = (action: string) => ACTION[action] ?? action.replace(/[._]/g, " ");

/** "agent:refund-agent" -> "Refund agent (AI)". */
export function actorWords(actor: string): string {
  if (actor.startsWith("agent:")) {
    const name = actor.slice("agent:".length).replace(/-agent$/, "").replace(/-/g, " ");
    return `${name.charAt(0).toUpperCase()}${name.slice(1)} agent (AI)`;
  }
  return ACTOR[actor] ?? actor;
}
