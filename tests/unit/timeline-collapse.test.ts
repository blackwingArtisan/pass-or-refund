import { describe, expect, it } from "vitest";
import { collapseRuns, quietKey, repeatLabel } from "@/lib/events/collapse";
import type { TimelineStep } from "@/lib/events/types";

let n = 0;
function step(title: string, over: Partial<TimelineStep> = {}): TimelineStep {
  n += 1;
  const ts = new Date(Date.UTC(2026, 10, 8, 20, 0, n)).toISOString();
  const quiet = title.startsWith("Get ");
  return {
    id: `e${n}`,
    stepId: `s${n}`,
    ts,
    startedAt: ts,
    updatedAt: ts,
    history: ["succeeded"],
    kind: "paypal",
    status: "succeeded",
    title,
    channel: "team",
    paypal: { operation: quiet ? "orders.get" : "orders.capture", method: quiet ? "GET" : "POST", path: "/v2/checkout/orders/ORDER1", mode: "sandbox" },
    data: quiet ? { quiet: true } : undefined,
    ...over,
  } as TimelineStep;
}

describe("the timeline folds repeated background reads", () => {
  it("five identical order checks are one row, and the money steps around them stay their own rows", () => {
    const steps = [step("Create order"), ...Array.from({ length: 5 }, () => step("Get order")), step("Capture order"), step("Get capture"), step("Refund capture")];
    const runs = collapseRuns(steps, quietKey);
    expect(runs.map((r) => [r.last.title, r.count])).toEqual([
      ["Create order", 1],
      ["Get order", 5],
      ["Capture order", 1],
      ["Get capture", 1],
      ["Refund capture", 1],
    ]);
    expect(repeatLabel("Get order", 5)).toBe("Checked order 5×");
    expect(repeatLabel("Get order", 1)).toBe("Get order");
  });

  it("never folds a failed, running or waiting step, two different orders, or two money steps in a row", () => {
    const other = { paypal: { operation: "orders.get", method: "GET", path: "/v2/checkout/orders/ORDER2", mode: "sandbox" } } as Partial<TimelineStep>;
    const steps = [
      step("Get order"),
      step("Get order", other),
      step("Get order", { status: "failed" }),
      step("Get order", { status: "failed" }),
      step("Get order", { status: "running" }),
      step("Get order", { status: "running" }),
      step("Refund capture"),
      step("Refund capture"),
    ];
    expect(collapseRuns(steps, quietKey).map((r) => r.count)).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);
  });

  it("works on any rows with a key, such as the audit log's", () => {
    const lines = [{ k: "read" }, { k: "read" }, { k: "read" }, { k: null }, { k: null }, { k: "read" }];
    expect(collapseRuns(lines, (l) => l.k).map((r) => r.count)).toEqual([3, 1, 1, 1]);
  });
});
