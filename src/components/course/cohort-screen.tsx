"use client";

import { useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { BarChart3 } from "lucide-react";
import type { ColDef } from "ag-grid-community";
import { PageHeader } from "@/components/shell/app-shell";
import { col, DataGrid } from "@/components/data-grid";
import { Badge, ButtonLink, Card, CardBody, CardHeader, EmptyState, SkeletonCard, Stat } from "@/components/ui";
import { usePhone } from "@/components/course/use-phone";
import { formatUsd, type Cohort, type CourseSummary, type ItemSummary, type QuestionSummary, type RefundRow } from "@/lib/course/cohort";
import type { CohortResponse } from "@/lib/course/cohort-response";

export type { CohortResponse };

// With the switch off at build time, next.config.ts points this import at an empty stand-in.
const CohortStudio =
  process.env.NEXT_PUBLIC_SPONSOR_UI === "1"
    ? dynamic(() => import("@/components/course/cohort-studio"), { ssr: false, loading: () => <SkeletonCard /> })
    : null;

const percent = (rate: number) => `${Math.round(rate * 100)}%`;
const percentColumn = <T,>(field: keyof T & string, headerName: string, extra: Partial<ColDef<T>> = {}) =>
  col.text<T>(field, headerName, { type: "rightAligned", filter: "agNumberColumnFilter", maxWidth: 130, valueFormatter: (p) => percent(p.value as number), ...extra });
const numberColumn = <T,>(field: keyof T & string, headerName: string, extra: Partial<ColDef<T>> = {}) =>
  col.text<T>(field, headerName, { type: "rightAligned", filter: "agNumberColumnFilter", maxWidth: 120, ...extra });
const usdColumn = <T,>(field: keyof T & string, headerName: string) => numberColumn<T>(field, headerName, { maxWidth: 130, valueFormatter: (p) => formatUsd(p.value as number) });

const COURSE_COLUMNS: ColDef<CourseSummary>[] = [
  col.text("course", "Course", { minWidth: 240 }),
  numberColumn("learners", "Learners"),
  numberColumn("passed", "Passed"),
  percentColumn("passRate", "Pass rate"),
  numberColumn("attempts", "Attempts"),
  numberColumn("refunds", "Refunds"),
  usdColumn("refundedUsd", "Refunded"),
];

const QUESTION_COLUMNS: ColDef<QuestionSummary>[] = [
  col.text("question", "Question", { minWidth: 240 }),
  numberColumn("answered", "Answers"),
  numberColumn("cleared", "Cleared"),
  percentColumn("passRate", "Pass rate"),
  numberColumn("averagePoints", "Average points", { maxWidth: 150, valueFormatter: (p) => (p.value as number).toFixed(1) }),
  numberColumn("maxPoints", "Out of"),
];

const REFUND_COLUMNS: ColDef<RefundRow>[] = [
  col.date("requestedAt", "Requested"),
  col.text("state", "State", { maxWidth: 190 }),
  col.text("overdue", "Overdue", { maxWidth: 170 }),
  usdColumn("amountUsd", "Refunded"),
  col.text("paypalStatus", "PayPal says", { maxWidth: 190 }),
  col.text("reason", "Reason", { minWidth: 300, tooltipField: "reason" }),
];

const WRAPPED_CELL = { lineHeight: "1.35", paddingTop: 10, paddingBottom: 10 };

/** The columns that still read at phone width. The rest are a tap away on a bigger screen. */
const onPhone = <T,>(columns: ColDef<T>[], keep: (keyof T & string)[], width: Partial<ColDef<T>> = {}): ColDef<T>[] =>
  columns
    .filter((column) => (keep as string[]).includes(String(column.field)))
    .map((column, index) => ({ ...column, minWidth: index === 0 ? 80 : 104, maxWidth: undefined, flex: 1, filter: false, suppressHeaderMenuButton: true, ...(index === 0 ? { wrapText: true, autoHeight: true, cellStyle: WRAPPED_CELL, ...width } : {}) }));

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader title={title} description={description} />
      <CardBody>{children}</CardBody>
    </Card>
  );
}

/**
 * The rubric items learners miss most, as a plain table: it is in the page's first HTML, before any
 * script runs. On a phone only the item and its miss rate show.
 */
