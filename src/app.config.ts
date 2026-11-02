/**
 * APP-OWNED: identity, copy and policy for this app. scripts/new-app.sh rewrites the lines
 * marked `kit:` — keep those markers. Everything here is safe to show in the browser.
 */
import type { GuardPolicy } from "@/lib/agent/policy";
import { COURSE_PRICE_CENTS, CURRENCY } from "@/lib/course/content";
import { moneyFromMinor } from "@/lib/money";

export const appConfig = {
  name: "Pass or Refund", // kit:name
  slug: "pass-or-refund", // kit:slug
  brandColor: "#4338ca", // kit:brand
  brandForeground: "#FFFFFF", // kit:brand-foreground
  tagline: "Courses that pay you back if they can't teach you.",
  description: "An online course with a real guarantee: AI grades the final check, and failing it twice gets you a PayPal refund a person approved.",
  repoUrl: "",
  videoUrl: "",

  nav: [
    { label: "Course", href: "/course" },
    { label: "Course team", href: "/team" },
    { label: "Activity", href: "/activity" },
  ],

  landing: {
    eyebrow: "Built on PayPal + Claude",
    headline: "Pass the course, or get your money back.",
    subheadline:
      "Most course guarantees are small print. Here, AI grades your final check against a public rubric and shows its work. Fail twice and PayPal pays you back, after a person on the course team says yes.",
    primaryCta: { label: "See the course", href: "/course" },
    secondaryCta: { label: "How it works", href: "#how" },
    steps: [
      { title: "Buy with the guarantee in view", body: "The refund terms sit next to the pay button, not in a footer. PayPal takes the payment when you buy." },
      { title: "Get graded, point by point", body: "Four written questions. Claude marks every rubric item met, partial or missed and quotes your words. Code does the maths." },
      { title: "Pass, or get refunded", body: "Pass and you get a certificate. Fail twice and the refund goes to a person, then PayPal pays it. You see the refund id." },
    ],
    features: [
      { title: "Grading you can check", body: "Every point ties to a rubric item and a quote from your answer. What you missed becomes your study list." },
      { title: "A person approves every refund", body: "AI suggests, policy decides what's due, and no money moves until someone on the course team clicks approve." },
      { title: "Tricks earn nothing", body: "Telling the grader to give you full marks gets no credit, gets flagged and voids the guarantee." },
    ],
  },

  /** Guard policy for this app's agents (merged over DEFAULT_POLICY). */
  agentPolicy: {
    // The learner's own payment is at the threshold, so it isn't held up. Refunds always wait for a person.
    approvalThreshold: moneyFromMinor(COURSE_PRICE_CENTS, CURRENCY).value,
    requireApprovalFor: ["refund_course_purchase", "accept_dispute_claim"],
    maxPerAction: "500.00",
    maxPerDay: "2000.00",
  } satisfies Partial<GuardPolicy>,
};

export type AppConfig = typeof appConfig;
