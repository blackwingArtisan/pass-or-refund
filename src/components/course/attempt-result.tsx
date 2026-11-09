import { Badge, type Tone } from "@/components/ui";
import { learnerLineText } from "@/lib/course/contest-rules";
import { lessonForItem, lessons } from "@/lib/course/content";
import { decidingItemId } from "@/lib/course/screen-order";
import { useCourseShown } from "./course-shown";
import type { Attempt } from "@/lib/course/types";
import type { Outcome } from "@/lib/grading/decide";
import type { ScoredItem, Verdict } from "@/lib/grading/frozen/score-items";

const VERDICT: Record<Verdict, { label: string; tone: Tone }> = {
  met: { label: "Met", tone: "success" },
  partial: { label: "Partial", tone: "warning" },
  not_met: { label: "Missed", tone: "danger" },
};

const OUTCOME: Record<Outcome, { label: string; tone: Tone }> = {
  pass: { label: "Passed", tone: "success" },
  fail: { label: "Not passed", tone: "danger" },
  review: { label: "Under review", tone: "warning" },
};

function ItemRow({ item, text, points, quoted }: { item: ScoredItem; text: string; points: number; quoted: boolean }) {
  const verdict = VERDICT[item.verdict];
  return (
    <li data-testid={`item-${item.id}`} data-verdict={item.verdict} className="py-2.5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-zinc-800">{text}</p>
        <span className="flex shrink-0 items-center gap-2">
          <span className="font-mono text-xs tabular-nums text-zinc-500">
            {item.points}/{points}
          </span>
          <Badge tone={verdict.tone}>{verdict.label}</Badge>
        </span>
      </div>
      {quoted && item.quote ? (
        <blockquote data-testid="deciding-quote" className="mt-1 border-l-2 border-brand-200 pl-3 text-sm italic text-zinc-600">
          &ldquo;{item.quote}&rdquo;
        </blockquote>
      ) : null}
    </li>
  );
}

/** Each question as a result: every rubric line with its verdict, the one deciding quote, then the study list. */
export function AttemptResult({ attempt }: { attempt: Attempt }) {
  const run = attempt.runs[attempt.shownRun];
  const outcome = OUTCOME[attempt.outcome];
  const missed = run.items.filter((item) => item.verdict === "not_met");
  const { rubric, sample } = useCourseShown();
  const itemText = Object.fromEntries(rubric.questions.flatMap((q) => q.items.map((item) => [item.id, learnerLineText(item.id, rubric)])));

  return (
    <div data-testid={`attempt-${attempt.number}`} className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-zinc-900">Attempt {attempt.number}</h3>
          <p className="text-sm text-zinc-500">{attempt.runs.length > 1 ? "This was close, so it was graded three times. The middle score counts." : `Pass mark ${rubric.passMark} out of 100.`}</p>
          <p data-testid={`grader-${attempt.number}`} className="text-xs text-zinc-500">
            {run.mocked ? "Graded against the public rubric. Code added up the points." : `Graded by ${run.model ?? "Claude"} against the public rubric. Code added up the points.`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-2xl font-semibold tabular-nums text-zinc-900" data-testid={`score-${attempt.number}`}>
            {attempt.score}
            <span className="text-base font-normal text-zinc-400"> / 100</span>
          </p>
          <Badge tone={outcome.tone}>{outcome.label}</Badge>
        </div>
      </div>

      {attempt.settled ? (
        <p data-testid="settled-note" className="rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
          A person on the course team went through this attempt and decided it {attempt.settled.outcome === "pass" ? "passes" : "doesn't pass"}. Their note: {attempt.settled.note}
        </p>
      ) : null}

      {attempt.nearCopyOf !== undefined ? (
        <p data-testid="near-copy" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          This attempt is nearly the same as attempt {attempt.nearCopyOf}, so it counts as incomplete.
        </p>
      ) : null}

      {attempt.flagged ? (
        <p data-testid="flagged" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          This attempt tried to instruct the grader, so that part earned nothing and the guarantee no longer applies.
          {attempt.injectionQuote ? <span className="mt-1 block italic">&ldquo;{attempt.injectionQuote}&rdquo;</span> : null}
        </p>
      ) : null}

      <div className="space-y-4">
        {rubric.questions.map((question, index) => {
          const caps = question.caps.filter((cap) => run.caps.some((c) => c.id === cap.id && c.triggered));
          const scoredHere = run.items.filter((i) => question.items.some((item) => item.id === i.id));
          const deciding = decidingItemId(scoredHere, Object.fromEntries(question.items.map((item) => [item.id, item.points])));
          const otherQuotes = scoredHere.filter((i) => i.quote && i.id !== deciding);
          return (
            <div key={question.id} data-testid={`question-${attempt.number}-${question.id}`} className="rounded-lg border border-zinc-200 px-4 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm font-semibold text-zinc-900">Question {index + 1}</p>
                <p className="font-mono text-sm tabular-nums text-zinc-600">
                  {run.perQuestion[question.id]}/{question.points}
                </p>
              </div>
              <ul className="divide-y divide-zinc-100">
                {question.items.map((item) => {
                  const scored = run.items.find((i) => i.id === item.id);
                  return scored ? <ItemRow key={item.id} item={scored} text={learnerLineText(item.id, rubric)} points={item.points} quoted={scored.id === deciding} /> : null;
                })}
              </ul>
              <details data-testid={`answer-details-${attempt.number}-${question.id}`} className="group mt-1 text-sm">
                <summary className="cursor-pointer select-none text-xs font-medium text-brand hover:underline">Show every quote and my answer</summary>
                {otherQuotes.length > 0 ? (
                  <ul className="mt-2 space-y-1.5 text-zinc-600">
                    {otherQuotes.map((item) => (
                      <li key={item.id}>
                        <span className="text-zinc-800">{learnerLineText(item.id, rubric)}:</span> <q className="italic">{item.quote}</q>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <p className="mt-2 text-xs font-medium text-zinc-500">Your answer</p>
                <p data-testid={`my-answer-${attempt.number}-${question.id}`} className="mt-1 whitespace-pre-wrap rounded-md bg-zinc-50 px-3 py-2 text-zinc-700">
                  {attempt.answers[question.id]?.trim() || "(left blank)"}
                </p>
              </details>
              {caps.map((cap) => (
                <p key={cap.id} className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  Capped at {cap.max} points: {cap.text}.
                </p>
              ))}
            </div>
          );
        })}
      </div>

      {missed.length > 0 ? (
        <div data-testid="study-list" className="rounded-lg bg-zinc-50 p-4">
          <h4 className="font-semibold text-zinc-900">Your study list</h4>
          <ul className="mt-2 space-y-1.5 text-sm text-zinc-700">
            {missed.map((item) => {
              const lesson = sample ? lessons.find((l) => l.number === lessonForItem[item.id]) : undefined;
              return (
                <li key={item.id}>
                  {itemText[item.id]}. {lesson ? <a href={`#lesson-${lesson.number}`} className="font-medium text-brand hover:underline">Lesson {lesson.number}: {lesson.name}</a> : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
