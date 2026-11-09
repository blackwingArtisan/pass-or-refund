"use client";

import { showError } from "@/components/error-toast";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, RotateCcw, ShieldAlert, Users, X } from "lucide-react";
import { ApprovalPrompt } from "@/components/agent/approval-prompt";
import { ToolCallTimeline } from "@/components/agent/tool-call-timeline";
import { ContestRuling } from "@/components/course/contest-ruling";
import { useKit } from "@/components/kit/kit-provider";
import { useTimeline } from "@/components/kit/use-timeline";
import { PageHeader } from "@/components/shell/app-shell";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, CardBody, EmptyState, Field, SkeletonCard, Textarea, type Tone } from "@/components/ui";
import { CURRENCY, rubric } from "@/lib/course/content";
import { formatCents, shortfallItems } from "@/lib/course/policy";
import { isCourseStep, TEAM_CHANNEL } from "@/lib/course/scope";
import type { Attempt, EnrollmentStatus, EnrollmentView } from "@/lib/course/types";

const STATUS: Record<EnrollmentStatus, { label: string; tone: Tone }> = {
  unpaid: { label: "Not paid", tone: "neutral" },
  active: { label: "Studying", tone: "info" },
  passed: { label: "Passed", tone: "success" },
  under_review: { label: "Needs review", tone: "warning" },
  refund_pending: { label: "Refund needs approval", tone: "warning" },
  refund_review: { label: "Agent asks for a review", tone: "warning" },
  refund_declined: { label: "Refund declined", tone: "danger" },
  refund_blocked: { label: "Refund blocked", tone: "danger" },
  refunded: { label: "Refunded", tone: "success" },
};

const VERDICT_LABEL: Record<string, string> = { partial: "Partial", not_met: "Missed" };

/** A 69-70 attempt. Every item that lost points gets its own tick before either button opens. */
/** What the refund agent wrote for the person deciding, from the lines the learner fell short on. */
function AgentSummary({ text, testId = "agent-summary" }: { text: string; testId?: string }) {
  return (
    <div data-testid={testId} className="rounded-lg border border-brand-100 bg-brand-50/60 px-3 py-2 text-sm text-zinc-800">
      <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">Refund agent&rsquo;s summary</p>
      <p className="mt-0.5">{text}</p>
    </div>
  );
}

