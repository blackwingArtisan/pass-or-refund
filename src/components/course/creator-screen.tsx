"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CircleAlert, Copy, Fingerprint, Plus, Trash2 } from "lucide-react";
import { ApiError, useKit } from "@/components/kit/kit-provider";
import { PageHeader } from "@/components/shell/app-shell";
import { Button, Card, CardBody, CardHeader, Field, Input, Textarea } from "@/components/ui";
import { formToInput, LIMITS, PRICE_DOLLARS, type RubricForm } from "@/lib/course/creator-rubric";
import { formatCents } from "@/lib/course/policy";
import { EarningsCard } from "./earnings-card";
import { ExampleCourseLink } from "./example-course-link";

interface Published {
  id: string;
  fingerprint: string;
  path: string;
  title: string;
  priceCents: number;
}

/** "3f2a9c1e04b7" -> "3f2a 9c1e 04b7", easier to compare by eye. */
const grouped = (fingerprint: string) => fingerprint.match(/.{1,4}/g)?.join(" ") ?? fingerprint;

const STARTER: RubricForm = {
  title: "",
  passMark: "70",
  questions: [{ text: "", lines: "" }],
};

/** Courses this browser set up, newest first, so a creator comes back to their earnings. Per browser only. */
const MY_COURSES_KEY = "por_my_courses";
function readMyCourses(): string[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(MY_COURSES_KEY) ?? "[]");
    return Array.isArray(saved) ? saved.filter((id): id is string => typeof id === "string" && id.startsWith("cc_")) : [];
  } catch {
    return [];
  }
}
function rememberCourse(id: string): string[] {
  const mine = [id, ...readMyCourses().filter((c) => c !== id)].slice(0, 5);
  try {
    localStorage.setItem(MY_COURSES_KEY, JSON.stringify(mine));
  } catch {
    // Private windows can refuse storage; the card still shows for this visit.
  }
  return mine;
}

