"use client";

import { useState } from "react";
import { Scale, Sparkles } from "lucide-react";
import { showError } from "@/components/error-toast";
import { useKit } from "@/components/kit/kit-provider";
import { useToast } from "@/components/toast";
import { Badge, Button, Field, Textarea } from "@/components/ui";
import { learnerLineText } from "@/lib/course/contest-rules";
import type { ContestRecommendation, EnrollmentView } from "@/lib/course/types";

/** Claude's second reading, for the person ruling. It recommends; the buttons below decide. */
function SecondReader({ reading }: { reading?: ContestRecommendation }) {
  if (!reading) {
    return (
      <p data-testid="second-reader-pending" className="flex items-center gap-2 rounded-md bg-white px-3 py-2 text-zinc-600 ring-1 ring-zinc-200">
        <Sparkles className="size-4 animate-pulse text-brand" aria-hidden /> Claude is reading the contest for you…
      </p>
    );
  }
  if (reading.error || !reading.recommendation) {
    return (
      <p data-testid="second-reader-error" className="rounded-md bg-amber-50 px-3 py-2 text-amber-900">
        {reading.error ?? "The second reader had nothing to add. Rule on it from the line and the quotes."}
      </p>
    );
  }
  const uphold = reading.recommendation === "uphold";
  return (
    <div data-testid="second-reader" data-recommendation={reading.recommendation} className="rounded-md bg-white px-3 py-2.5 ring-1 ring-brand-200">
      <p className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-brand-700">
        <Sparkles className="size-3.5" aria-hidden /> Second reader{reading.model ? `: ${reading.model}` : ""}
        <Badge tone={uphold ? "success" : "neutral"}>{uphold ? "Recommends: uphold" : "Recommends: let the grade stand"}</Badge>
      </p>
      <p data-testid="second-reader-reason" className="mt-1 text-zinc-800">
        {reading.reason}
      </p>
      <dl className="mt-1.5 space-y-0.5 text-zinc-600">
        {reading.learnerQuote ? (
          <div>
            <dt className="inline font-medium">From the learner&rsquo;s case: </dt>
            <dd data-testid="second-reader-learner-quote" className="inline italic">
              &ldquo;{reading.learnerQuote}&rdquo;
            </dd>
          </div>
        ) : null}
        <div>
          <dt className="inline font-medium">From their answer: </dt>
          <dd data-testid="second-reader-answer-quote" className="inline italic">
            {reading.answerQuote ? <>&ldquo;{reading.answerQuote}&rdquo;</> : "nothing in the answer does what the line asks"}
          </dd>
        </div>
      </dl>
      <p className="mt-1.5 text-xs text-zinc-500">A recommendation only. You rule, and code applies your ruling. Quotes are checked word for word against the note and the answer.</p>
    </div>
  );
}

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
        {contest.ruling?.readerRecommended ? (
          <span data-testid="team-contest-reader" className="text-zinc-500">
            The second reader had recommended {contest.ruling.readerRecommended === "uphold" ? "upholding" : "letting the grade stand"}
            {(contest.ruling.readerRecommended === "uphold") === contest.ruling.upheld ? "." : "; the person ruled otherwise."}
          </span>
        ) : null}
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
      <SecondReader reading={contest.secondReader} />
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
