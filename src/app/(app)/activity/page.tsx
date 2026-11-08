"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, ShieldCheck, ShieldX } from "lucide-react";
import { TeamGate } from "@/components/course/team-gate";
import { useKit } from "@/components/kit/kit-provider";
import { PageHeader } from "@/components/shell/app-shell";
import { Badge, Button, Card, CardBody, CardHeader, EmptyState } from "@/components/ui";
import type { AuditEntry } from "@/lib/agent/audit";
import { actionWords, actorWords, toolWords } from "@/lib/course/words";
import { collapseRuns } from "@/lib/events/collapse";
import { formatMoney } from "@/lib/money";

type Line = Pick<AuditEntry, "seq" | "ts" | "action" | "actor" | "tool" | "amount" | "reason">;

interface Audit {
  entries: Line[];
  integrity: { ok: boolean; count: number; brokenAt?: number };
}

/** "Asked to · Refund the course", or just the action when no tool was involved. */
const what = (entry: Line, count = 1) => [actionWords(entry.action), toolWords(entry.tool)].filter(Boolean).join(": ") + (count > 1 ? ` ${count}×` : "");

/** The same check, by the same actor, for the same reason, with no money on it: one line with a count. */
const repeatKey = (entry: Line) => (entry.amount ? null : [entry.action, entry.tool ?? "", entry.actor, entry.reason ?? ""].join("|"));
const seqs = (first: Line, last: Line) => (first.seq === last.seq ? `${first.seq}` : `${first.seq}–${last.seq}`);

function ActivityLog() {
  const { kitFetch } = useKit();
  const [audit, setAudit] = useState<Audit | null>(null);
  const load = useCallback(() => void kitFetch<Audit>("/api/audit").then(setAudit).catch(() => undefined), [kitFetch]);

  useEffect(() => {
    let live = true;
    kitFetch<Audit>("/api/audit")
      .then((a) => live && setAudit(a))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [kitFetch]);

  const lines = collapseRuns(audit ? [...audit.entries].reverse() : [], repeatKey).map(({ first, last, count }) => ({ entry: first, first, last, count }));
  return (
    <>
      <PageHeader title="Activity" description="Every money step the Guard saw, from request to approval to result." actions={<Button variant="secondary" icon={<RefreshCw className="size-4" />} onClick={load}>Refresh</Button>} />
      <Card>
        <CardHeader
          title="Audit log"
          description="Each line is chained to the one before it, so editing any line breaks the check."
          action={
            audit ? (
              audit.integrity.ok ? (
                <Badge tone="success"><ShieldCheck className="size-3.5" /> Checked: all {audit.integrity.count} lines intact</Badge>
              ) : (
                <Badge tone="danger"><ShieldX className="size-3.5" /> Line {audit.integrity.brokenAt} was changed</Badge>
              )
            ) : null
          }
        />
        <CardBody>
          {audit?.entries.length === 0 ? <EmptyState title="Nothing yet" description="Buy the course to start the log." /> : null}
          {lines.length > 0 ? (
            <>
              <table className="hidden w-full text-left text-sm md:table">
                <thead className="text-xs uppercase tracking-wide text-zinc-500">
                  <tr>
                    {["#", "Time", "What happened", "Amount", "Who", "Why"].map((h) => (
                      <th key={h} className="whitespace-nowrap px-2 py-2 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {lines.map(({ entry, first, last, count }) => (
                    <tr key={entry.seq} data-testid="audit-row" data-count={count > 1 ? count : undefined}>
                      <td className="whitespace-nowrap px-2 py-2 tabular-nums text-xs text-zinc-500">{seqs(first, last)}</td>
                      <td className="whitespace-nowrap px-2 py-2 text-zinc-600">{new Date(entry.ts).toLocaleTimeString("en-US")}</td>
                      <td className="px-2 py-2 text-zinc-900">{what(entry, count)}</td>
                      <td className="whitespace-nowrap px-2 py-2 tabular-nums">{entry.amount ? formatMoney(entry.amount) : ""}</td>
                      <td className="px-2 py-2">{actorWords(entry.actor)}</td>
                      <td className="px-2 py-2 text-zinc-600">{entry.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <ul className="divide-y divide-zinc-100 md:hidden">
                {lines.map(({ entry, count }) => (
                  <li key={entry.seq} data-testid="audit-item" className="py-3 text-sm">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="font-medium text-zinc-900">{what(entry, count)}</p>
                      {entry.amount ? <span className="shrink-0 tabular-nums">{formatMoney(entry.amount)}</span> : null}
                    </div>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {new Date(entry.ts).toLocaleTimeString("en-US")} · {actorWords(entry.actor)}
                    </p>
                    {entry.reason ? <p className="mt-1 text-zinc-600">{entry.reason}</p> : null}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </CardBody>
      </Card>
    </>
  );
}

export default function ActivityPage() {
  return (
    <TeamGate title="Activity">
      <ActivityLog />
    </TeamGate>
  );
}
