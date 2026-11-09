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
  repoUrl: "https://github.com/blackwingArtisan/pass-or-refund",
  videoUrl: "", // TODO: the submitted demo video link

  nav: [
    { label: "Course", href: "/course" },
    { label: "Course team", href: "/team" },
    { label: "Cohort results", href: "/cohort" },
    { label: "Activity", href: "/activity" },
    { label: "Your own course", href: "/creator" },
  ],

  landing: {
    eyebrow: "For online course creators",
    headline: "Sell your course with a guarantee that pays out.",
    subheadline: "Your buyers have been burned by small print. Make the refund rule public: two failed final checks, graded by Claude on your rubric, and PayPal pays them back once you approve.",
    primaryCta: { label: "Try it as a learner", href: "/course" },
    secondaryCta: { label: "See the sample cohort", href: "/cohort" },
    steps: [
      { title: "Buy with the guarantee in view", body: "The refund terms sit next to the pay button, not in a footer. PayPal takes the payment when you buy." },
      { title: "Get graded, point by point", body: "Four written questions. Claude marks every rubric item met, partial or missed and quotes your words. Code does the maths." },
      { title: "Pass, or get refunded", body: "Pass and you get a certificate. Fail twice and the refund goes to a person, then PayPal pays it. You see the refund id." },
    ],
    features: [
      { title: "Grading you can check", body: "Every point ties to a rubric item and a quote from your answer. What you missed becomes your study list." },
      { title: "A person approves every refund", body: "AI suggests, policy decides what's due, and no money moves until someone on the course team clicks approve." },
      { title: "Know which lesson to fix", body: "The cohort page shows the rubric items learners miss most and the lesson that teaches each one, with no names attached." },
    ],
  },

  /** Guard policy for this app's agents (merged over DEFAULT_POLICY). */
  agentPolicy: {
    // The learner's own payment is at the threshold, so it isn't held up. Refunds always wait for a person.
    approvalThreshold: moneyFromMinor(COURSE_PRICE_CENTS, CURRENCY).value,
    requireApprovalFor: ["refund_course_purchase", "accept_dispute_claim"],
    maxPerAction: "500.00",
    // The browser suites buy more courses in a day than this, so their own server lifts it (AGENT_MAX_PER_DAY).
    maxPerDay: process.env.AGENT_MAX_PER_DAY || "2000.00",
    // A proposal can wait for a person this long. It dies with the process either way.
    approvalTimeoutMs: 60 * 60 * 1000,
  } satisfies Partial<GuardPolicy>,
};

export type AppConfig = typeof appConfig;
