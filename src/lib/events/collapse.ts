/**
 * A page that polls PayPal logs the same read again and again ("Get order", "Get order", ...).
 * These helpers fold a run of identical rows into one, so the calls that change something
 * (create order, capture, grade, refund) stay the visible spine. Pure: shared by the
 * timeline rail and the /activity log.
 */
import type { TimelineStep } from "./types";

export interface Run<T> {
  first: T;
  last: T;
  count: number;
}

/** Folds consecutive items with the same key into one run. A null key never folds. */
export function collapseRuns<T>(items: readonly T[], keyOf: (item: T) => string | null): Run<T>[] {
  const runs: Run<T>[] = [];
  let key: string | null = null;
  for (const item of items) {
    const k = keyOf(item);
    const open = runs.at(-1);
    if (open && k !== null && k === key) {
      open.last = item;
      open.count += 1;
    } else runs.push({ first: item, last: item, count: 1 });
    key = k;
  }
  return runs;
}

/** True for a background read: a GET to PayPal, a webhook check, the model's own reasoning. */
export function isQuietStep(step: TimelineStep) {
  return Boolean((step.data as { quiet?: boolean } | undefined)?.quiet) && step.status !== "failed" && step.status !== "awaiting_approval";
}

/** Only finished quiet reads of the same thing fold; anything that ran, failed or waits stays its own row. */
export function quietKey(step: TimelineStep): string | null {
  if (!isQuietStep(step) || step.status === "running" || step.kind === "agent.thinking") return null;
  return [step.kind, step.status, step.title, step.paypal?.method ?? "", step.paypal?.path ?? ""].join("|");
}

/** "Get order" reads as "Checked order"; the count goes after it. */
export function repeatLabel(title: string, count: number) {
  const plain = title.replace(/^Get /, "Checked ");
  return count > 1 ? `${plain} ${count}×` : title;
}
