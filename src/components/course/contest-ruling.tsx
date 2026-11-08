"use client";

import { useState } from "react";
import { Scale } from "lucide-react";
import { showError } from "@/components/error-toast";
import { useKit } from "@/components/kit/kit-provider";
import { useToast } from "@/components/toast";
import { Badge, Button, Field, Textarea } from "@/components/ui";
import { learnerLineText } from "@/lib/course/contest-rules";
import type { EnrollmentView } from "@/lib/course/types";

/** The course team's side of a contested rubric line: the learner's case, their answer's quote, and a ruling. */
export function ContestRuling({ enrollment, onRuled }: { enrollment: EnrollmentView; onRuled: () => void }) {
  const { kitFetch } = useKit();
  const { toast } = useToast();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const contest = enrollment.contest;
  if (!contest) return null;
  const line = learnerLineText(contest.itemId);
  const attempt = enrollment.attempts.find((a) => a.number === contest.attempt);
  const graded = attempt?.runs[attempt.shownRun].items.find((item) => item.id === contest.itemId);

  if (contest.ruling || contest.withdrawnAt) {
    return (
      <p data-testid="team-contest-done" className="flex flex-wrap items-center gap-2 text-sm text-zinc-600">
        <Scale className="size-4 text-zinc-500" aria-hidden /> Contest of &ldquo;{line}&rdquo;:{" "}
        {contest.ruling ? `${contest.ruling.upheld ? "upheld" : "not upheld"}, score ${contest.ruling.scoreBefore} to ${contest.ruling.scoreAfter}.` : "withdrawn when the learner took the retake."}
      </p>
    );
  }

  async function rule(upheld: boolean) {
    setBusy(true);
    try {
      await kitFetch(`/api/enrollments/${enrollment.id}/contest/ruling`, { json: { upheld, note } });
      onRuled();
    } catch (e) {
      showError(toast, "The ruling didn't save", e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div data-testid="team-contest" className="space-y-3 rounded-lg border border-brand-200 bg-brand-50/40 p-3 text-sm">
      <p className="flex flex-wrap items-center gap-2 font-medium text-zinc-900">
        <Scale className="size-4 text-brand" aria-hidden /> The learner contests a line from attempt {contest.attempt}
        <Badge tone="warning">Needs a ruling</Badge>
      </p>
      <dl className="space-y-1 text-zinc-700">
        <div>
          <dt className="inline font-medium">Line: </dt>
          <dd className="inline">
            {line} (graded {graded?.verdict === "partial" ? "partial" : "missed"})
          </dd>
        </div>
        {graded?.quote ? (
          <div>
            <dt className="inline font-medium">The grader quoted: </dt>
            <dd className="inline italic">&ldquo;{graded.quote}&rdquo;</dd>
          </div>
        ) : null}
        <div>
          <dt className="inline font-medium">The learner says: </dt>
          <dd className="inline">{contest.note}</dd>
        </div>
      </dl>
      <Field label="Your note to the learner" htmlFor={`contest-note-${enrollment.id}`}>
        <Textarea id={`contest-note-${enrollment.id}`} data-testid="contest-ruling-note" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" loading={busy} disabled={!note.trim()} onClick={() => rule(true)} data-testid="contest-uphold">
          Uphold: the line counts as met
        </Button>
        <Button size="sm" variant="secondary" loading={busy} disabled={!note.trim()} onClick={() => rule(false)} data-testid="contest-reject">
          Keep the grade
        </Button>
      </div>
      <p className="text-xs text-zinc-500">Upholding changes only this line. Code adds the attempt up again with the same rules.</p>
    </div>
  );
}
