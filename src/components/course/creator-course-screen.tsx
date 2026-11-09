"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CircleAlert, Fingerprint, Send } from "lucide-react";
import { showError } from "@/components/error-toast";
import { useKit } from "@/components/kit/kit-provider";
import { PageHeader } from "@/components/shell/app-shell";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, Field, SkeletonCard, Textarea } from "@/components/ui";
import { MAX_ANSWER_CHARS } from "@/lib/course/policy";
import type { GradedAttempt } from "@/lib/course/types";
import type { Rubric } from "@/lib/grading/frozen/score-items";

interface CourseView {
  id: string;
  fingerprint: string;
  rubric: Rubric;
  notes: string;
}

const grouped = (fingerprint: string) => fingerprint.match(/.{1,4}/g)?.join(" ") ?? fingerprint;

const VERDICT: Record<string, { label: string; tone: "success" | "warning" | "danger" }> = {
  met: { label: "Met", tone: "success" },
  partial: { label: "Partial", tone: "warning" },
  not_met: { label: "Missed", tone: "danger" },
};

const OUTCOME = { pass: "Passed", fail: "Not passed", review: "Goes to a person" } as const;

/** A creator's course at its shared link: the public rubric, its fingerprint, and a graded final check. */
export function CreatorCourseScreen({ id }: { id: string }) {
  const { kitFetch } = useKit();
  const { toast } = useToast();
  const [course, setCourse] = useState<CourseView | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<(GradedAttempt & { fingerprint: string }) | null>(null);
  const [grading, setGrading] = useState(false);

  useEffect(() => {
    let live = true;
    kitFetch<CourseView>(`/api/creator/courses/${encodeURIComponent(id)}`)
      .then((c) => live && setCourse(c))
      .catch((error: Error) => live && setProblem(error.message));
    return () => {
      live = false;
    };
  }, [id, kitFetch]);

  if (problem) return <EmptyState icon={<CircleAlert className="size-5" />} title="This course link doesn't work" description={problem} action={<Link href="/creator" className="text-sm font-medium text-brand underline">Set up a course</Link>} />;
  if (!course) return <SkeletonCard />;

  const { rubric } = course;
  const nothingWritten = rubric.questions.every((q) => !(answers[q.id] ?? "").trim());
  const run = result ? result.runs[result.shownRun] : null;

  async function submit() {
    setGrading(true);
    try {
      setResult(await kitFetch<GradedAttempt & { fingerprint: string }>(`/api/creator/courses/${encodeURIComponent(id)}/grade`, { method: "POST", json: { answers } }));
    } catch (error) {
      showError(toast, "Your answers weren't graded", error);
    } finally {
      setGrading(false);
    }
  }

  return (
    <>
      <PageHeader eyebrow="A creator's course" title={rubric.title} description={`Pass mark ${rubric.passMark} out of 100. Graded by the same sealed grader as the sample course; code adds up the points.`} />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-6">
          {result && run ? (
            <Card data-testid="creator-result">
              <CardHeader
                title={`${result.score} / 100`}
                description={`Graded against the rubric with fingerprint ${grouped(result.fingerprint)}.`}
                action={<Badge tone={result.outcome === "pass" ? "success" : result.outcome === "review" ? "warning" : "danger"}>{OUTCOME[result.outcome]}</Badge>}
              />
              <CardBody className="space-y-4">
                {rubric.questions.map((q, qi) => (
                  <div key={q.id}>
                    <p className="text-sm font-semibold text-zinc-900">Question {qi + 1}</p>
                    <ul className="mt-1.5 space-y-1.5">
                      {q.items.map((item) => {
                        const scored = run.items.find((s) => s.id === item.id);
                        const verdict = VERDICT[scored?.verdict ?? "not_met"];
                        return (
                          <li key={item.id} data-testid={`creator-line-${item.id}`} className="rounded-lg border border-zinc-100 px-3 py-2 text-sm">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-zinc-800">{item.text}</span>
                              <span className="flex shrink-0 items-center gap-2 tabular-nums text-zinc-500">
                                {scored?.points ?? 0}/{item.points} <Badge tone={verdict.tone}>{verdict.label}</Badge>
                              </span>
                            </div>
                            {scored?.quote ? <p className="mt-1 border-l-2 border-zinc-200 pl-2 text-zinc-500 italic">&ldquo;{scored.quote}&rdquo;</p> : null}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </CardBody>
            </Card>
          ) : null}
          <Card id="final-check">
            <CardHeader title="Final check" description="Write in your own words." />
            <CardBody className="space-y-5">
              {rubric.questions.map((q, qi) => (
                <Field key={q.id} label={`Question ${qi + 1}`} hint={q.text} htmlFor={`cc-${q.id}`}>
                  <Textarea id={`cc-${q.id}`} data-testid={`creator-answer-${q.id}`} rows={4} maxLength={MAX_ANSWER_CHARS} value={answers[q.id] ?? ""} disabled={grading} onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))} />
                </Field>
              ))}
              <Button data-testid="creator-submit" icon={<Send className="size-4" />} loading={grading} disabled={nothingWritten} onClick={submit}>
                {grading ? "Grading your answers" : "Submit for grading"}
              </Button>
            </CardBody>
          </Card>
        </div>
        <Card className="self-start">
          <CardHeader title="The rubric" description="Public, before anyone answers." />
          <CardBody className="space-y-4 text-sm">
            <div className="flex items-center gap-2 rounded-lg bg-zinc-50 px-3 py-2">
              <Fingerprint className="size-4 text-brand" />
              <span className="text-zinc-500">Fingerprint</span>
              <code data-testid="creator-course-fingerprint" className="font-mono font-semibold text-zinc-900">{grouped(course.fingerprint)}</code>
            </div>
            {rubric.questions.map((q, qi) => (
              <div key={q.id} data-testid="creator-rubric-question">
                <p className="font-medium text-zinc-900">
                  {qi + 1}. {q.text} <span className="font-normal text-zinc-500">({q.points} points)</span>
                </p>
                <ul className="mt-1 space-y-0.5 text-zinc-600">
                  {q.items.map((item) => (
                    <li key={item.id}>
                      {item.points} &middot; {item.text}
                    </li>
                  ))}
                  {q.caps.map((cap) => (
                    <li key={cap.id} className="text-amber-800">
                      At most {cap.max} if: {cap.text}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