/** The refund agent sent a contested or borderline case to a person before proposing anything. */
function RefundReviewBox({ enrollment, onDecided }: { enrollment: EnrollmentView; onDecided: () => void }) {
  const { kitFetch } = useKit();
  const { toast } = useToast();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const review = enrollment.refund!.review!;

  async function decide(decision: "propose" | "decline") {
    setBusy(true);
    try {
      await kitFetch(`/api/enrollments/${enrollment.id}/refund/review`, { json: { decision, note } });
      onDecided();
    } catch (e) {
      showError(toast, "That didn't save", e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div data-testid="refund-review" className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/50 p-3">
      <div>
        <p className="font-medium text-zinc-900">The refund agent asks you to look before it proposes a refund.</p>
        <p data-testid="refund-review-reason" className="text-sm text-zinc-700">{review.reason}</p>
      </div>
      <AgentSummary text={review.teamSummary} testId="refund-review-summary" />
      <Field label="Your note" hint="Needed to decline: the learner reads it, and it's listed on the public cohort page without their name." htmlFor={`review-note-${enrollment.id}`}>
        <Textarea id={`review-note-${enrollment.id}`} rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} data-testid="review-note" />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" icon={<Check className="size-4" />} loading={busy} onClick={() => decide("propose")} data-testid="review-propose">
          Send the refund for approval
        </Button>
        <Button size="sm" variant="secondary" icon={<X className="size-4" />} loading={busy} disabled={!note.trim()} onClick={() => decide("decline")} data-testid="review-decline">
          Decline the refund
        </Button>
      </div>
    </div>
  );
}

function SettleReview({ enrollmentId, attempt, onSettled }: { enrollmentId: string; attempt: Attempt; onSettled: () => void }) {
  const { kitFetch } = useKit();
  const { toast } = useToast();
  const [checked, setChecked] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const itemText = Object.fromEntries(rubric.questions.flatMap((q) => q.items.map((item) => [item.id, item.text])));
  const items = shortfallItems(attempt);
  const ready = checked.length === items.length && note.trim().length > 0;

  async function settle(outcome: "pass" | "fail") {
    setBusy(true);
    try {
      await kitFetch(`/api/enrollments/${enrollmentId}/settle`, { json: { outcome, note, checkedItems: checked } });
      onSettled();
    } catch (e) {
      showError(toast, "That didn't save", e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div data-testid="settle-review" className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/50 p-3">
      <div>
        <p className="font-medium text-zinc-900">
          Attempt {attempt.number} landed on {attempt.score}, too close for the grader to call.
        </p>
        <p className="text-sm text-zinc-600">
          Three grades: {attempt.runs.map((run) => run.total).join(", ")}. The middle one counts. Check each item that lost points, then decide. A fail here counts like any other fail.
        </p>
      </div>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.id}>
            <label className="flex items-start gap-2 text-sm text-zinc-800">
              <input
                type="checkbox"
                className="mt-0.5 size-4 shrink-0 accent-brand"
                checked={checked.includes(item.id)}
                onChange={(e) => setChecked((now) => (e.target.checked ? [...now, item.id] : now.filter((id) => id !== item.id)))}
                data-testid={`settle-item-${item.id}`}
              />
              <span>
                {itemText[item.id]} <Badge tone={item.verdict === "partial" ? "warning" : "danger"}>{VERDICT_LABEL[item.verdict]}</Badge>
                {item.quote ? <span className="mt-0.5 block italic text-zinc-600">&ldquo;{item.quote}&rdquo;</span> : null}
              </span>
            </label>
          </li>
        ))}
      </ul>
      <Field label="Your note" hint="The learner reads this." htmlFor={`settle-note-${enrollmentId}`}>
        <Textarea id={`settle-note-${enrollmentId}`} rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} data-testid="settle-note" />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" icon={<Check className="size-4" />} loading={busy} disabled={!ready} onClick={() => settle("pass")} data-testid="settle-pass">
          Pass this attempt
        </Button>
        <Button size="sm" variant="secondary" icon={<X className="size-4" />} loading={busy} disabled={!ready} onClick={() => settle("fail")} data-testid="settle-fail">
          Fail this attempt
        </Button>
      </div>
      {ready ? null : <p className="text-xs text-zinc-500">{items.length - checked.length > 0 ? `${items.length - checked.length} left to check.` : "Add a note to decide."}</p>}
    </div>
  );
}

const DISPUTE_REASON: Record<string, string> = {
  MERCHANDISE_OR_SERVICE_NOT_RECEIVED: "says the course wasn't delivered",
  MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED: "says the course wasn't as described",
  UNAUTHORISED: "says they didn't make the payment",
  CREDIT_NOT_PROCESSED: "says a refund never arrived",
  DUPLICATE_TRANSACTION: "says they were charged twice",
};

const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

/** What PayPal's webhooks confirmed, beside what we read back. */
function WebhookLines({ enrollment }: { enrollment: EnrollmentView }) {
  const lines = [
    enrollment.payment?.webhookAt ? `PayPal's webhook confirmed the payment at ${clock(enrollment.payment.webhookAt)}.` : null,
    enrollment.refund?.webhookAt ? `PayPal's webhook confirmed the refund at ${clock(enrollment.refund.webhookAt)}${enrollment.refund.webhookStatus && enrollment.refund.webhookStatus !== "COMPLETED" ? `, as ${enrollment.refund.webhookStatus}` : ""}.` : null,
  ].filter(Boolean);
  if (lines.length === 0) return null;
  return (
    <p data-testid="team-webhook" className="text-xs text-zinc-500">
      {lines.join(" ")}
    </p>
  );
}

