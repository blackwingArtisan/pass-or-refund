import { ArrowUpRight } from "lucide-react";
import { SAMPLE_PASS_ID } from "@/lib/course/sample-ids";

/**
 * The impact case, from round4/research/pass-or-refund.md. Every figure links to the page it came
 * from. Buyer accounts are anecdotes: they show a pattern recurs, not how often.
 */
const HEADLINE = {
  text: "A coding school advertised job placement of up to 86%. A US regulator found it was closer to half.",
  source: { label: "CFPB on BloomTech, 17 Apr 2024", href: "https://www.consumerfinance.gov/about-us/newsroom/cfpb-takes-action-against-coding-boot-camp-bloomtech-and-ceo-austen-allred-for-deceiving-students-and-hiding-loan-costs/" },
};

const PAINS = [
  {
    title: "The seller is the only judge",
    evidence: "A $5,997 course buyer asked for the guaranteed refund: “it was quickly DENIED”.",
    source: { label: "Trustpilot, Sep 2026", href: "https://www.trustpilot.com/review/replaceyouruniversity.com" },
    answer: "The refund rule is code, and every point quotes the learner's own answer.",
  },
  {
    title: "Refund requests stall",
    evidence: "“The refund process turned into an 11-month ordeal”, under a policy that said no questions asked.",
    source: { label: "Trustpilot, Nov 2025", href: "https://ca.trustpilot.com/review/pappsmastery.com" },
    answer: "Two fails put the refund in front of a person. PayPal pays it, and the learner sees the refund id.",
  },
  {
    title: "Terms move after you pay",
    evidence: "A $199 course launched with no refund policy. A 14-day window appeared about four weeks later.",
    source: { label: "The Register, Sep 2019", href: "https://www.theregister.com/2019/09/27/youtube_ai_star" },
    answer: "The rubric's version and fingerprint lock at purchase and print on the receipt.",
  },
  {
    title: "Good creators can't prove it",
    evidence: "A creator with only a handful of refunds still offers them because “I don't wanna be called a scam”.",
    source: { label: "Chaotic Creator, Mar 2026", href: "https://chaotic-creator.beehiiv.com/p/course-creation-mistakes-that-cost-me-20k" },
    answer: "The cohort page shows pass rates, refunds and the lines learners miss, before anyone buys.",
  },
];

function Source({ label, href }: { label: string; href: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-xs font-medium text-zinc-500 underline decoration-zinc-300 underline-offset-2 hover:text-zinc-800">
      {label}
      <ArrowUpRight className="size-3" aria-hidden />
    </a>
  );
}

/** The research headline as one line above the product, with its source. */
export function StoryEyebrow() {
  return (
    <p data-testid="story-headline" className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm leading-snug text-zinc-600">
      <span>
        <span className="font-semibold text-zinc-900">Why it matters:</span> a coding school advertised job placement of up to 86%. A US regulator found it was closer to half.
      </span>
      <a href={HEADLINE.source.href} target="_blank" rel="noreferrer" data-testid="story-source" className="inline-flex items-center gap-0.5 text-xs font-medium text-zinc-500 underline decoration-zinc-300 underline-offset-2 hover:text-zinc-800">
        {HEADLINE.source.label}
        <ArrowUpRight className="size-3" aria-hidden />
      </a>
    </p>
  );
}

/** The buyer evidence, below the product: what goes wrong today, and what this app does about it. */
export function Story() {
  return (
    <section id="why" data-testid="story" className="border-t border-zinc-200/70 bg-zinc-50 py-10">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <p className="text-sm font-semibold uppercase tracking-wider text-brand">Why it matters</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">Course promises are hard to check before you pay</h2>
        <p className="mt-3 max-w-3xl text-zinc-600">
          Buyers say refunds get denied, stalled or re-ruled after they ask. Pass or Refund makes the promise testable: a public rubric, a graded final check, and two fails send a real PayPal refund to a person for approval.
        </p>
        <ul data-testid="story-pains" className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {PAINS.map((pain) => (
            <li key={pain.title} className="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-4 text-zinc-900">
              <p className="font-semibold">{pain.title}</p>
              <p className="text-sm text-zinc-600">
                {pain.evidence} <Source {...pain.source} />
              </p>
              <p className="mt-auto border-t border-zinc-100 pt-2 text-sm text-zinc-800">{pain.answer}</p>
            </li>
          ))}
        </ul>
        <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500">
          <span>Buyer accounts are single reviews: they show the pattern recurs, not how often.</span>
          <a href={`/learn/${SAMPLE_PASS_ID}`} data-testid="sample-pass-link" className="font-medium text-brand underline underline-offset-2">
            See what passing looks like: a sample learner&rsquo;s certificate
          </a>
        </p>
      </div>
    </section>
  );
}