function ItemsTable({ items }: { items: ItemSummary[] }) {
  const rows = [...items].sort((a, b) => b.missRate - a.missRate);
  const cell = "px-3 py-2 text-right tabular-nums";
  const wide = "hidden sm:table-cell";
  return (
    <div className="-mx-1 overflow-x-auto">
      <table data-testid="cohort-items-table" className="w-full min-w-0 text-sm">
        <thead className="border-b border-zinc-200 text-xs font-medium uppercase tracking-wide text-zinc-500">
          <tr>
            <th scope="col" className="px-3 py-2 text-left">Rubric item</th>
            <th scope="col" className={`px-3 py-2 text-left ${wide}`}>Lesson</th>
            <th scope="col" className={cell}>Miss rate</th>
            <th scope="col" className={`${cell} ${wide}`}>Partial</th>
            <th scope="col" className={`${cell} ${wide}`}>Missed</th>
            <th scope="col" className={`${cell} ${wide}`}>Points lost</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 text-zinc-800">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-3 py-3 text-zinc-500">No rubric lines graded yet</td>
            </tr>
          ) : null}
          {rows.map((row) => (
            <tr key={row.itemId} data-testid={`cohort-item-${row.itemId}`}>
              <td className="px-3 py-2">{row.item}</td>
              <td className={`px-3 py-2 text-zinc-600 ${wide}`}>{row.lesson}</td>
              <td className={`${cell} font-semibold text-zinc-900`}>{percent(row.missRate)}</td>
              <td className={`${cell} ${wide}`}>{row.partial}</td>
              <td className={`${cell} ${wide}`}>{row.notMet}</td>
              <td className={`${cell} ${wide}`}>{row.pointsLost}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The free view: every number in the dashboard, the items as a plain table and the rest in the kit's AG Grid. */
function CohortTables({ cohort }: { cohort: CohortResponse }) {
  const phone = usePhone();
  const questions = phone ? onPhone(QUESTION_COLUMNS, ["question", "passRate"], { flex: 3 }) : QUESTION_COLUMNS;
  const courses = phone ? onPhone(COURSE_COLUMNS, ["course", "passRate"], { flex: 3 }) : COURSE_COLUMNS;
  const refunds = phone ? onPhone(REFUND_COLUMNS, ["state", "amountUsd", "paypalStatus"]) : REFUND_COLUMNS;
  return (
    <div className="space-y-6" data-testid="cohort-tables">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cohort.courses.map((c) => (
          <Stat key={c.course} label={`Pass rate, ${c.course}`} value={<span data-testid="cohort-pass-rate">{percent(c.passRate)}</span>} hint={`${c.passed} of ${c.learners} learners`} />
        ))}
        <Stat label="Learners tested" value={cohort.sources.learners.length} hint={`${cohort.paidLearners} paid`} />
        <Stat label="Attempts" value={cohort.sources.attempts.length} hint={cohort.flaggedAttempts ? `${cohort.flaggedAttempts} flagged, left out of the rubric numbers` : "None flagged"} />
        <Stat
          label="Refunded"
          value={<span data-testid="cohort-refunded">{formatUsd(cohort.courses.reduce((total, c) => total + c.refundedUsd, 0))}</span>}
          hint={`${cohort.courses.reduce((total, c) => total + c.refunds, 0)} refunds`}
        />
      </div>
      <Section title="Rubric items missed most" description="Partial and missed both count. The lesson is the one to fix first.">
        <ItemsTable items={cohort.items} />
      </Section>
      <Section title="Pass rate by question" description="A question counts as cleared at 70% of its points, the same mark as the whole check.">
        <DataGrid<QuestionSummary> rows={cohort.questions} columns={questions} getRowId={(r) => r.question} height={phone ? 300 : 250} search={false} pageSize={false} />
      </Section>
      <Section title="Pass rate by course" description="Learners who took the final check.">
        <DataGrid<CourseSummary> rows={cohort.courses} columns={courses} getRowId={(r) => r.course} height={150} search={false} pageSize={false} />
      </Section>
      <Section title="Refunds" description="Amounts are what PayPal reported, not what we asked for.">
        <DataGrid<RefundRow> rows={cohort.sources.refunds} columns={refunds} getRowId={(r) => r.id} height={300} search={false} pageSize={false} emptyMessage="No refund requests yet" />
      </Section>
    </div>
  );
}

const when = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/**
 * The course team's side of the guarantee, in public: every refund they declined with the reason
 * they gave, and any refund left waiting past the time they have to decide. No names.
 */
function RefundAccountability({ declines, overdue }: { declines: Cohort["declines"]; overdue: Cohort["overdue"] }) {
  return (
    <div className="mb-6 grid gap-4 lg:grid-cols-2">
      <div data-testid="cohort-declines" className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-700">
        <p className="font-semibold text-zinc-900">
          Refunds declined <span className="font-normal tabular-nums text-zinc-500">({declines.length})</span>
        </p>
        <p className="mt-0.5 text-xs text-zinc-500">Every refund the course team turned down, with the reason the learner was given.</p>
        {declines.length ? (
          <ul className="mt-2 space-y-2">
            {declines.slice(0, 8).map((d) => (
              <li key={d.id} data-testid="cohort-decline" className="border-l-2 border-red-200 pl-3">
                <span className="text-zinc-900">&ldquo;{d.note}&rdquo;</span>
                <span className="block text-xs text-zinc-500">
                  {d.course}, {when(d.at)}, by the {d.by}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-zinc-500">None declined yet.</p>
        )}
      </div>
      <div data-testid="cohort-overdue" className={`rounded-xl border px-4 py-3 text-sm ${overdue.length ? "border-amber-300 bg-amber-50 text-amber-900" : "border-zinc-200 bg-white text-zinc-700"}`}>
        <p className="font-semibold text-zinc-900">
          Waiting on the course team too long <span className="font-normal tabular-nums text-zinc-500">({overdue.length})</span>
        </p>
        <p className="mt-0.5 text-xs text-zinc-500">The guarantee gives the course team one hour to decide. A refund past that shows here until someone acts.</p>
        {overdue.length ? (
          <ul className="mt-2 space-y-1.5">
            {overdue.slice(0, 8).map((o) => (
              <li key={o.id} data-testid="cohort-overdue-row" className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span>
                  {o.course}: {o.state}
                </span>
                <span className="font-semibold tabular-nums">{o.label}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-zinc-500">Nothing overdue.</p>
        )}
      </div>
    </div>
  );
}

/** How many attempts needed more than one grade, and how many a person decided. */
function GradingBands({ grading }: { grading: Cohort["grading"] }) {
  const share = (n: number) => (grading.attempts ? ` (${Math.round((n / grading.attempts) * 100)}%)` : "");
  return (
    <div data-testid="cohort-grading" className="mb-6 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-700">
      <p className="font-semibold text-zinc-900">How the grader decided {grading.attempts} attempts</p>
      <ul className="mt-1.5 grid gap-1 sm:grid-cols-3">
        <li data-testid="cohort-graded-once">
          <span className="font-semibold tabular-nums text-zinc-900">{grading.gradedOnce}</span>
          {share(grading.gradedOnce)} decided by one grade
        </li>
        <li data-testid="cohort-graded-three">
          <span className="font-semibold tabular-nums text-zinc-900">{grading.gradedThreeTimes}</span>
          {share(grading.gradedThreeTimes)} scored 66-73, so graded three times and the middle score kept
        </li>
        <li data-testid="cohort-to-person">
          <span className="font-semibold tabular-nums text-zinc-900">{grading.toPerson}</span>
          {share(grading.toPerson)} landed on 69 or 70 and went to a person
        </li>
      </ul>
    </div>
  );
}

function FixFirst({ item }: { item: ItemSummary }) {
  return (
    <div data-testid="cohort-fix-first" className="mb-6 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-700">
      <span className="font-semibold text-zinc-900">Fix first: </span>
      {item.item}. {percent(item.missRate)} of answers fell short. It&apos;s taught in lesson {item.lesson}.
    </div>
  );
}

/** False in the server's HTML and while hydrating, true after: the studio only draws in a browser. */
const noSubscribe = () => () => {};
const useMounted = () => useSyncExternalStore(noSubscribe, () => true, () => false);

/** The page header while the server builds the numbers. It fetches nothing, so the page never shows two copies. */
export function CohortLoading() {
  return (
    <>
      <PageHeader eyebrow="Course team" title="Cohort results" description="How learners did across every attempt, and which parts of the course to fix." />
      <SkeletonCard />
    </>
  );
}

/** Rendered with the numbers the server built for this request, so the first HTML already holds them. */
export function CohortScreen({ cohort }: { cohort: CohortResponse }) {
  const mounted = useMounted();

  const empty = cohort.sources.attempts.length === 0;
  const worst = cohort.items[0];

  return (
    <>
      <PageHeader
        eyebrow="Course team"
        title="Cohort results"
        description="How learners did across every attempt, and which parts of the course to fix."
        actions={
          cohort.sampleLearners ? (
            <Badge tone="warning">
              {/* The line grows with real learners, so it wraps rather than push a phone sideways. */}
              <span data-testid="sample-cohort-label" className="whitespace-normal">
                In these numbers: {cohort.learners.line}
              </span>
            </Badge>
          ) : null
        }
      />
      {cohort.sampleLearners && cohort.realLearners ? (
        <p data-testid="cohort-drift" className="mb-4 text-sm text-zinc-600">
          The creator&rsquo;s numbers on the home page use the {cohort.sampleLearners} made-up learners only. This page adds the {cohort.realLearners} real {cohort.realLearners === 1 ? "learner" : "learners"} who bought here, so its numbers move as people try the course.
        </p>
      ) : null}
      {empty ? (
        <EmptyState
          icon={<BarChart3 className="size-5" />}
          title="No results yet"
          description="Results show up here as soon as a learner takes the final check."
          action={
            <ButtonLink href="/course" variant="secondary">
              See the course
            </ButtonLink>
          }
        />
      ) : null}
      {!empty ? (
        <>
          {worst && worst.answered > 0 && worst.missRate > 0 ? <FixFirst item={worst} /> : null}
          <GradingBands grading={cohort.grading} />
          <RefundAccountability declines={cohort.declines} overdue={cohort.overdue} />
          {/* The server's HTML holds the plain tables; with the sponsor UI built in, the studio takes over once the page runs. */}
          {CohortStudio && mounted ? <CohortStudio cohort={cohort} /> : <CohortTables cohort={cohort} />}
        </>
      ) : null}
      <p className="mt-6 text-xs text-zinc-500">
        Refunds are approved on the <Link href="/team" className="underline">course team page</Link>.
      </p>
    </>
  );
}
