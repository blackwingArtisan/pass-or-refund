"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { RotateCcw, Users } from "lucide-react";
import { ApprovalPrompt } from "@/components/agent/approval-prompt";
import { ToolCallTimeline } from "@/components/agent/tool-call-timeline";
import { useKit } from "@/components/kit/kit-provider";
import { useTimeline } from "@/components/kit/use-timeline";
import { PageHeader } from "@/components/shell/app-shell";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, CardBody, EmptyState, SkeletonCard, type Tone } from "@/components/ui";
import { CURRENCY } from "@/lib/course/content";
import { formatCents } from "@/lib/course/policy";
import type { EnrollmentStatus, EnrollmentView } from "@/lib/course/types";

const STATUS: Record<EnrollmentStatus, { label: string; tone: Tone }> = {
  unpaid: { label: "Not paid", tone: "neutral" },
  active: { label: "Studying", tone: "info" },
  passed: { label: "Passed", tone: "success" },
  under_review: { label: "Needs review", tone: "warning" },
  refund_pending: { label: "Refund needs approval", tone: "warning" },
  refund_blocked: { label: "Refund blocked", tone: "danger" },
  refunded: { label: "Refunded", tone: "success" },
};

function EnrollmentCard({ enrollment, onChange }: { enrollment: EnrollmentView; onChange: () => void }) {
  const { kitFetch } = useKit();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const status = STATUS[enrollment.status];

  async function retry() {
    setBusy(true);
    try {
      await kitFetch(`/api/enrollments/${enrollment.id}/refund`, { method: "POST" });
      onChange();
    } catch (e) {
      toast({ title: "Could not request the refund", description: (e as Error).message, variant: "error" });
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
            <Link href={`/learn/${enrollment.id}`} className="text-sm font-medium text-brand hover:underline" data-testid="learner-link">
              Learner view
            </Link>
          </span>
        </div>
        {enrollment.guaranteeVoid ? <p className="text-sm text-red-700">An attempt was flagged for instructing the grader. The guarantee is void.</p> : null}
        {enrollment.approval ? (
          <ApprovalPrompt
            approvalId={enrollment.approval.id}
            summary={enrollment.approval.summary}
            reason={enrollment.approval.reason}
            amount={enrollment.approval.amountValue ? { currency_code: CURRENCY, value: enrollment.approval.amountValue } : undefined}
            onDecided={onChange}
          />
        ) : null}
        {enrollment.status === "refund_blocked" ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-red-50 px-3 py-2">
            <p className="text-sm text-red-900">{enrollment.refund?.error}</p>
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

  const timelineSteps = useMemo(() => steps.filter((s) => s.channel !== "global" || s.kind === "webhook").map((s) => (s.approval?.state === "pending" ? { ...s, approval: undefined } : s)), [steps]);

  return (
    <>
      <PageHeader eyebrow="Course team" title="Refunds and learners" description="Policy decides when a refund is due. A person approves it here before any money moves." />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-4">
          {!enrollments ? <SkeletonCard /> : null}
          {enrollments?.length === 0 ? <EmptyState icon={<Users className="size-5" />} title="No learners yet" description="Buy the course to see someone here." /> : null}
          {enrollments?.map((enrollment) => (
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
