"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Download, Fingerprint, Printer } from "lucide-react";
import { useKit } from "@/components/kit/kit-provider";
import { PageHeader } from "@/components/shell/app-shell";
import { Button, ButtonLink, buttonClass, Card, CardBody, CardHeader, EmptyState, SkeletonCard } from "@/components/ui";
import type { GradeReceipt } from "@/lib/course/grade-receipt";
import type { EnrollmentView } from "@/lib/course/types";
import { shownFor } from "./course-shown";

const grouped = (hash: string, chars = 12) => hash.slice(0, chars).match(/.{1,4}/g)!.join(" ");
const VERDICT = { met: "Met", partial: "Partly met", not_met: "Not met" } as const;
const OUTCOME = { pass: "passed", fail: "not passed", review: "sent to a person for review" } as const;
const day = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

/** The printable grade receipt, with the same JSON a learner downloads. */
export function GradeReceiptScreen({ id }: { id: string }) {
  const { kitFetch } = useKit();
  const [receipt, setReceipt] = useState<GradeReceipt | null>(null);
  const [lines, setLines] = useState<Record<string, string>>({});
  const [missing, setMissing] = useState(false);
  const [notYours, setNotYours] = useState(false);

  useEffect(() => {
    let live = true;
    Promise.all([kitFetch<GradeReceipt>(`/api/enrollments/${id}/receipt`), kitFetch<EnrollmentView>(`/api/enrollments/${id}`)])
      .then(([r, enrollment]) => {
        if (!live) return;
        setReceipt(r);
        setLines(Object.fromEntries(shownFor(enrollment).rubric.questions.flatMap((q) => q.items.map((item) => [item.id, item.text]))));
      })
      .catch((e) => live && ((e as { status?: number }).status === 403 ? setNotYours(true) : setMissing(true)));
    return () => {
      live = false;
    };
  }, [id, kitFetch]);

  if (notYours) return <EmptyState title="This grade receipt is the learner's" description="Only the learner's own browser, the one that bought the course, and the course team can open it." action={<Link href="/course" className="text-sm font-medium text-brand">Back to the course</Link>} />;
  if (missing) return <EmptyState title="We can't find that enrollment" description="It may have been cleared." action={<Link href="/course" className="text-sm font-medium text-brand">Back to the course</Link>} />;
  if (!receipt) return <SkeletonCard />;

  return (
    <div data-testid="grade-receipt" data-receipt-hash={receipt.receiptHash}>
      <PageHeader
        eyebrow="Grade receipt"
        title={receipt.course.title}
        description={`${receipt.learnerName}'s attempts, how each line was graded, and any refund. Anyone can check this receipt on the public rubric page.`}
        actions={
          <div className="flex flex-wrap gap-2 print:hidden">
            <a href={`/api/enrollments/${id}/receipt?download=1`} download className={buttonClass("secondary", "md")} data-testid="receipt-download">
              <Download className="size-4" aria-hidden /> Download JSON
            </a>
            <Button variant="secondary" icon={<Printer className="size-4" />} onClick={() => window.print()} data-testid="receipt-print">
              Print
            </Button>
            <ButtonLink href="/rubric#receipt-check" variant="secondary" data-testid="receipt-check-link">
              Check a receipt
            </ButtonLink>
          </div>
        }
      />
      <Card className="mb-6">
        <CardBody className="grid gap-3 text-sm text-zinc-700 sm:grid-cols-2">
          <p className="flex flex-wrap items-center gap-x-1.5">
            <Fingerprint className="size-4 text-brand" aria-hidden /> Rubric v{receipt.rubric.version}, fingerprint{" "}
            <span>
              <code className="font-mono text-zinc-900" data-testid="receipt-fingerprint">
                {grouped(receipt.rubric.fingerprint)}
              </code>
              , pass mark {receipt.rubric.passMark}
            </span>
          </p>
          <p>
            Receipt hash{" "}
            <code className="font-mono text-zinc-900" data-testid="receipt-hash">
              {grouped(receipt.receiptHash, 16)}
            </code>
          </p>
          <p>
            Refund:{" "}
            {receipt.refund ? (
              <>
                PayPal refund <code className="font-mono text-zinc-900" data-testid="receipt-refund-id">{receipt.refund.refundId}</code>
                {receipt.refund.amountCents ? `, $${(receipt.refund.amountCents / 100).toFixed(2)}` : ""}
                {receipt.refund.status ? `, ${receipt.refund.status.toLowerCase()}` : ""}
              </>
            ) : (
              "none"
            )}
          </p>
          <p>Issued {day(receipt.issuedAt)}</p>
        </CardBody>
      </Card>
      <div className="space-y-4">
        {receipt.attempts.length === 0 ? <p className="text-sm text-zinc-500">No attempts graded yet.</p> : null}
        {receipt.attempts.map((attempt) => (
          <Card key={attempt.number} data-testid="receipt-attempt" className="break-inside-avoid">
            <CardHeader
              title={`Attempt ${attempt.number}: ${attempt.score} of 100, ${OUTCOME[attempt.outcome]}`}
              description={`Submitted ${day(attempt.submittedAt)}`}
            />
            <CardBody className="space-y-3 text-sm">
              <ul className="space-y-1.5 text-zinc-700">
                {attempt.items.map((item) => (
                  <li key={item.id} className="flex gap-3" data-testid="receipt-item" data-verdict={item.verdict}>
                    <span className="w-24 shrink-0 font-medium text-zinc-900">{VERDICT[item.verdict]}</span>
                    <span className="w-16 shrink-0 tabular-nums text-zinc-500">
                      {item.points} of {item.of}
                    </span>
                    <span>{lines[item.id] ?? item.id}</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-zinc-500">
                Attempt hash <code className="font-mono" data-testid="receipt-attempt-hash">{grouped(attempt.attemptHash, 16)}</code>, answers hash <code className="font-mono">{grouped(attempt.answersHash, 16)}</code>
              </p>
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}
