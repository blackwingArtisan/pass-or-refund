/**
 * Mock grades, used only when AI is in mock mode. The sample answers replay verdicts a Sonnet
 * subagent gave through the sealed prompt, so their quotes and scores are realistic. Borderline has
 * three: two real, and a third built from the first with q2b dropped to partial, so the median
 * lands on 69 and shows the human-review band.
 * Anything typed by hand scores partial on every answered item, which is a failing grade.
 */
import { assertNoMockOutage } from "@/lib/ai/mock-outage";
import { rubric } from "@/lib/course/content";
import { sampleIdOf } from "@/lib/course/samples";
import verdicts from "./mock-verdicts.json";
import type { ChecklistGrade } from "./frozen/schemas";
import type { Answers } from "./frozen/score-items";

const RECORDED = verdicts as Record<string, ChecklistGrade[]>;

function typedByHand(answers: Answers): ChecklistGrade {
  const items = rubric.questions.flatMap((q) => {
    const answer = (answers[q.id] ?? "").trim();
    return q.items.map((item) => ({ id: item.id, verdict: answer ? ("partial" as const) : ("not_met" as const), quote: answer.slice(0, 60) }));
  });
  const caps = rubric.questions.flatMap((q) => q.caps.map((cap) => ({ id: cap.id, triggered: false, quote: "" })));
  return { items, caps, injection_attempted: false, injection_quote: "" };
}

export function mockGrade(answers: Answers, run: number): ChecklistGrade {
  assertNoMockOutage();
  const sample = sampleIdOf(answers);
  const recorded = sample ? RECORDED[sample] : undefined;
  return recorded?.[run % recorded.length] ?? typedByHand(answers);
}