function EnrollmentCard({ enrollment, onChange }: { enrollment: EnrollmentView; onChange: () => void }) {
  const { kitFetch } = useKit();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const status = STATUS[enrollment.status];
  const latest = enrollment.attempts.at(-1);

  async function retry() {
    setBusy(true);
    try {
      await kitFetch(`/api/enrollments/${enrollment.id}/refund`, { method: "POST" });
      onChange();
    } catch (e) {
      showError(toast, "Could not request the refund", e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card data-testid={`enrollment-${enrollment.id}`}>
      <CardBody className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-semibold text-zinc-900">{enrollment.learnerName}</p>
            <p className="text-sm text-zinc-500">
              Paid {enrollment.payment?.capturedCents === undefined ? "nothing yet" : formatCents(enrollment.payment.capturedCents)}. {enrollment.attempts.length === 0 ? "No attempts yet." : `Scores: ${enrollment.attempts.map((a) => a.score).join(", ")}.`}
            </p>
          </div>
          <span className="flex items-center gap-3">
            <Badge tone={status.tone}>{status.label}</Badge>
            {enrollment.overdue ? (
              <span data-testid="overdue">
                <Badge tone="danger">{enrollment.overdue.label}</Badge>
              </span>
            ) : null}
            <Link href={`/learn/${enrollment.id}`} className="text-sm font-medium text-brand hover:underline" data-testid="learner-link">
              Learner view
            </Link>
          </span>
        </div>
        {enrollment.guaranteeVoid ? <p className="text-sm text-red-700">An attempt was flagged for instructing the grader. The guarantee is void.</p> : null}
        <ContestRuling enrollment={enrollment} onRuled={onChange} />
        {enrollment.status === "under_review" && latest ? <SettleReview enrollmentId={enrollment.id} attempt={latest} onSettled={onChange} /> : null}
        {enrollment.refund?.proposedWithoutAi && enrollment.status === "refund_pending" ? (
          <p data-testid="proposed-without-ai" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {enrollment.refund.proposedWithoutAi} The refund still reaches you: code built this proposal from the policy check.
          </p>
        ) : null}
        {enrollment.status === "refund_pending" && !enrollment.approval ? <p className="text-sm text-zinc-600">The refund agent is checking the policy.</p> : null}
        {enrollment.status === "refund_review" && enrollment.refund?.review ? <RefundReviewBox enrollment={enrollment} onDecided={onChange} /> : null}
        {enrollment.approval && enrollment.refund?.proposal?.teamSummary ? <AgentSummary text={enrollment.refund.proposal.teamSummary} /> : null}
        {enrollment.approval ? (
          <ApprovalPrompt
            approvalId={enrollment.approval.id}
            summary={enrollment.approval.summary}
            reason={enrollment.approval.reason}
            amount={enrollment.approval.amountValue ? { currency_code: CURRENCY, value: enrollment.approval.amountValue } : undefined}
            reasons={enrollment.refund?.proposal?.reasons}
            askDeclineNote
            onDecided={onChange}
          />
        ) : null}
        {enrollment.status === "refund_blocked" || enrollment.status === "refund_declined" ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-red-50 px-3 py-2">
            <p className="text-sm text-red-900" data-testid="refund-stopped">
              {enrollment.status === "refund_declined" ? `Declined: ${enrollment.refund?.declineNote ?? "no reason given"}. No money moved.` : enrollment.refund?.error}
            </p>
            <Button size="sm" variant="secondary" icon={<RotateCcw className="size-4" />} loading={busy} onClick={retry} data-testid="retry-refund">
              Review again
            </Button>
          </div>
        ) : null}
        {enrollment.dispute ? (
          <p data-testid="team-dispute" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <strong>PayPal dispute {enrollment.dispute.id}</strong> ({DISPUTE_REASON[enrollment.dispute.reason] ?? "opened by the learner"}, {formatCents(enrollment.dispute.amountCents)}). {enrollment.dispute.note}
          </p>
        ) : null}
        {enrollment.refund?.refundId ? (
          <p data-testid="team-refund-done" className={`rounded-lg px-3 py-2 text-sm ${enrollment.refund.refundStatus === "COMPLETED" ? "bg-emerald-50 text-emerald-900" : "bg-zinc-50 text-zinc-700"}`}>
            <strong>
              {enrollment.refund.refundStatus === "COMPLETED" ? "Refund issued" : "Refund sent to PayPal"}: {formatCents(enrollment.refund.refundedCents ?? enrollment.payment?.capturedCents ?? 0)} back to {enrollment.learnerName}
              {enrollment.refund.viaDispute ? ", paid by accepting the dispute" : ""}.
            </strong>{" "}
            PayPal reports it {enrollment.refund.refundStatus}. <span className="font-mono text-xs">Refund {enrollment.refund.refundId}</span>{" "}
            <Link href={`/learn/${enrollment.id}`} className="font-medium text-brand hover:underline">
              See what the learner sees
            </Link>
          </p>
        ) : null}
        {enrollment.refund?.paypalNote ? (
          <p data-testid="team-paypal-note" className="rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
            <strong>What PayPal told the learner:</strong> {enrollment.refund.paypalNote}
            {enrollment.refund.paypalInvoiceId ? <span className="block font-mono text-xs text-zinc-500">invoice_id {enrollment.refund.paypalInvoiceId}</span> : null}
          </p>
        ) : null}
        <WebhookLines enrollment={enrollment} />
      </CardBody>
    </Card>
  );
}

export function TeamScreen() {
  const { kitFetch } = useKit();
  const { steps } = useTimeline({ includeGlobal: false, channels: [TEAM_CHANNEL] });
  const [enrollments, setEnrollments] = useState<EnrollmentView[] | null>(null);
  const load = useCallback(() => void kitFetch<{ enrollments: EnrollmentView[] }>("/api/team").then((r) => setEnrollments(r.enrollments)).catch(() => undefined), [kitFetch]);

  useEffect(() => {
    let live = true;
    const fetchTeam = () => kitFetch<{ enrollments: EnrollmentView[] }>("/api/team").then((r) => live && setEnrollments(r.enrollments)).catch(() => undefined);
    void fetchTeam();
    const timer = setInterval(fetchTeam, 1000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [kitFetch]);

  // A checkout nobody finished took no money and needs nothing from the team.
  const paid = useMemo(() => enrollments?.filter((e) => e.status !== "unpaid"), [enrollments]);
  const timelineSteps = useMemo(() => steps.filter(isCourseStep).map((s) => (s.approval?.state === "pending" ? { ...s, approval: undefined } : s)), [steps]);

  return (
    <>
      <PageHeader eyebrow="Course team" title="Refunds and learners" description="Policy decides when a refund is due. A person approves it here before any money moves." />
      <p data-testid="team-access-rule" className="mb-4 flex items-start gap-2 rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
        <ShieldAlert className="mt-0.5 size-4 shrink-0 text-zinc-500" />
        <span>This page sits behind a passcode that is printed for judges on the home page, so judges can approve a refund without an account. Learners&rsquo; emails never reach it. This app only runs on PayPal&rsquo;s sandbox, so no real money can move. A real course would use staff logins instead.</span>
      </p>
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-4">
          {!enrollments ? <SkeletonCard /> : null}
          {paid?.length === 0 ? <EmptyState icon={<Users className="size-5" />} title="No learners yet" description="Buy the course to see someone here." /> : null}
          {paid?.map((enrollment) => (
            <EnrollmentCard key={enrollment.id} enrollment={enrollment} onChange={load} />
          ))}
        </div>
        <div className="min-w-0 lg:sticky lg:top-6 lg:self-start">
          <ToolCallTimeline steps={timelineSteps} className="max-h-[760px] min-h-[320px]" emptyDescription="PayPal calls and approvals show up here as they happen." />
        </div>
      </div>
    </>
  );
}
