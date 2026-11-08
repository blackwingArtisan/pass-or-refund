"use client";

import { retryAfterOf, showError } from "@/components/error-toast";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { Award, BookOpenCheck, CircleAlert, Clock, Send, ShieldCheck, TimerReset } from "lucide-react";
import { ToolCallTimeline } from "@/components/agent/tool-call-timeline";
import { useKit } from "@/components/kit/kit-provider";
import type { ApiError } from "@/components/kit/kit-provider";
import { useTimeline } from "@/components/kit/use-timeline";
import { PageHeader } from "@/components/shell/app-shell";
import { useToast } from "@/components/toast";
import { Button, Card, CardBody, CardHeader, EmptyState, Field, SkeletonCard, Textarea } from "@/components/ui";
import { learnerLineText } from "@/lib/course/contest-rules";
import { course, lessonForItem, lessons, rubric } from "@/lib/course/content";
import { ATTEMPT_GAP_HOURS, attemptComplete, countsTowardRefund, everyQuestionAnswered, FAILS_FOR_REFUND, formatCents, MAX_ANSWER_CHARS, MIN_POINTS_FOR_REFUND, missedItems } from "@/lib/course/policy";
import { enrollmentChannel, isCourseStep } from "@/lib/course/scope";
import { SAMPLE_PASS_ID } from "@/lib/course/sample-ids";
import { samples, type SampleId } from "@/lib/course/samples";
import type { Attempt, EnrollmentView } from "@/lib/course/types";
import { AttemptResult } from "./attempt-result";
import { JudgeToggle, useJudgeMode } from "./judge-mode";
import { Guarantee } from "./guarantee";
import { ContestLine, ContestStatus, RubricTerms } from "./rubric-receipt";

const SAMPLE_BUTTONS: { id: SampleId; label: string }[] = [
  { id: "fail1", label: "Weak" },
  { id: "fail2", label: "Better, still weak" },
  { id: "pass", label: "Strong" },
  { id: "borderline", label: "Borderline" },
  { id: "inject", label: "Tries to trick the grader" },
];

/** 402 and 503: the grader is out of credit or down. They stay on screen beside the answers. */
const GRADER_OUTAGES = [402, 503];

const blankAnswers = () => Object.fromEntries(rubric.questions.map((q) => [q.id, ""]));

function Notice({ tone, icon, children, testId }: { tone: "info" | "error"; icon: ReactNode; children: ReactNode; testId?: string }) {
  return (
    <div data-testid={testId} className={`flex items-start gap-3 rounded-xl px-4 py-3 text-sm ${tone === "error" ? "bg-red-50 text-red-900" : "bg-zinc-50 text-zinc-700"}`}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div>{children}</div>
    </div>
  );
}

function Lessons() {
  return (
    <Card>
      <CardHeader title="Lessons" description={course.subtitle} />
      <CardBody className="space-y-2">
        {lessons.map((lesson) => (
          <details key={lesson.number} id={`lesson-${lesson.number}`} className="rounded-lg border border-zinc-200 px-4 py-2">
            <summary className="cursor-pointer font-medium text-zinc-900">
              Lesson {lesson.number}: {lesson.name}
            </summary>
            <p className="mt-2 text-sm leading-relaxed text-zinc-600">{lesson.text}</p>
          </details>
        ))}
      </CardBody>
    </Card>
  );
}

