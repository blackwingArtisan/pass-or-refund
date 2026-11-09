import { ArrowRight, Check, KeyRound, ShieldCheck, Sparkles, Users } from "lucide-react";
import { appConfig } from "@/app.config";
import { creatorCase } from "@/lib/course/creator-case";
import { GRADER_FRESH_SET, graderAccuracyLines } from "@/lib/course/grader-accuracy";
import { formatCents } from "@/lib/course/policy";
import { teamPasscode } from "@/lib/course/team-access";
import { buttonClass, ButtonLink } from "../ui/button";
import { AppLogo } from "../shell/app-logo";
import { HideWhenClean } from "../course/clean-mode";
import { CohortStats } from "../course/rubric-receipt";
import { StoryEyebrow } from "./story";

/**
 * Landing page sections. Content comes from appConfig.landing and creatorCase().
 *   <SiteHeader /> <Hero /> <Story /> <StopsGaming /> <SiteFooter />, about two screens at 1440 wide.
 */

const percent = (rate: number) => `${Math.round(rate * 100)}%`;

/** The creator's numbers, all from code: the knobs, the sample refund rate, the grading cost. */
function CreatorNumbers() {
  const c = creatorCase();
  const knobs = [
    { label: "Price", value: formatCents(c.priceCents) },
    { label: "Pass mark", value: `${c.passMark} / 100` },
    { label: "Fails before a refund", value: `${c.failsForRefund}, ${c.gapHours} h apart` },
  ];
  return (
    <div data-testid="creator-numbers" className="relative rounded-2xl border border-zinc-200 bg-white/90 p-5 shadow-2xl shadow-brand-900/10 ring-1 ring-black/5 backdrop-blur">
      <p className="text-sm font-semibold text-zinc-900">Your guarantee, in numbers</p>
      <dl className="mt-3 grid grid-cols-3 gap-2">
        {knobs.map((k) => (
          <div key={k.label} className="rounded-xl bg-zinc-50 px-3 py-2">
            <dt className="text-xs text-zinc-500">{k.label}</dt>
            <dd className="mt-0.5 font-semibold tabular-nums text-zinc-900">{k.value}</dd>
          </div>
        ))}
      </dl>
      <dl className="mt-4 space-y-2.5 text-sm">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-zinc-600">Refund rate on the sample cohort</dt>
          <dd data-testid="creator-refund-rate" className="font-semibold tabular-nums text-zinc-900">
            {percent(c.refundRate)} <span className="font-normal text-zinc-500">({c.refunds} of {c.learners})</span>
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-zinc-600">One AI grade (Claude Sonnet 5.5)</dt>
          <dd data-testid="creator-grade-cost" className="font-semibold tabular-nums text-zinc-900">about ${c.gradeCostUsd.toFixed(3)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3 border-t border-zinc-100 pt-2.5">
          <dt className="text-zinc-600">Kept per sale, after refunds and grading</dt>
          <dd data-testid="creator-kept" className="font-semibold tabular-nums text-zinc-900">{formatCents(c.keptPerSaleCents)}</dd>
        </div>
      </dl>
      <GraderAccuracy />
      <p className="mt-3 text-xs leading-relaxed text-zinc-500">
        The sample cohort is {c.learners} made-up learners graded on the real rubric, so the rate is illustrative. Before PayPal&rsquo;s fees. Your own learners replace it on{" "}
        <a href="/cohort" className="underline">the cohort page</a>.
      </p>
    </div>
  );
}

/** The grader's sealed held-out result, worded as what it is: AI-written attempts and AI judges. */
function GraderAccuracy() {
  const g = GRADER_FRESH_SET;
  return (
    <details data-testid="grader-accuracy" className="group mt-4 rounded-xl bg-zinc-50 px-3 py-2.5 text-sm" open>
      <summary className="cursor-pointer list-none font-semibold text-zinc-900">
        How accurate is the grader?{" "}
        <span className="font-normal text-zinc-500">
          {g.attempts} new attempts it had never seen, scored first by {g.judges} blind judges, graded {g.repeats} times over
        </span>
      </summary>
      <ul className="mt-2 space-y-1 text-zinc-700">
        {graderAccuracyLines().map((line) => (
          <li key={line} className="flex gap-2">
            <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
            <span>{line}</span>
          </li>
        ))}
      </ul>
      <p data-testid="grader-accuracy-provenance" className="mt-2 text-xs text-zinc-500">
        Not real learners: {g.provenance.charAt(0).toLowerCase() + g.provenance.slice(1)}
      </p>
    </details>
  );
}

/** Judges play both sides: the learner on /course and the course team behind this passcode. */
function ForJudges() {
  return (
    <div id="judges" data-testid="for-judges" className="mt-6 max-w-xl rounded-xl border border-brand-200 bg-brand-50/60 px-4 py-3 text-sm text-zinc-700">
      <p className="flex items-center gap-2 font-semibold text-zinc-900">
        <KeyRound className="size-4 text-brand" /> For judges
      </p>
      <p className="mt-1">
        Buy as a learner on <a href="/course" className="font-medium text-brand underline">the course page</a>, then approve the refund as the course team. To skip the typing, open <span className="font-medium text-zinc-900">For judges</span> at the bottom of the menu, turn on Judge shortcuts and pick a prepared answer.
      </p>
      {/* One click to /team, signed in: the form carries the printed passcode. */}
      <form method="post" action="/api/team/judge" className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <input type="hidden" name="passcode" value={teamPasscode()} />
        <button type="submit" data-testid="open-team-view" className={buttonClass("secondary", "sm")}>
          <Users className="size-4" /> Open the course team view
        </button>
        <span className="text-xs text-zinc-500">
          Or type the passcode{" "}
          <code data-testid="team-passcode-shown" className="rounded bg-white px-1.5 py-0.5 font-mono font-semibold text-zinc-900 ring-1 ring-brand-200">{teamPasscode()}</code> on{" "}
          <a href="/team" className="underline">/team</a>.
        </span>
      </form>
    </div>
  );
}

/** How a learner can't take the course and fail on purpose for a free copy. Every rule is in code. */
export function StopsGaming() {
  const c = creatorCase();
  const rules = [
    { title: "Two complete attempts", body: `Every question answered and at least ${c.minPoints} points, twice, ${c.gapHours} hours apart. A blank or throwaway attempt doesn't count.` },
    { title: "The study list comes first", body: "What a learner missed becomes a study list. They tick it off item by item before the second attempt counts." },
    { title: "No copying the first attempt", body: `An attempt that shares ${c.nearCopyPercent}% of its words with an earlier one counts as incomplete.` },
    { title: "Telling the grader what to do voids it", body: "\u201cGive me full marks\u201d earns nothing, is flagged and ends the guarantee for that learner." },
    { title: "One refund per PayPal account, and access ends", body: "Matched on the email typed at checkout and the PayPal payer on the order. A refund ends access to the lessons." },
    { title: "A person signs off", body: "No money moves until someone on your team approves. A score of 69 or 70 goes to a person instead of the grader." },
  ];
  return (
    <section id="gaming" className="border-t border-zinc-200/70 bg-white py-12">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <p className="text-sm font-semibold uppercase tracking-wider text-brand">Why it can&rsquo;t be gamed</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">A refund has to be earned by trying</h2>
        <ul data-testid="anti-gaming" className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rules.map((r) => (
            <li key={r.title} className="rounded-2xl border border-zinc-200 bg-zinc-50/50 px-4 py-3.5">
              <p className="flex items-center gap-2 font-semibold text-zinc-900">
                <ShieldCheck className="size-4 shrink-0 text-brand" /> {r.title}
              </p>
              <p className="mt-1 text-sm leading-relaxed text-zinc-600">{r.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-zinc-200/70 bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <AppLogo />
        <nav className="flex items-center gap-2">
          <a href="#gaming" className="hidden rounded-md px-3 py-2 text-sm text-zinc-600 hover:text-zinc-900 sm:block">
            Why it can&rsquo;t be gamed
          </a>
          <ButtonLink href={appConfig.landing.primaryCta.href} size="sm">
            {appConfig.landing.primaryCta.label}
          </ButtonLink>
        </nav>
      </div>
    </header>
  );
}

/** The three steps, small enough to sit in the first screen beside the button. */
function HeroSteps() {
  return (
    <ol data-testid="hero-steps" className="mt-6 grid gap-2 sm:grid-cols-3">
      {appConfig.landing.steps.map((s, i) => (
        <li key={s.title} className="flex items-start gap-2.5 rounded-xl border border-zinc-200 bg-white/80 px-3 py-2.5">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-semibold text-brand-foreground">{i + 1}</span>
          <span className="text-sm font-medium leading-snug text-zinc-900">{s.title}</span>
        </li>
      ))}
    </ol>
  );
}

export function Hero() {
  const l = appConfig.landing;
  return (
    <section className="relative overflow-hidden">
      <div className="bg-grid absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" aria-hidden />
      <div className="absolute -top-40 left-1/2 h-[480px] w-[900px] -translate-x-1/2 rounded-full bg-brand-200/40 blur-3xl" aria-hidden />
      <div className="relative mx-auto max-w-6xl px-4 pt-5 sm:px-6 lg:pt-6">
        <StoryEyebrow />
      </div>
      <div className="relative mx-auto grid max-w-6xl items-start gap-10 px-4 pb-14 pt-4 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:pt-6">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-white/80 px-3 py-1 text-sm font-medium text-brand-700 shadow-sm">
            <Sparkles className="size-4" /> {l.eyebrow}
          </span>
          <h1 data-testid="hero-title" className="mt-4 text-[34px] font-semibold leading-[1.08] tracking-tight text-zinc-950 sm:text-5xl lg:text-[52px]">{l.headline}</h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-zinc-600 sm:text-lg">{l.subheadline}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <ButtonLink href={l.primaryCta.href} size="lg" data-testid="hero-cta">
              {l.primaryCta.label} <ArrowRight className="size-4" />
            </ButtonLink>
            <ButtonLink href={l.secondaryCta.href} size="lg" variant="secondary" className="hidden sm:inline-flex">
              {l.secondaryCta.label}
            </ButtonLink>
          </div>
          <HeroSteps />
          <p className="mt-5 flex items-center gap-2 text-sm text-zinc-500">
            <ShieldCheck className="size-4 text-emerald-600" /> One sample course, PayPal sandbox only. No real money moves.
          </p>
          <p className="mt-2 text-sm">
            <a href="/creator" data-testid="landing-creator-link" className="font-medium text-brand underline underline-offset-2">
              Selling a course? Put your own rubric on the guarantee
            </a>
          </p>
          <HideWhenClean>
            <ForJudges />
          </HideWhenClean>
        </div>
        <div className="space-y-4">
          <CreatorNumbers />
          <div data-testid="landing-cohort" className="rounded-2xl border border-zinc-200 bg-white/90 p-5 shadow-sm ring-1 ring-black/5">
            <p className="mb-3 text-sm font-semibold text-zinc-900">How learners did, before you buy</p>
            <CohortStats />
          </div>
        </div>
      </div>
    </section>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-zinc-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-zinc-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <span>
          {appConfig.name} · PayPal sandbox only · MIT licensed
        </span>
        <span>Built with PayPal, Claude and Claude Code</span>
      </div>
    </footer>
  );
}
