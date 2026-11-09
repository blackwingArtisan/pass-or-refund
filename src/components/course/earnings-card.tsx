"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RefreshCw, Wallet } from "lucide-react";
import { useKit } from "@/components/kit/kit-provider";
import { Button, Card, CardBody, CardHeader, SkeletonCard } from "@/components/ui";
import type { CourseEarnings } from "@/lib/course/course-earnings";
import { formatCents } from "@/lib/course/policy";

const percent = (rate: number) => `${Math.round(rate * 100)}%`;
const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" });

function Figure({ label, value, hint, testId }: { label: string; value: string; hint: string; testId: string }) {
  return (
    <div className="rounded-lg bg-zinc-50 px-3 py-2">
      <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd data-testid={testId} className="mt-0.5 text-xl font-semibold tabular-nums text-zinc-950">
        {value}
      </dd>
      <p className="text-xs text-zinc-500">{hint}</p>
    </div>
  );
}

/**
 * What a course earned, only from PayPal's records: each of its orders read back with GET just now.
 * Sold, refunded, net and the refund rate. The money stays in the seller's PayPal account.
 */
export function EarningsCard({ course, className }: { course: string; className?: string }) {
  const { kitFetch } = useKit();
  const [earnings, setEarnings] = useState<CourseEarnings | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function read() {
    setBusy(true);
    try {
      setEarnings(await kitFetch<CourseEarnings>(`/api/creator/courses/${encodeURIComponent(course)}/earnings`));
      setProblem(null);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "PayPal didn't answer.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    let live = true;
    kitFetch<CourseEarnings>(`/api/creator/courses/${encodeURIComponent(course)}/earnings`)
      .then((e) => live && setEarnings(e))
      .catch((e: Error) => live && setProblem(e.message));
    return () => {
      live = false;
    };
  }, [course, kitFetch]);

  if (!earnings && !problem) return <SkeletonCard />;
  return (
    <Card data-testid="earnings-card" className={className}>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Wallet className="size-4 text-brand" aria-hidden /> What this course earned
          </span>
        }
        description={earnings ? `${earnings.title} at ${formatCents(earnings.priceCents)}. Every figure read back from PayPal just now.` : undefined}
        action={
          <Button size="sm" variant="ghost" icon={<RefreshCw className="size-4" />} loading={busy} onClick={read} data-testid="earnings-reread">
            Read again
          </Button>
        }
      />
      <CardBody className="space-y-3 text-sm">
        {problem ? <p className="text-red-700">{problem}</p> : null}
        {earnings ? (
          <>
            <dl className="grid grid-cols-2 gap-2">
              <Figure label="Sold" value={formatCents(earnings.soldCents)} hint={`${earnings.sales} ${earnings.sales === 1 ? "sale" : "sales"}`} testId="earnings-sold" />
              <Figure label="Refunded" value={formatCents(earnings.refundedCents)} hint={`${earnings.refunds} ${earnings.refunds === 1 ? "refund" : "refunds"}`} testId="earnings-refunded" />
              <Figure label="Net" value={formatCents(earnings.netCents)} hint="Before PayPal's fees" testId="earnings-net" />
              <Figure label="Refund rate" value={percent(earnings.refundRate)} hint={`${earnings.refunds} of ${earnings.sales}`} testId="earnings-refund-rate" />
            </dl>
            {earnings.pendingRefundCents ? <p className="text-xs text-amber-800">{formatCents(earnings.pendingRefundCents)} more is refunding: PayPal reports it PENDING.</p> : null}
            <p data-testid="earnings-source" className="text-xs text-zinc-500">
              Read from PayPal at {clock(earnings.readAt)}: {earnings.calls} × <code className="font-mono">{earnings.call}</code>, counting only orders whose invoice_id carries fingerprint <code className="font-mono">{earnings.fingerprint}</code>.
              {earnings.capped ? " The newest orders only." : ""}
            </p>
            {earnings.orders.length ? (
              <details className="text-xs text-zinc-600" data-testid="earnings-orders">
                <summary className="cursor-pointer font-medium text-zinc-700">The PayPal orders</summary>
                <ul className="mt-1.5 space-y-1">
                  {earnings.orders.map((o) => (
                    <li key={o.orderId} className="flex flex-wrap justify-between gap-x-3 font-mono">
                      <Link href={`/verify?q=${o.orderId}`} className="text-brand underline">
                        {o.orderId}
                      </Link>
                      <span>
                        {formatCents(o.capturedCents)} {o.captureStatus}
                        {o.refundedCents ? `, refund ${formatCents(o.refundedCents)} ${o.refundStatus}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
            <p className="text-xs text-zinc-500">The money stays in the seller&rsquo;s PayPal account. This app doesn&rsquo;t pay creators out.</p>
          </>
        ) : null}
      </CardBody>
    </Card>
  );
}
