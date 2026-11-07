import { ArrowRight, Check, ShieldCheck, Sparkles } from "lucide-react";
import { appConfig } from "@/app.config";
import { COURSE_PRICE_CENTS } from "@/lib/course/content";
import { creatorCase } from "@/lib/course/creator-case";
import { formatCents } from "@/lib/course/policy";
import { ButtonLink } from "../ui/button";
import { AppLogo } from "../shell/app-logo";

/**
 * Landing page sections. Content comes from appConfig.landing and creatorCase().
 *   <SiteHeader /> <Hero /> <StopsGaming /> <HowItWorks /> <Features /> <CtaBand /> <SiteFooter />
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
      <p className="mt-3 text-xs leading-relaxed text-zinc-500">
        The sample cohort is {c.learners} made-up learners graded on the real rubric, so the rate is illustrative. Before PayPal&rsquo;s fees. Your own learners replace it on{" "}
        <a href="/cohort" className="underline">the cohort page</a>.
      </p>
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
    { title: "One refund per learner, and access ends", body: "Matched on the email and the PayPal account that paid. A refund ends access to the lessons." },
    { title: "A person signs off", body: "No money moves until someone on your team approves. A score of 69 or 70 goes to a person instead of the grader." },
  ];
  return (
    <section id="gaming" className="border-t border-zinc-200/70 bg-white py-16">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <p className="text-sm font-semibold uppercase tracking-wider text-brand">Why it can&rsquo;t be gamed</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">A refund has to be earned by trying</h2>
        <ul data-testid="anti-gaming" className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rules.map((r) => (
            <li key={r.title} className="rounded-2xl border border-zinc-200 bg-zinc-50/50 p-5">
              <p className="flex items-center gap-2 font-semibold text-zinc-900">
                <ShieldCheck className="size-4 shrink-0 text-brand" /> {r.title}
              </p>
              <p className="mt-1.5 text-[15px] leading-relaxed text-zinc-600">{r.body}</p>
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
          <a href="#how" className="hidden rounded-md px-3 py-2 text-sm text-zinc-600 hover:text-zinc-900 sm:block">
            How it works
          </a>
          <ButtonLink href={appConfig.landing.primaryCta.href} size="sm">
            {appConfig.landing.primaryCta.label}
          </ButtonLink>
        </nav>
      </div>
    </header>
  );
}

/** The moment the product exists for, with the amount from the one price constant. */
function RefundPreview() {
  const rows = [
    { verdict: "Met", tone: "bg-emerald-50 text-emerald-700", item: "Says honing pushes a rolled edge back", quote: "lines the edge back up" },
    { verdict: "Partial", tone: "bg-amber-50 text-amber-700", item: "Says when the stone is ready", quote: "Soak the stone for a while" },
    { verdict: "Missed", tone: "bg-red-50 text-red-700", item: "Burr must run heel to tip", quote: null },
  ];
  return (
    <div className="relative rounded-2xl border border-zinc-200 bg-white/90 p-5 shadow-2xl shadow-brand-900/10 ring-1 ring-black/5 backdrop-blur">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-sm font-semibold text-zinc-900">Second attempt</span>
        <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">Not passed</span>
      </div>
      <ol className="space-y-2">
        {rows.map((r) => (
          <li key={r.item} className="rounded-xl border border-zinc-100 bg-zinc-50/60 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-sm font-medium text-zinc-900">{r.item}</p>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${r.tone}`}>{r.verdict}</span>
            </div>
            <p className="truncate text-xs text-zinc-500">{r.quote ? `\u201c${r.quote}\u201d` : "Added to your study list"}</p>
          </li>
        ))}
      </ol>
      <div className="mt-4 flex items-start gap-3 rounded-xl bg-brand-50 px-4 py-3">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-brand" />
        <div>
          <p className="font-semibold text-zinc-900">Refund issued, sorry we let you down</p>
          <p className="text-sm text-zinc-600">{formatCents(COURSE_PRICE_CENTS)} back through PayPal, approved by a person.</p>
        </div>
      </div>
    </div>
  );
}

export function Hero() {
  const l = appConfig.landing;
  return (
    <section className="relative overflow-hidden">
      <div className="bg-grid absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" aria-hidden />
      <div className="absolute -top-40 left-1/2 h-[480px] w-[900px] -translate-x-1/2 rounded-full bg-brand-200/40 blur-3xl" aria-hidden />
      <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-12 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:pt-16">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-white/80 px-3 py-1 text-sm font-medium text-brand-700 shadow-sm">
            <Sparkles className="size-4" /> {l.eyebrow}
          </span>
          <h1 className="mt-6 text-4xl font-semibold leading-[1.08] tracking-tight text-zinc-950 sm:text-5xl lg:text-[56px]">{l.headline}</h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-zinc-600">{l.subheadline}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink href={l.primaryCta.href} size="lg">
              {l.primaryCta.label} <ArrowRight className="size-4" />
            </ButtonLink>
            <ButtonLink href={l.secondaryCta.href} size="lg" variant="secondary">
              {l.secondaryCta.label}
            </ButtonLink>
          </div>
          <p className="mt-6 flex items-center gap-2 text-sm text-zinc-500">
            <ShieldCheck className="size-4 text-emerald-600" /> One sample course, PayPal sandbox only. No real money moves.
          </p>
        </div>
        <CreatorNumbers />
      </div>
    </section>
  );
}

export function HowItWorks() {
  return (
    <section id="how" className="border-y border-zinc-200/70 bg-white py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <p className="text-sm font-semibold uppercase tracking-wider text-brand">What your learner sees</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">From payment to pass or refund</h2>
        <div className="mt-10 grid items-start gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div className="grid gap-4">
            {appConfig.landing.steps.map((s, i) => (
              <div key={s.title} className="relative flex gap-4 rounded-2xl border border-zinc-200 bg-zinc-50/50 p-5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-semibold text-brand-foreground">{i + 1}</span>
                <div>
                  <h3 className="text-lg font-semibold text-zinc-900">{s.title}</h3>
                  <p className="mt-1 text-[15px] leading-relaxed text-zinc-600">{s.body}</p>
                </div>
              </div>
            ))}
          </div>
          <RefundPreview />
        </div>
      </div>
    </section>
  );
}

export function Features() {
  return (
    <section className="py-20">
      <div className="mx-auto grid max-w-6xl gap-6 px-4 sm:px-6 md:grid-cols-3">
        {appConfig.landing.features.map((f) => (
          <div key={f.title} className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <Check className="size-5 text-brand" />
            <h3 className="mt-3 font-semibold text-zinc-900">{f.title}</h3>
            <p className="mt-1.5 text-[15px] leading-relaxed text-zinc-600">{f.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function CtaBand() {
  return (
    <section className="px-4 pb-20 sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 rounded-3xl bg-gradient-to-br from-brand-700 to-brand-900 px-8 py-12 text-white shadow-xl md:flex-row md:items-center">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{appConfig.tagline}</h2>
          <p className="mt-2 text-white/75">Try it as a learner: buy the sample course with PayPal&rsquo;s test card, then fail it twice.</p>
        </div>
        <ButtonLink href={appConfig.landing.primaryCta.href} size="lg" variant="secondary" className="border-transparent">
          {appConfig.landing.primaryCta.label} <ArrowRight className="size-4" />
        </ButtonLink>
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
