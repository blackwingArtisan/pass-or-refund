"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { Fingerprint, Scale } from "lucide-react";
import { showError } from "@/components/error-toast";
import { useKit } from "@/components/kit/kit-provider";
import { useToast } from "@/components/toast";
import { Badge, Button, Field, Select, Textarea } from "@/components/ui";
import { CONTEST_NOTE_MAX, contestableAttempt, learnerLineText } from "@/lib/course/contest-rules";
import { shortfallItems } from "@/lib/course/policy";
import type { EnrollmentView, RubricLock } from "@/lib/course/types";
import type { CohortResponse } from "./cohort-screen";

/** "3f2a9c1e04b7" -> "3f2a 9c1e 04b7", easier to compare by eye. */
const grouped = (fingerprint: string) => fingerprint.match(/.{1,4}/g)!.join(" ");

/** The rubric terms a learner is graded on: on the course page before buying, then on the receipt and certificate. */
export function RubricTerms({ lock, before = false, className = "" }: { lock?: Pick<RubricLock, "version" | "fingerprint"> & { lockedAt?: string }; before?: boolean; className?: string }) {
  if (!lock) return null;
  const when = lock.lockedAt ? new Date(lock.lockedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "";
  return (
    <span data-testid="rubric-terms" className={`inline-flex flex-wrap items-center gap-x-1.5 ${className}`}>
      <Fingerprint className="size-3.5 shrink-0 text-brand" aria-hidden />
      <span>
        {before ? "You're graded on " : "Graded on "}rubric <span data-testid="rubric-version">v{lock.version}</span>, fingerprint{" "}
        <code data-testid="rubric-fingerprint" className="font-mono text-zinc-900">{grouped(lock.fingerprint)}</code>
        {before ? ". It's locked when you buy, so the terms can't change after." : `, locked when you bought${when ? ` on ${when}` : ""}.`}{" "}
        {before ? (
          <Link href="/rubric" className="font-medium text-brand underline" data-testid="read-rubric">
            Read the full rubric
          </Link>
        ) : (
          <Link href={`/rubric?v=${encodeURIComponent(lock.version)}&fp=${encodeURIComponent(lock.fingerprint)}`} className="font-medium text-brand underline" data-testid="check-fingerprint">
            Check it against the public rubric
          </Link>
        )}
      </span>
    </span>
  );
}

/** The course page shows the rubric on sale today, so a buyer can match it on their receipt. */
export function RubricOnSale() {
  const { status } = useKit();
  return <RubricTerms lock={status?.rubric} before className="text-xs text-zinc-600" />;
}

/** The learner's one contest, before it's sent. */
export function ContestLine({ enrollment, onChange }: { enrollment: EnrollmentView; onChange: (next: EnrollmentView) => void }) {
  const { kitFetch } = useKit();
  const { toast } = useToast();
  const attempt = contestableAttempt(enrollment);
  const lines = attempt ? shortfallItems(attempt) : [];
  const [itemId, setItemId] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  if (enrollment.contest || !attempt) return null;

  async function send(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      onChange(await kitFetch<EnrollmentView>(`/api/enrollments/${enrollment.id}/contest`, { json: { itemId, note } }));
    } catch (err) {
      showError(toast, "Your contest wasn't sent", err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <details data-testid="contest-line" className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm">
      <summary className="cursor-pointer font-medium text-zinc-900">
        <Scale className="mr-1.5 inline size-4 text-brand" aria-hidden />
        Think a line was marked wrong? Contest it once, before your retake
      </summary>
      <form onSubmit={send} className="mt-3 space-y-3">
        <p className="text-zinc-600">A person on the course team reads your answer against the line and rules on it. If they agree, the line counts as met and your score is added up again.</p>
        <Field label="The line" htmlFor="contest-item">
          <Select id="contest-item" data-testid="contest-item" value={itemId} onChange={(e) => setItemId(e.target.value)}>
            <option value="">Pick the line you lost points on</option>
            {lines.map((item) => (
              <option key={item.id} value={item.id}>
                {learnerLineText(item.id)} ({item.verdict === "partial" ? "partial" : "missed"})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Why you think it was marked wrong" htmlFor="contest-note" hint={`Point to the words in your answer. Up to ${CONTEST_NOTE_MAX} characters.`}>
          <Textarea id="contest-note" data-testid="contest-note" value={note} maxLength={CONTEST_NOTE_MAX} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <Button type="submit" variant="secondary" loading={busy} disabled={!itemId || !note.trim()} data-testid="contest-send">
          Send it to the course team
        </Button>
      </form>
    </details>
  );
}

/** Where the learner's contest stands. It stays on the page after the ruling. */
export function ContestStatus({ enrollment }: { enrollment: EnrollmentView }) {
  const contest = enrollment.contest!;
  const line = `“${learnerLineText(contest.itemId)}”`;
  const ruling = contest.ruling;
  return (
    <div data-testid="contest-status" className="rounded-xl bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
      <p className="flex flex-wrap items-center gap-2 font-medium text-zinc-900">
        <Scale className="size-4 text-brand" aria-hidden /> Your contest of {line}
        {ruling ? <Badge tone={ruling.upheld ? "success" : "neutral"}>{ruling.upheld ? "Upheld" : "Not upheld"}</Badge> : contest.withdrawnAt ? <Badge tone="neutral">Withdrawn</Badge> : <Badge tone="warning">With the course team</Badge>}
      </p>
      {ruling ? (
        <p data-testid="contest-ruling" className="mt-1">
          {ruling.upheld ? `The course team agreed, so the line counts as met. Your score went from ${ruling.scoreBefore} to ${ruling.scoreAfter}.` : `The course team kept the grade at ${ruling.scoreBefore}.`} Their note: {ruling.note}
        </p>
      ) : contest.withdrawnAt ? (
        <p className="mt-1">You took your retake before the course team ruled, so the contest was withdrawn.</p>
      ) : (
        <p className="mt-1">A person on the course team will rule on it. You can still take your retake now, but that withdraws the contest.</p>
      )}
    </div>
  );
}

/** Pass and refund rates from the cohort page, for a buyer to read before paying. */
export function CohortStats() {
  const { kitFetch } = useKit();
  const [cohort, setCohort] = useState<CohortResponse | null>(null);
  useEffect(() => {
    let live = true;
    kitFetch<CohortResponse>("/api/team/cohort")
      .then((c) => live && setCohort(c))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [kitFetch]);
  const course = cohort?.courses[0];
  if (!cohort || !course) return null;
  const percent = (part: number) => `${Math.round((part / Math.max(1, course.learners)) * 100)}%`;
  return (
    <div data-testid="cohort-stats" className="grid grid-cols-3 gap-2 text-center">
      {[
        ["Passed", percent(course.passed), "cohort-pass-rate"],
        ["Refunded", percent(course.refunds), "cohort-refund-rate"],
        ["Graded", String(cohort.learners.graded), "cohort-learners"],
      ].map(([label, value, id]) => (
        <div key={id} className="rounded-xl bg-zinc-50 px-3 py-2">
          <p className="text-xs text-zinc-500">{label}</p>
          <p data-testid={id} className="font-semibold tabular-nums text-zinc-900">{value}</p>
        </div>
      ))}
      <p className="col-span-3 text-xs text-zinc-500">
        From <a href="/cohort" className="underline">the cohort page</a>: <span data-testid="cohort-who">{cohort.learners.line}</span>, all graded on the same rubric.
      </p>
    </div>
  );
}
