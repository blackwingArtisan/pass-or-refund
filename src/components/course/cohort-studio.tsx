"use client";

/**
 * The self-serve dashboard, built on AG Studio. Only imported when NEXT_PUBLIC_SPONSOR_UI=1, so
 * none of it reaches the public site. Edit mode lets a course creator add, change and filter
 * widgets; their layout stays in this browser.
 */
import { useMemo, useState } from "react";
import { studioTheme, type AgDataSourcesDefinition, type AgReportState } from "ag-studio";
import { AgStudio, AgStudioProvider } from "ag-studio-react";
import { appConfig } from "@/app.config";
import { Button } from "@/components/ui";
import type { Cohort } from "@/lib/course/cohort";
import type { CohortResponse } from "./cohort-screen";

const REPORT_KEY = "cohort-report-v1";

const theme = studioTheme.withParams({ accentColor: appConfig.brandColor, chartPaletteFills1Color: appConfig.brandColor });

const text = (id: string, name: string) => ({ id, name, format: "textFormat" as const });
const integer = (id: string, name: string) => ({ id, name, format: "integerFormat" as const });
const rate = (id: string, name: string) => ({ id, name, format: "percentageFormat" as const });
const usd = (id: string, name: string) => ({ id, name, format: "currencyFormat" as const, formatOptions: { format: "$#,##0.00" } });
const hidden = (id: string) => ({ id, format: "textFormat" as const, hide: true });

function dataSources(cohort: Cohort): AgDataSourcesDefinition {
  const { learners, attempts, questions, items, refunds } = cohort.sources;
  return {
    description: "Results of an online course's final check. Learners who fail twice can get a refund a person approved.",
    sources: [
      {
        id: "learners",
        name: "Learners",
        data: learners,
        fields: [hidden("id"), text("course", "Course"), text("lastResult", "Last result"), integer("attempts", "Attempts"), integer("bestScore", "Best score"), rate("passed", "Pass rate"), integer("refunded", "Refunds"), usd("refundedUsd", "Refunded")],
      },
      {
        id: "attempts",
        name: "Attempts",
        data: attempts,
        fields: [hidden("id"), text("course", "Course"), integer("attempt", "Attempt number"), text("outcome", "Outcome"), integer("score", "Score"), rate("passed", "Pass rate"), integer("flagged", "Flagged"), { id: "submittedAt", name: "Submitted", format: "dateTimeFormat" }],
      },
      {
        id: "questions",
        name: "Questions",
        data: questions,
        fields: [hidden("id"), text("course", "Course"), integer("attempt", "Attempt number"), text("question", "Question"), integer("points", "Points"), integer("maxPoints", "Out of"), rate("cleared", "Pass rate")],
      },
      {
        id: "items",
        name: "Rubric items",
        data: items,
        fields: [hidden("id"), hidden("itemId"), text("course", "Course"), integer("attempt", "Attempt number"), text("question", "Question"), text("item", "Rubric item"), text("lesson", "Lesson"), text("verdict", "Verdict"), rate("missed", "Miss rate"), integer("pointsLost", "Points lost")],
      },
      {
        id: "refunds",
        name: "Refunds",
        data: refunds,
        fields: [hidden("id"), text("course", "Course"), text("state", "State"), usd("amountUsd", "Refunded"), text("paypalStatus", "PayPal says"), text("reason", "Reason"), { id: "requestedAt", name: "Requested", format: "dateTimeFormat" }],
      },
    ],
  };
}

const title = (value: string) => ({ title: { enabled: true, text: value } });
const stat = (id: string, aggregation: "avg" | "sum" | "count", label: string) => ({
  type: "value" as const,
  dataMapping: { value: [{ id, aggregation }] },
  format: title(label),
});

/** One series, so the title names it. The axis reads 0 to 1, so each bar carries its percentage. */
const rateBars = (label: string) => ({
  ...title(label),
  style: { theme: { bar: { series: { label: { enabled: true, color: "#ffffff" } } } } },
});

