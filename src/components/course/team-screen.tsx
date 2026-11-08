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
import { isCourseStep } from "@/lib/course/scope";
import type { Attempt, EnrollmentStatus, EnrollmentView } from "@/lib/course/types";

const STATUS: Record<EnrollmentStatus, { label: string; tone: Tone }> = {
  unpaid: { label: "Not paid", tone: "neutral" },
  active: { label: "Studying", tone: "info" },
  passed: { label: "Passed", tone: "success" },
  under_review: { label: "Needs review", tone: "warning" },
  refund_pending: { label: "Refund needs approval", tone: "warning" },
  refund_declined: { label: "Refund declined", tone: "danger" },
  refund_blocked: { label: "Refund blocked", tone: "danger" },
  refunded: { label: "Refunded", tone: "success" },
};

const VERDICT_LABEL: Record<string, string> = { partial: "Partial", not_met: "Missed" };

/** A 69-70 attempt. Every item that lost points gets its own tick before either button opens. */
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
              {enrollment.learnerEmail}. Paid {enrollment.payment?.capturedCents === undefined ? "nothing yet" : formatCents(enrollment.payment.capturedCents)}. {enrollment.attempts.length === 0 ? "No attempts yet." : `Scores: ${enrollment.attempts.map((a) => a.score).join(", ")}.`}
            </p>
          </div>
          <span className="flex items-center gap-3">
            <Badge tone={status.tone}>{status.label}</Badge>
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
        {enrollment.refund?.refundId ? (
          <p className="font-mono text-xs text-zinc-500">
            Refund {enrollment.refund.refundId}, {enrollment.refund.refundStatus}
          </p>
        ) : null}
      </CardBody>
    </Card>
  );
}

export function TeamScreen() {
  const { kitFetch } = useKit();
  const { steps } = useTimeline();
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
        <span>This page is open to anyone on purpose, so judges can approve a refund without an account. This app only runs on PayPal&rsquo;s sandbox, so no real money can move. A real course would put this page behind a staff login.</span>
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
