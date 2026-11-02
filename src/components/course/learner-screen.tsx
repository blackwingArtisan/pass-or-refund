"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { Award, CircleAlert, Clock, Send, ShieldCheck } from "lucide-react";
import { ToolCallTimeline } from "@/components/agent/tool-call-timeline";
import { useKit } from "@/components/kit/kit-provider";
import { useTimeline } from "@/components/kit/use-timeline";
import { PageHeader } from "@/components/shell/app-shell";
import { useToast } from "@/components/toast";
import { Button, Card, CardBody, CardHeader, EmptyState, Field, SkeletonCard, Textarea } from "@/components/ui";
import { course, lessons, rubric } from "@/lib/course/content";
import { everyQuestionAnswered, FAILS_FOR_REFUND, formatCents, MAX_ANSWER_CHARS, MIN_POINTS_FOR_REFUND } from "@/lib/course/policy";
import { samples, type SampleId } from "@/lib/course/samples";
import type { Attempt, EnrollmentView } from "@/lib/course/types";
import { AttemptResult } from "./attempt-result";
import { Guarantee } from "./guarantee";

const SAMPLE_BUTTONS: { id: SampleId; label: string }[] = [
  { id: "fail1", label: "Weak answers" },
  { id: "fail2", label: "Better, still weak" },
  { id: "pass", label: "Strong answers" },
  { id: "borderline", label: "Borderline answers" },
  { id: "inject", label: "Try to trick the grader" },
];

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

function Quiz({ attemptNumber, grading, onSubmit }: { attemptNumber: number; grading: boolean; onSubmit: (answers: Record<string, string>) => void }) {
  const [answers, setAnswers] = useState(blankAnswers);
  return (
    <Card>
      <CardHeader title={attemptNumber === 1 ? "Final check" : `Final check, attempt ${attemptNumber}`} description={`Four questions, 25 points each. Write in your own words. Pass mark ${course.passMark}.`} />
      <CardBody className="space-y-5">
        <div data-testid="sample-buttons" className="flex flex-wrap items-center gap-2 rounded-lg bg-zinc-50 px-3 py-2">
          <span className="text-xs font-medium text-zinc-500">Demo answers:</span>
          {SAMPLE_BUTTONS.map(({ id, label }) => (
            <Button key={id} size="sm" variant="ghost" onClick={() => setAnswers(samples[id])} data-testid={`sample-${id}`} disabled={grading}>
              {label}
            </Button>
          ))}
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
        {everyQuestionAnswered(answers) ? null : <p className="text-sm text-zinc-500">An attempt with a blank answer can&rsquo;t count toward a refund.</p>}
        <Button icon={<Send className="size-4" />} loading={grading} onClick={() => onSubmit(answers)} data-testid="submit-attempt">
          {grading ? "Grading your answers" : "Submit for grading"}
        </Button>
      </CardBody>
    </Card>
  );
}

function Certificate({ learnerName, attempt }: { learnerName: string; attempt: Attempt }) {
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
    </div>
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
      <p className="mt-1 text-zinc-600">You did the work and the course didn&rsquo;t get you there, so every cent goes back through PayPal.</p>
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
      <p className="mt-4 text-xs text-zinc-500">Read back from PayPal after the refund{refund.rereadAt ? ` at ${new Date(refund.rereadAt).toLocaleTimeString("en-US")}` : ""}.</p>
    </div>
  );
}

/** What happens next, in one line, after a failed attempt. */
function AfterFail({ enrollment, attempt }: { enrollment: EnrollmentView; attempt: Attempt }) {
  if (enrollment.guaranteeVoid) return <Notice tone="error" icon={<CircleAlert className="size-4" />}>The guarantee no longer applies, because an attempt tried to instruct the grader. You can still study and try again.</Notice>;
  const counted = attempt.score >= MIN_POINTS_FOR_REFUND && everyQuestionAnswered(attempt.answers);
  return (
    <Notice tone="info" icon={<Clock className="size-4" />} testId="fail-count">
      {counted ? `That's ${enrollment.completedFails} of ${FAILS_FOR_REFUND} completed attempts toward your refund.` : `This attempt doesn't count toward a refund, because every question needs an answer and the attempt needs at least ${MIN_POINTS_FOR_REFUND} points.`} Work through your study list, then try again.
    </Notice>
  );
}