const REPORT: AgReportState = {
  selectedPageId: "overview",
  pages: [
    {
      id: "overview",
      widgets: {
        "pass-rate": stat("learners.passed", "avg", "Pass rate"),
        tested: stat("learners.course", "count", "Learners tested"),
        refunds: stat("learners.refunded", "sum", "Refunds"),
        refunded: stat("learners.refundedUsd", "sum", "Refunded"),
        "by-question": {
          type: "bar-chart-grouped",
          dataMapping: { categoryKey: [{ id: "questions.question" }], valueKey: [{ id: "questions.cleared", aggregation: "avg" }] },
          format: rateBars("Pass rate by question"),
        },
        "by-course": {
          type: "bar-chart-grouped",
          dataMapping: { categoryKey: [{ id: "learners.course" }], valueKey: [{ id: "learners.passed", aggregation: "avg" }] },
          format: rateBars("Pass rate by course"),
        },
        "most-missed": {
          type: "bar-chart-grouped",
          dataMapping: { categoryKey: [{ id: "items.item" }], valueKey: [{ id: "items.missed", aggregation: "avg" }] },
          sort: [{ field: { id: "items.missed", aggregation: "avg" }, direction: "desc" }],
          format: rateBars("Rubric items missed most"),
        },
        "refund-list": {
          type: "grid",
          dataMapping: { cols: [{ id: "refunds.requestedAt" }, { id: "refunds.state" }, { id: "refunds.amountUsd", aggregation: "sum" }, { id: "refunds.paypalStatus" }, { id: "refunds.reason" }] },
          format: title("Refunds"),
        },
      },
      widgetLayout: {
        "pass-rate": { xTrack: 0, yTrack: 0, xSpan: 6, ySpan: 7 },
        tested: { xTrack: 6, yTrack: 0, xSpan: 6, ySpan: 7 },
        refunds: { xTrack: 12, yTrack: 0, xSpan: 6, ySpan: 7 },
        refunded: { xTrack: 18, yTrack: 0, xSpan: 6, ySpan: 7 },
        "most-missed": { xTrack: 0, yTrack: 7, xSpan: 24, ySpan: 26 },
        "by-question": { xTrack: 0, yTrack: 33, xSpan: 15, ySpan: 16 },
        "by-course": { xTrack: 15, yTrack: 33, xSpan: 9, ySpan: 16 },
        "refund-list": { xTrack: 0, yTrack: 49, xSpan: 24, ySpan: 16 },
      },
    },
  ],
};

function savedReport(): AgReportState {
  try {
    const saved = localStorage.getItem(REPORT_KEY);
    return saved ? (JSON.parse(saved) as AgReportState) : REPORT;
  } catch {
    return REPORT;
  }
}

function saveReport(state: AgReportState | null) {
  try {
    if (state) localStorage.setItem(REPORT_KEY, JSON.stringify(state));
    else localStorage.removeItem(REPORT_KEY);
  } catch {
    // A private window: the layout just won't survive a reload.
  }
}

/** Studio reads initialState once, so a reset remounts this component. */
function Report({ cohort, editing }: { cohort: CohortResponse; editing: boolean }) {
  const [initialState] = useState(savedReport);
  const data = useMemo(() => dataSources(cohort), [cohort]);
  return (
    <AgStudioProvider licenseKey={cohort.studioLicenseKey}>
      <AgStudio
        style={{ height: "100%", width: "100%" }}
        data={data}
        initialState={initialState}
        mode={editing ? "edit" : "view"}
        theme={theme}
        enableFilterEditingInViewMode
        onStateUpdated={(event) => saveReport(event.state)}
      />
    </AgStudioProvider>
  );
}

export default function CohortStudio({ cohort }: { cohort: CohortResponse }) {
  const [editing, setEditing] = useState(false);
  const [resets, setResets] = useState(0);

  function reset() {
    saveReport(null);
    setResets((n) => n + 1);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-zinc-500">{editing ? "Add a chart, change a field or filter by attempt. Your layout stays in this browser." : "This dashboard is yours to change."}</p>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={reset} data-testid="studio-reset">
            Reset layout
          </Button>
          <Button variant="secondary" onClick={() => setEditing(!editing)} data-testid="studio-edit">
            {editing ? "Done editing" : "Edit dashboard"}
          </Button>
        </div>
      </div>
      <div data-testid="cohort-studio" style={{ height: 1140 }} className="overflow-hidden rounded-xl border border-zinc-200">
        <Report key={resets} cohort={cohort} editing={editing} />
      </div>
      <p className="text-xs text-zinc-500">Dashboard built with AG Studio by AG Grid Ltd, under a trial licence for evaluation.</p>
    </div>
  );
}