/** A creator sets up their own rubric: no account, no payment. They get its fingerprint and a link to share. */
export function CreatorScreen({ exampleHref }: { exampleHref?: string }) {
  const { kitFetch } = useKit();
  const [mode, setMode] = useState<"form" | "json">("form");
  const [form, setForm] = useState<RubricForm>(STARTER);
  const [pasted, setPasted] = useState("");
  const [notes, setNotes] = useState("");
  const [price, setPrice] = useState(String(PRICE_DOLLARS.default));
  const [problems, setProblems] = useState<string[]>([]);
  const [published, setPublished] = useState<Published | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  // The courses whose earnings show here: ?course=cc_… first, then the ones this browser set up.
  const [mine, setMine] = useState<string[]>([]);

  useEffect(() => {
    const asked = new URLSearchParams(window.location.search).get("course");
    const ids = [...(asked?.startsWith("cc_") ? [asked] : []), ...readMyCourses()];
    // Read once from the address and this browser's storage, after the server's HTML.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMine([...new Set(ids)].slice(0, 3));
  }, []);

  const setQuestion = (index: number, patch: Partial<RubricForm["questions"][number]>) =>
    setForm((f) => ({ ...f, questions: f.questions.map((q, i) => (i === index ? { ...q, ...patch } : q)) }));

  async function publish() {
    setBusy(true);
    setProblems([]);
    setPublished(null);
    try {
      const json = mode === "json" ? { pasted, notes, price } : { rubric: formToInput(form), notes, price };
      const made = await kitFetch<Published>("/api/creator/courses", { method: "POST", json });
      setPublished(made);
      setMine(rememberCourse(made.id).slice(0, 3));
    } catch (error) {
      const listed = error instanceof ApiError ? (error.body.error as { problems?: string[] } | undefined)?.problems : undefined;
      setProblems(listed ?? [error instanceof Error ? error.message : "Something went wrong. Please try again."]);
    } finally {
      setBusy(false);
    }
  }

  const link = published ? `${typeof window === "undefined" ? "" : window.location.origin}${published.path}` : "";

  return (
    <>
      <PageHeader
        eyebrow="For course creators"
        title="Put your own course on the guarantee"
        description="Write the final check's rubric: the questions, and what a good answer says with its points. You get its fingerprint and a link to share. The same grader marks every answer against exactly these words."
        actions={exampleHref ? <ExampleCourseLink href={exampleHref} testId="creator-example-course" where="creator" /> : undefined}
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader
            title="Your rubric"
            description={`Up to ${LIMITS.questions} questions. The points have to add up to 100.`}
            action={
              <div role="tablist" className="inline-flex rounded-lg bg-zinc-100 p-0.5 text-sm">
                {(["form", "json"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="tab"
                    aria-selected={mode === m}
                    data-testid={`creator-mode-${m}`}
                    onClick={() => setMode(m)}
                    className={`rounded-md px-3 py-1 font-medium ${mode === m ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500"}`}
                  >
                    {m === "form" ? "Simple form" : "Paste JSON"}
                  </button>
                ))}
              </div>
            }
          />
          <CardBody className="space-y-5">
            {mode === "form" ? (
              <>
                <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
                  <Field label="Course title" htmlFor="creator-title">
                    <Input id="creator-title" data-testid="creator-title" maxLength={LIMITS.titleChars} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Bread at Home" />
                  </Field>
                  <Field label="Pass mark" htmlFor="creator-pass-mark">
                    <Input id="creator-pass-mark" data-testid="creator-pass-mark" inputMode="numeric" value={form.passMark} onChange={(e) => setForm({ ...form, passMark: e.target.value })} />
                  </Field>
                </div>
                {form.questions.map((q, i) => (
                  <div key={i} data-testid={`creator-question-${i + 1}`} className="space-y-3 rounded-xl border border-zinc-200 p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-zinc-900">Question {i + 1}</p>
                      {form.questions.length > 1 ? (
                        <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" />} onClick={() => setForm({ ...form, questions: form.questions.filter((_, j) => j !== i) })}>
                          Remove
                        </Button>
                      ) : null}
                    </div>
                    <Field label="What the learner is asked" htmlFor={`creator-q${i + 1}-text`}>
                      <Textarea id={`creator-q${i + 1}-text`} data-testid={`creator-q${i + 1}-text`} rows={2} value={q.text} onChange={(e) => setQuestion(i, { text: e.target.value })} />
                    </Field>
                    <Field label="What a good answer says, one line each, points first" hint={'For example: "10 Says the dough has doubled in size"'} htmlFor={`creator-q${i + 1}-lines`}>
                      <Textarea id={`creator-q${i + 1}-lines`} data-testid={`creator-q${i + 1}-lines`} rows={3} value={q.lines} onChange={(e) => setQuestion(i, { lines: e.target.value })} className="font-mono text-[13px]" />
                    </Field>
                  </div>
                ))}
                {form.questions.length < LIMITS.questions ? (
                  <Button variant="secondary" size="sm" icon={<Plus className="size-4" />} data-testid="creator-add-question" onClick={() => setForm({ ...form, questions: [...form.questions, { text: "", lines: "" }] })}>
                    Add a question
                  </Button>
                ) : null}
              </>
            ) : (
              <Field
                label="Rubric JSON"
                hint={
                  <>
                    The same shape as <a href="/rubric" className="underline">the sample course&rsquo;s rubric</a> (download it there): a title, a pass mark, and questions with their items (points and text). Ids are set by position.
                  </>
                }
                htmlFor="creator-json"
              >
                <Textarea id="creator-json" data-testid="creator-json" rows={14} value={pasted} onChange={(e) => setPasted(e.target.value)} className="font-mono text-[13px]" />
              </Field>
            )}
            <Field label="Price in dollars" hint={`From $${PRICE_DOLLARS.min} to $${PRICE_DOLLARS.max}. Learners pay through PayPal, with the same refund guarantee as the sample course.`} htmlFor="creator-price">
              <Input id="creator-price" data-testid="creator-price" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} className="max-w-[140px]" />
            </Field>
            <Field label="What the course teaches (optional)" hint="The grader reads this with the rubric, like the sample course's lessons." htmlFor="creator-notes">
              <Textarea id="creator-notes" data-testid="creator-notes" rows={3} maxLength={LIMITS.notesChars} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
            {problems.length ? (
              <div data-testid="creator-problems" role="alert" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <p className="flex items-center gap-2 font-semibold">
                  <CircleAlert className="size-4" /> Fix these first
                </p>
                <ul className="mt-1.5 list-disc space-y-1 pl-5">
                  {problems.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <Button data-testid="creator-publish" loading={busy} icon={<Fingerprint className="size-4" />} onClick={publish}>
              Get the fingerprint and link
            </Button>
          </CardBody>
        </Card>

        <div className="space-y-4">
          {published ? (
            <Card>
              <CardHeader title="Your course is ready" description={`${published.title}, ${formatCents(published.priceCents)}`} />
              <CardBody className="space-y-3 text-sm">
                <div>
                  <p className="text-xs text-zinc-500">Rubric fingerprint</p>
                  <p data-testid="creator-fingerprint" data-fingerprint={published.fingerprint} className="font-mono text-lg font-semibold text-zinc-900">
                    {grouped(published.fingerprint)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500">Link to share</p>
                  <div className="mt-1 flex items-center gap-2">
                    <Link href={published.path} data-testid="creator-link" className="min-w-0 truncate font-medium text-brand underline">
                      {link}
                    </Link>
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<Copy className="size-3.5" />}
                      onClick={() => {
                        void navigator.clipboard?.writeText(link).then(() => setCopied(true), () => undefined);
                      }}
                    >
                      {copied ? "Copied" : "Copy"}
                    </Button>
                  </div>
                </div>
                <p className="text-zinc-600">Every answer at this link is graded against the rubric with this fingerprint. Change one word and you get a new fingerprint and a new link; this one keeps its rubric.</p>
              </CardBody>
            </Card>
          ) : null}
          {mine.map((id) => (
            <EarningsCard key={id} course={id} />
          ))}
          <Card>
            <CardBody className="space-y-2 text-sm text-zinc-600">
              <p className="font-semibold text-zinc-900">What this sets up</p>
              <p>A course page with your public rubric, its fingerprint and the final check, graded by the same sealed grader as the sample course, with code adding up the points.</p>
              <p>No account is needed. Learners buy at your link through PayPal, under the same guarantee: two honest fails and PayPal refunds them, after a person approves. Paying creators out isn&rsquo;t built yet.</p>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
