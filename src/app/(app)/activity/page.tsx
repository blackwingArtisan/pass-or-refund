"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, ShieldCheck, ShieldX } from "lucide-react";
import { useKit } from "@/components/kit/kit-provider";
import { PageHeader } from "@/components/shell/app-shell";
import { Badge, Button, Card, CardBody, CardHeader, EmptyState } from "@/components/ui";
import type { AuditEntry } from "@/lib/agent/audit";
import { formatMoney } from "@/lib/money";

interface Audit {
  entries: AuditEntry[];
  integrity: { ok: boolean; count: number; brokenAt?: number };
}

export default function ActivityPage() {
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

  return (
    <>
      <PageHeader title="Activity" description="Every money step the Guard saw, from request to approval to result." actions={<Button variant="secondary" icon={<RefreshCw className="size-4" />} onClick={load}>Refresh</Button>} />
      <Card>
        <CardHeader
          title="Audit log"
          description="Hash-chained: editing any line breaks verification."
          action={
            audit ? (
              audit.integrity.ok ? (
                <Badge tone="success"><ShieldCheck className="size-3.5" /> Chain verified, {audit.integrity.count} entries</Badge>
              ) : (
                <Badge tone="danger"><ShieldX className="size-3.5" /> Broken at #{audit.integrity.brokenAt}</Badge>
              )
            ) : null
          }
        />
        <CardBody>
          {audit?.entries.length === 0 ? <EmptyState title="Nothing yet" description="Buy the course to start the log." /> : null}
          {audit && audit.entries.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-zinc-500">
                  <tr>
                    {["#", "Time", "Action", "Tool", "Amount", "Actor", "Reason"].map((h) => (
                      <th key={h} className="whitespace-nowrap px-2 py-2 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {[...audit.entries].reverse().map((entry) => (
                    <tr key={entry.seq} data-testid="audit-row">
                      <td className="px-2 py-2 font-mono text-xs">{entry.seq}</td>
                      <td className="whitespace-nowrap px-2 py-2 text-zinc-600">{new Date(entry.ts).toLocaleTimeString("en-US")}</td>
                      <td className="px-2 py-2">{entry.action}</td>
                      <td className="px-2 py-2 font-mono text-xs">{entry.tool}</td>
                      <td className="whitespace-nowrap px-2 py-2 tabular-nums">{entry.amount ? formatMoney(entry.amount) : ""}</td>
                      <td className="px-2 py-2">{entry.actor}</td>
                      <td className="px-2 py-2 text-zinc-600">{entry.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </CardBody>
      </Card>
    </>
  );
}
