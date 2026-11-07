"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { BarChart3 } from "lucide-react";
import type { ColDef } from "ag-grid-community";
import { useKit } from "@/components/kit/kit-provider";
import { PageHeader } from "@/components/shell/app-shell";
import { col, DataGrid } from "@/components/data-grid";
import { Badge, ButtonLink, Card, CardBody, CardHeader, EmptyState, SkeletonCard, Stat } from "@/components/ui";
import { usePhone } from "@/components/course/use-phone";
import { formatUsd, type Cohort, type CourseSummary, type ItemSummary, type QuestionSummary, type RefundRow } from "@/lib/course/cohort";

export interface CohortResponse extends Cohort {
  sampleLearners: number;
  realLearners: number;
  studioLicenseKey?: string;
}

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

const ITEM_COLUMNS: ColDef<ItemSummary>[] = [
  col.text("item", "Rubric item", { minWidth: 340, tooltipField: "item" }),
  col.text("lesson", "Lesson", { minWidth: 170 }),
  percentColumn("missRate", "Miss rate", { sort: "desc" }),
  numberColumn("partial", "Partial"),
  numberColumn("notMet", "Missed"),
  numberColumn("pointsLost", "Points lost", { maxWidth: 130 }),
];

const REFUND_COLUMNS: ColDef<RefundRow>[] = [
  col.date("requestedAt", "Requested"),
  col.text("state", "State", { maxWidth: 190 }),
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

/** The free view: every number in the dashboard, in the kit's plain AG Grid. */
function CohortTables({ cohort }: { cohort: CohortResponse }) {
  const phone = usePhone();
  const items = phone ? onPhone(ITEM_COLUMNS, ["item", "missRate"], { flex: 3 }) : ITEM_COLUMNS;
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
        <DataGrid<ItemSummary> rows={cohort.items} columns={items} getRowId={(r) => r.itemId} height={phone ? 520 : 340} searchPlaceholder="Search rubric items…" pageSize={false} />
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

function FixFirst({ item }: { item: ItemSummary }) {
  return (
    <div data-testid="cohort-fix-first" className="mb-6 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-700">
      <span className="font-semibold text-zinc-900">Fix first: </span>
      {item.item}. {percent(item.missRate)} of answers fell short. It&apos;s taught in lesson {item.lesson}.
    </div>
  );
}

export function CohortScreen() {
  const { kitFetch } = useKit();
  const [cohort, setCohort] = useState<CohortResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    kitFetch<CohortResponse>("/api/team/cohort").then(setCohort, (e: Error) => setError(e.message));
  }, [kitFetch]);

  const empty = cohort && cohort.sources.attempts.length === 0;
  const worst = cohort?.items[0];

  return (
    <>
      <PageHeader
        eyebrow="Course team"
        title="Cohort results"
        description="How learners did across every attempt, and which parts of the course to fix."
        actions={
          cohort?.sampleLearners ? (
            <Badge tone="warning">
              <span data-testid="sample-cohort-label">
                Sample cohort: {cohort.sampleLearners} made-up learners{cohort.realLearners ? ` plus ${cohort.realLearners} real` : ""}
              </span>
            </Badge>
          ) : null
        }
      />
      {error ? <p className="text-sm text-danger-700">{error}</p> : null}
      {!cohort && !error ? <SkeletonCard /> : null}
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
      {cohort && !empty ? (
        <>
          {worst && worst.answered > 0 && worst.missRate > 0 ? <FixFirst item={worst} /> : null}
          {CohortStudio ? <CohortStudio cohort={cohort} /> : <CohortTables cohort={cohort} />}
        </>
      ) : null}
      <p className="mt-6 text-xs text-zinc-500">
        Refunds are approved on the <Link href="/team" className="underline">course team page</Link>.
      </p>
    </>
  );
}