function Quiz({ attemptNumber, grading, busy, problem, onSubmit }: { attemptNumber: number; grading: boolean; busy: boolean; problem: string | null; onSubmit: (answers: Record<string, string>) => void }) {
  const [answers, setAnswers] = useState(blankAnswers);
  const [judge, setJudge] = useJudgeMode();
  const nothingWritten = Object.values(answers).every((a) => a.trim() === "");
  return (
    <Card id="final-check">
      <CardHeader title={attemptNumber === 1 ? "Final check" : `Final check, attempt ${attemptNumber}`} description={`Four questions, 25 points each. Write in your own words. Pass mark ${course.passMark}.`} />
      <CardBody className="space-y-5">
        <div className="space-y-2">
          <JudgeToggle on={judge} onChange={setJudge} />
          {judge ? (
            <div data-testid="sample-buttons" className="rounded-lg bg-zinc-50 px-3 py-2.5">
              <p className="text-xs text-zinc-600">Fill all four answers with a prepared example, then submit it or edit it first.</p>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                {SAMPLE_BUTTONS.map(({ id, label }) => (
                  <Button key={id} size="sm" variant="secondary" onClick={() => setAnswers(samples[id])} data-testid={`sample-${id}`} disabled={grading} className={id === "inject" ? "col-span-2" : undefined}>
                    {label}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
        {rubric.questions.map((question, index) => (
          <Field key={question.id} label={`Question ${index + 1}`} hint={question.text} htmlFor={question.id}>
            <Textarea
              id={question.id}
              data-testid={`answer-${question.id}`}
              rows={4}
              maxLength={MAX_ANSWER_CHARS}
              value={answers[question.id]}
              disabled={grading}
              onChange={(e) => setAnswers((current) => ({ ...current, [question.id]: e.target.value }))}
            />
          </Field>
        ))}
        {nothingWritten || everyQuestionAnswered(answers) ? null : <p className="text-sm text-zinc-500">An attempt with a blank answer can&rsquo;t count toward a refund.</p>}
        {problem ? (
          <Notice tone="error" icon={<CircleAlert className="size-4" />} testId="grading-unavailable">
            {problem}
          </Notice>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <Button icon={<Send className="size-4" />} loading={grading} disabled={busy || nothingWritten} onClick={() => onSubmit(answers)} data-testid="submit-attempt" className="select-none">
            {grading ? "Grading your answers" : "Submit for grading"}
          </Button>
          {busy ? <span className="text-sm text-amber-700" data-testid="grader-busy">The grader is busy. Submit opens again when the wait ends.</span> : nothingWritten ? <span className="text-sm text-zinc-500">Write an answer to submit.</span> : null}
        </div>
      </CardBody>
    </Card>
  );
}

/** Stands in for the final check during the wait. The skip is here so judges can fail twice right away. */
function NextAttempt({ opensAt, attemptNumber, onSkip }: { opensAt: string; attemptNumber: number; onSkip: () => void }) {
  const when = new Date(opensAt).toLocaleString("en-US", { weekday: "long", hour: "numeric", minute: "2-digit" });
  return (
    <Card id="final-check" data-testid="attempt-gap">
      <CardHeader title={`Final check, attempt ${attemptNumber}`} description={`Attempts are ${ATTEMPT_GAP_HOURS} hours apart, so there's time to work through your study list.`} />
      <CardBody className="space-y-3">
        <p className="flex items-center gap-2 font-medium text-zinc-900">
          <Clock className="size-4 text-zinc-500" /> Your next attempt opens <span data-testid="next-attempt-at">{when}</span>.
        </p>
        <div className="flex flex-wrap items-center gap-3 rounded-lg bg-zinc-50 px-3 py-2">
          <Button size="sm" variant="secondary" icon={<TimerReset className="size-4" />} onClick={onSkip} data-testid="skip-wait">
            Skip the wait (demo)
          </Button>
          <p className="text-xs text-zinc-500">Here so judges can try a second attempt right now. A real course wouldn&rsquo;t have this button.</p>
        </div>
      </CardBody>
    </Card>
  );
}

function Certificate({ learnerName, attempt, lock }: { learnerName: string; attempt: Attempt; lock?: EnrollmentView["rubric"] }) {
  const date = new Date(attempt.submittedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  return (
    <div data-testid="certificate" className="rounded-2xl border-2 border-brand-200 bg-gradient-to-b from-brand-50 to-white px-6 py-10 text-center">
      <Award className="mx-auto size-10 text-brand" />
      <p className="mt-3 text-sm font-medium uppercase tracking-wider text-brand">Certificate of completion</p>
      <p className="mt-4 text-3xl font-semibold tracking-tight text-zinc-950">{learnerName}</p>
      <p className="mt-2 text-zinc-600">
        passed <span className="font-medium text-zinc-900">{course.title}</span> with {attempt.score} out of 100
      </p>
      <p className="mt-1 text-sm text-zinc-500">
        {date}, by {course.creator}
      </p>
      <RubricTerms lock={lock} className="mt-4 justify-center text-xs text-zinc-500" />
    </div>
  );
}

const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });


/** A note the refund agent wrote for this learner, from the rubric lines they fell short on. */
function AgentNote({ text }: { text: string }) {
  return (
    <span data-testid="refund-note" className="mt-2 block border-l-2 border-brand-200 pl-3 text-zinc-700">
      {text} <span className="text-xs text-zinc-500">(written by the refund agent)</span>
    </span>
  );
}
function RefundIssued({ enrollment }: { enrollment: EnrollmentView }) {
  const refund = enrollment.refund!;
  const rows = [
    ["Refund id", refund.refundId, "refund-id"],
    ["Refund status", refund.refundStatus, "refund-status"],
    ["Amount", refund.refundedCents === undefined ? undefined : formatCents(refund.refundedCents), "refund-amount"],
    ["Payment status", refund.captureStatus, "capture-status"],
  ];
  return (
    <div data-testid="refund-issued" className="rounded-2xl border-2 border-brand-200 bg-gradient-to-b from-brand-50 to-white px-6 py-8">
      <ShieldCheck className="size-9 text-brand" />
      <h2 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-950">Refund issued, sorry we let you down</h2>
      <p className="mt-1 text-zinc-600">You did the work and the course didn&rsquo;t get you there, so every cent goes back through PayPal. Your access to the lessons ends with the refund.</p>
      <dl className="mt-5 grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {rows.map(([label, value, testId]) => (
          <div key={label}>
            <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</dt>
            <dd data-testid={testId} className="font-mono text-sm text-zinc-900">
              {value}
            </dd>
          </div>
        ))}
      </dl>
      {refund.refundStatus === "PENDING" ? (
        <p data-testid="refund-pending-note" className="mt-4 text-sm text-zinc-600">
          {refund.refundStatusReason === "DISPUTE" ? (
            <>PayPal is paying this back through the dispute you opened, which the course team accepted.</>
          ) : refund.refundStatusReason === "ECHECK" ? (
            <>
              PayPal has accepted this refund, but the money hasn&rsquo;t reached the buyer yet. The seller&rsquo;s PayPal balance is smaller than the refund, so PayPal is drawing it from the seller&rsquo;s bank, which it calls ECHECK. That takes days, and on a sandbox test account it may stay PENDING.
            </>
          ) : (
            <>PayPal has accepted this refund and is still paying it out. That can take a few days.</>
          )}{" "}
          This page updates when it settles.
        </p>
      ) : null}
      {refund.viaDispute ? (
        <p data-testid="refund-via-dispute" className="mt-4 text-sm text-zinc-600">
          Paid by accepting your PayPal dispute, so the dispute is closed in your favour.
        </p>
      ) : null}
      <p className="mt-4 text-xs text-zinc-500">{refund.rereadAt ? `Read back from PayPal after the refund at ${new Date(refund.rereadAt).toLocaleTimeString("en-US")}.` : "Checking this with PayPal."}</p>
      {refund.webhookAt ? (
        <p data-testid="refund-webhook" className="mt-1 text-xs text-zinc-500">
          PayPal&rsquo;s webhook confirmed it at {clock(refund.webhookAt)}
          {refund.webhookStatus && refund.webhookStatus !== "COMPLETED" ? `, as ${refund.webhookStatus}` : ""}.
        </p>
      ) : null}
    </div>
  );
}

/** The study list, one tick per missed item. The button only opens once each one is done. */
function StudyChecklist({ enrollment, attempt, onTick, onReviewed }: { enrollment: EnrollmentView; attempt: Attempt; onTick: (itemId: string) => void; onReviewed: () => void }) {
  const itemText = Object.fromEntries(rubric.questions.flatMap((q) => q.items.map((item) => [item.id, learnerLineText(item.id)])));
  const missed = missedItems(attempt);
  const ticked = enrollment.studyTicks ?? [];
  const left = missed.filter((item) => !ticked.includes(item.id)).length;
  return (
    <div className="mt-3 space-y-2">
      <ul className="space-y-1.5">
        {missed.map((item) => {
          const lesson = lessons.find((l) => l.number === lessonForItem[item.id]);
          return (
            <li key={item.id}>
              <label className="flex items-start gap-2">
                <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-brand" checked={ticked.includes(item.id)} onChange={() => onTick(item.id)} disabled={ticked.includes(item.id)} data-testid={`study-item-${item.id}`} />
                <span>
                  {itemText[item.id]}. {lesson ? <a href={`#lesson-${lesson.number}`} className="font-medium text-brand hover:underline">Lesson {lesson.number}</a> : null}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <Button size="sm" variant="secondary" icon={<BookOpenCheck className="size-4" />} onClick={onReviewed} disabled={left > 0} data-testid="mark-reviewed">
        I&rsquo;ve reviewed my study list
      </Button>
      {left > 0 ? <p className="text-xs text-zinc-500">{left} left to tick off.</p> : null}
    </div>
  );
}

/** What happens next after a failed attempt, then the study list to work through. */
function AfterFail({ enrollment, attempt, onTick, onReviewed }: { enrollment: EnrollmentView; attempt: Attempt; onTick: (itemId: string) => void; onReviewed: () => void }) {
  const prior = enrollment.guarantee.checks.find((c) => c.rule === "one_refund_per_learner");
  if (enrollment.guaranteeVoid) return <Notice tone="error" icon={<CircleAlert className="size-4" />}>The guarantee no longer applies, because an attempt tried to instruct the grader. You can still study and try again.</Notice>;
  if (prior && !prior.passed) return <Notice tone="error" icon={<CircleAlert className="size-4" />} testId="prior-refund">This purchase isn&rsquo;t covered by the guarantee, because it allows one refund per PayPal account and per email, and you&rsquo;ve had yours. You can still study and try again.</Notice>;
  const incomplete = attempt.nearCopyOf !== undefined ? `because it's nearly the same as attempt ${attempt.nearCopyOf}` : `because every question needs an answer and the attempt needs at least ${MIN_POINTS_FOR_REFUND} points`;
  const why = attemptComplete(attempt) ? "because you hadn't marked your study list as reviewed" : incomplete;
  const reviewed = enrollment.reviewedAttempt === attempt.number;
  return (
    <Notice tone="info" icon={<Clock className="size-4" />} testId="fail-count">
      {countsTowardRefund(attempt) ? `That's ${enrollment.completedFails} of ${FAILS_FOR_REFUND} completed attempts toward your refund.` : `This attempt doesn't count toward a refund, ${why}.`} Work through your study list, then <a href="#final-check" className="font-medium text-brand underline">try again</a>.
      {reviewed ? (
        <p data-testid="study-list-reviewed" className="mt-2 flex items-center gap-1.5 font-medium text-zinc-900">
          <BookOpenCheck className="size-4" /> Study list reviewed
        </p>
      ) : (
        <StudyChecklist enrollment={enrollment} attempt={attempt} onTick={onTick} onReviewed={onReviewed} />
      )}
    </Notice>
  );
}

export function LearnerScreen({ id }: { id: string }) {
  const { kitFetch } = useKit();
  const { toast } = useToast();
  const [enrollment, setEnrollment] = useState<EnrollmentView | null>(null);
  const [missing, setMissing] = useState(false);
  const [grading, setGrading] = useState(false);
  const [gradingProblem, setGradingProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const setBusyFor = useCallback((seconds: number) => {
    setBusy(true);
    setTimeout(() => setBusy(false), seconds * 1000);
  }, []);
  const url = `/api/enrollments/${id}`;
  const load = useCallback(() => kitFetch<EnrollmentView>(url), [kitFetch, url]);
  // Only this enrollment's own PayPal webhooks, and each one refreshes the page: it may have settled something.
  const { steps } = useTimeline({ includeGlobal: false, channels: [enrollmentChannel(id)], onEvent: (e) => void (e.kind === "webhook" && load().then(setEnrollment).catch(() => undefined)) });
  const { status, refund } = enrollment ?? {};
  const waiting = status === "refund_pending" || status === "under_review" || refund?.refundStatus === "PENDING" || (status === "refunded" && !refund?.rereadAt);

  useEffect(() => {
    let live = true;
    load()
      .then((e) => live && setEnrollment(e))
      .catch(() => live && setMissing(true));
    return () => {
      live = false;
    };
  }, [load]);

  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => void load().then(setEnrollment).catch(() => undefined), 1000);
    return () => clearInterval(timer);
  }, [load, waiting]);

  async function submit(answers: Record<string, string>) {
    setGrading(true);
    setGradingProblem(null);
    try {
      setEnrollment(await kitFetch<EnrollmentView>(`${url}/attempts`, { json: { answers } }));
    } catch (e) {
      if (GRADER_OUTAGES.includes((e as ApiError).status)) setGradingProblem((e as Error).message);
      else if (retryAfterOf(e)) {
        const wait = retryAfterOf(e)!;
        toast({ title: "The grader is busy", description: "Your answers are still here.", variant: "warning", countdownSeconds: wait });
        setBusyFor(wait);
      } else showError(toast, "Your attempt wasn't graded", e);
    } finally {
      setGrading(false);
    }
  }

  async function update(path: string, json: object) {
    try {
      setEnrollment(await kitFetch<EnrollmentView>(`${url}/${path}`, { json }));
    } catch (e) {
      showError(toast, "That didn't save", e);
    }
  }

  const timelineSteps = useMemo(() => steps.filter(isCourseStep).map((s) => (s.approval?.state === "pending" ? { ...s, approval: undefined } : s)), [steps]);

  if (missing) return <EmptyState title="We can't find that enrollment" description="It may have been cleared." action={<Link href="/course" className="text-sm font-medium text-brand">Back to the course</Link>} />;
  if (!enrollment) return <SkeletonCard />;

  const latest = enrollment.attempts.at(-1);
  const past = [...enrollment.attempts].reverse();
  const canAttempt = enrollment.status === "active";

  return (
    <>
      <PageHeader
        eyebrow={`Welcome, ${enrollment.learnerName}`}
        title={course.title}
        description={
          enrollment.payment?.capturedCents === undefined ? undefined : (
            <span data-testid="receipt" className="flex flex-col gap-1">
              <span>{`${formatCents(enrollment.payment.capturedCents)} paid through PayPal, order ${enrollment.payment.orderId}.`}</span>
              <RubricTerms lock={enrollment.rubric} className="text-sm" />
            </span>
          )
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-6">
          {enrollment.id === SAMPLE_PASS_ID ? (
            <Notice tone="info" icon={<Award className="size-4" />} testId="sample-pass">
              <strong>Sample learner.</strong> {enrollment.learnerName} is made up, so you can see what passing looks like without passing yourself. Her answers are the course&rsquo;s strong sample answers, graded with recorded verdicts and added up by the same code. No PayPal payment was made.
            </Notice>
          ) : null}
          {enrollment.status === "unpaid" ? (
            <Notice tone="info" icon={<Clock className="size-4" />} testId="purchase-unfinished">
              <strong>This purchase didn&rsquo;t finish.</strong> PayPal hasn&rsquo;t taken any money. <Link href="/course" className="font-medium text-brand underline">Back to the course</Link> to try again with the same email.
            </Notice>
          ) : null}
          {enrollment.payment?.recovered ? (
            <Notice tone="info" icon={<ShieldCheck className="size-4" />} testId="payment-recovered">
              <strong>You&rsquo;re all set.</strong> PayPal took your payment but our app stopped before saving it, so we rebuilt your enrollment from PayPal. You paid once.
            </Notice>
          ) : null}
          {enrollment.dispute && enrollment.status !== "refunded" ? (
            <Notice tone="info" icon={<CircleAlert className="size-4" />} testId="learner-dispute">
              <strong>You opened a PayPal dispute on this payment.</strong> {enrollment.dispute.status === "RESOLVED" ? "PayPal has closed it." : "The course team sees it and answers by the same guarantee rules. If a refund is due, a person approves it and PayPal pays it back."}
            </Notice>
          ) : null}
          {enrollment.status === "refunded" ? <RefundIssued enrollment={enrollment} /> : null}
          {enrollment.contest ? <ContestStatus enrollment={enrollment} /> : null}
          {enrollment.status === "passed" && latest ? <Certificate learnerName={enrollment.learnerName} attempt={latest} lock={enrollment.rubric} /> : null}
          {enrollment.status === "under_review" ? (
            <Notice tone="info" icon={<Clock className="size-4" />} testId="under-review">
              <strong>Under review, answer within one business day.</strong> Your score sits right at the pass mark, so a person will look at it. No refund yet.
            </Notice>
          ) : null}
          {enrollment.status === "refund_pending" ? (
            <Notice tone="info" icon={<Clock className="size-4" />} testId="refund-waiting">
              <strong>You&rsquo;ve earned your refund.</strong> It&rsquo;s waiting for a person on the <Link href="/team" className="font-medium text-brand underline">course team</Link> to approve it. No money has moved yet.
              {enrollment.refund?.proposal?.learnerNote ? <AgentNote text={enrollment.refund.proposal.learnerNote} /> : null}
            </Notice>
          ) : null}
          {enrollment.status === "refund_review" ? (
            <Notice tone="info" icon={<Clock className="size-4" />} testId="refund-in-review">
              <strong>A person is looking at your case before the refund.</strong> No money has moved, and nothing is lost while they look.
              {enrollment.refund?.review?.learnerNote ? <AgentNote text={enrollment.refund.review.learnerNote} /> : null}
            </Notice>
          ) : null}
          {enrollment.status === "refund_declined" ? (
            <Notice tone="error" icon={<CircleAlert className="size-4" />} testId="refund-declined">
              <strong>The course team declined this refund.</strong> No money has moved, and your payment stands. Their reason: {enrollment.refund?.declineNote ?? "none given"}.
            </Notice>
          ) : null}
          {enrollment.status === "refund_blocked" ? (
            <Notice tone="error" icon={<CircleAlert className="size-4" />} testId="refund-blocked">
              <strong>Your refund hasn&rsquo;t gone through.</strong> No money has moved. The course team can review it again. {enrollment.refund?.error}
            </Notice>
          ) : null}

          {canAttempt && latest?.outcome === "fail" ? (
            <>
              <AfterFail enrollment={enrollment} attempt={latest} onTick={(item) => update("review", { item })} onReviewed={() => update("review", {})} />
              <ContestLine enrollment={enrollment} onChange={setEnrollment} />
              <Guarantee />
            </>
          ) : null}

          {past.length > 0 ? (
            <Card>
              <CardHeader title="Your results" />
              <CardBody className="space-y-8">
                {past.map((attempt) => (
                  <AttemptResult key={attempt.number} attempt={attempt} />
                ))}
              </CardBody>
            </Card>
          ) : null}

          {canAttempt ? <Lessons /> : null}
          {canAttempt && enrollment.nextAttemptAt ? <NextAttempt opensAt={enrollment.nextAttemptAt} attemptNumber={enrollment.attempts.length + 1} onSkip={() => update("skip-wait", {})} /> : null}
          {canAttempt && !enrollment.nextAttemptAt ? <Quiz key={enrollment.attempts.length} attemptNumber={enrollment.attempts.length + 1} grading={grading} busy={busy} problem={gradingProblem} onSubmit={submit} /> : null}
        </div>
        <div className="min-w-0 lg:sticky lg:top-6 lg:self-start">
          {/* The feed holds everyone's payments, which would contradict "PayPal hasn't taken any money". */}
          <ToolCallTimeline steps={enrollment.status === "unpaid" ? [] : timelineSteps} className="max-h-[760px] min-h-[320px]" emptyDescription="PayPal calls and guarded steps show up here as they happen." />
        </div>
      </div>
    </>
  );
}