export function LearnerScreen({ id }: { id: string }) {
  const { kitFetch } = useKit();
  const { toast } = useToast();
  const { steps } = useTimeline();
  const [enrollment, setEnrollment] = useState<EnrollmentView | null>(null);
  const [missing, setMissing] = useState(false);
  const [grading, setGrading] = useState(false);
  const url = `/api/enrollments/${id}`;
  const load = useCallback(() => kitFetch<EnrollmentView>(url), [kitFetch, url]);
  const waiting = enrollment?.status === "refund_pending";

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
    try {
      setEnrollment(await kitFetch<EnrollmentView>(`${url}/attempts`, { json: { answers } }));
    } catch (e) {
      toast({ title: "Your attempt wasn't graded", description: (e as Error).message, variant: "error" });
    } finally {
      setGrading(false);
    }
  }

  const timelineSteps = useMemo(() => steps.filter((s) => s.channel !== "global" || s.kind === "webhook").map((s) => (s.approval?.state === "pending" ? { ...s, approval: undefined } : s)), [steps]);

  if (missing) return <EmptyState title="We can't find that enrollment" description="It may have been cleared." action={<Link href="/course" className="text-sm font-medium text-brand">Back to the course</Link>} />;
  if (!enrollment) return <SkeletonCard />;

  const latest = enrollment.attempts.at(-1);
  const past = [...enrollment.attempts].reverse();
  const canAttempt = enrollment.status === "active";

  return (
    <>
      <PageHeader eyebrow={`Welcome, ${enrollment.learnerName}`} title={course.title} description={enrollment.payment?.capturedCents === undefined ? undefined : `${formatCents(enrollment.payment.capturedCents)} paid through PayPal, order ${enrollment.payment.orderId}.`} />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-6">
          {enrollment.status === "refunded" ? <RefundIssued enrollment={enrollment} /> : null}
          {enrollment.status === "passed" && latest ? <Certificate learnerName={enrollment.learnerName} attempt={latest} /> : null}
          {enrollment.status === "under_review" ? (
            <Notice tone="info" icon={<Clock className="size-4" />} testId="under-review">
              <strong>Under review, answer within one business day.</strong> Your score sits right at the pass mark, so a person will look at it. No refund yet.
            </Notice>
          ) : null}
          {enrollment.status === "refund_pending" ? (
            <Notice tone="info" icon={<Clock className="size-4" />} testId="refund-waiting">
              <strong>You&rsquo;ve earned your refund.</strong> It&rsquo;s waiting for a person on the <Link href="/team" className="font-medium text-brand underline">course team</Link> to approve it. No money has moved yet.
            </Notice>
          ) : null}
          {enrollment.status === "refund_blocked" ? (
            <Notice tone="error" icon={<CircleAlert className="size-4" />} testId="refund-blocked">
              <strong>Your refund hasn&rsquo;t gone through.</strong> No money has moved. The course team can review it again. {enrollment.refund?.error}
            </Notice>
          ) : null}

          {canAttempt && latest?.outcome === "fail" ? (
            <>
              <AfterFail enrollment={enrollment} attempt={latest} />
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
          {canAttempt ? <Quiz key={enrollment.attempts.length} attemptNumber={enrollment.attempts.length + 1} grading={grading} onSubmit={submit} /> : null}
        </div>
        <div className="min-w-0 lg:sticky lg:top-6 lg:self-start">
          <ToolCallTimeline steps={timelineSteps} className="max-h-[760px] min-h-[320px]" emptyDescription="PayPal calls and guarded steps show up here as they happen." />
        </div>
      </div>
    </>
  );
}
