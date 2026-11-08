"use client";

import { useState } from "react";
import { Check, ShieldAlert, X } from "lucide-react";
import type { Money } from "@/lib/money";
import { MoneyBadge } from "../money-badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { cn } from "../ui/cn";
import { useKit } from "../kit/kit-provider";
import { showError } from "../error-toast";
import { useToast } from "../toast";

/**
 * The human-in-the-loop card. Posts the decision to /api/agent/approvals/:id; the waiting
 * agent continues (or stops) immediately.
 */
export function ApprovalPrompt({
  approvalId,
  summary,
  reason,
  amount,
  reasons,
  askDeclineNote,
  onDecided,
  className,
}: {
  approvalId: string;
  summary: string;
  reason?: string;
  amount?: Money;
  /** Why the agent proposes this, shown to the person deciding. */
  reasons?: string[];
  /** Decline needs a reason, and it is saved with the decision. */
  askDeclineNote?: boolean;
  onDecided?: (decision: "approved" | "denied") => void;
  className?: string;
}) {
  const { kitFetch } = useKit();
  const { toast } = useToast();
  const [busy, setBusy] = useState<"approved" | "denied" | null>(null);
  const [declining, setDeclining] = useState(false);
  const [note, setNote] = useState("");

  async function decide(decision: "approved" | "denied") {
    setBusy(decision);
    try {
      await kitFetch(`/api/agent/approvals/${approvalId}`, { json: { decision, note: decision === "denied" && note.trim() ? note.trim() : undefined } });
      onDecided?.(decision);
      toast({ title: decision === "approved" ? "Approved" : "Declined", description: summary, variant: decision === "approved" ? "success" : "warning" });
    } catch (e) {
      showError(toast, "Could not record decision", e);
      setBusy(null);
    }
  }

  return (
    <div data-testid="approval-prompt" className={cn("animate-pulse-ring rounded-xl border border-amber-300 bg-gradient-to-b from-amber-50 to-white p-4", className)}>
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
          <ShieldAlert className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Approval needed</p>
          <p className="mt-0.5 font-semibold text-zinc-900">{summary}</p>
          {reason ? <p className="mt-0.5 text-sm text-zinc-600">{reason}</p> : null}
        </div>
        {amount ? <MoneyBadge amount={amount} direction="neutral" size="lg" /> : null}
      </div>
      {reasons?.length ? (
        <div data-testid="approval-reasons" className="mt-3 rounded-lg bg-white/70 px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">The agent&rsquo;s reasons</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-zinc-700">
            {reasons.map((text) => (
              <li key={text}>{text}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {declining ? (
        <div className="mt-3">
          <label htmlFor={`decline-${approvalId}`} className="text-sm font-medium text-zinc-800">
            Why are you declining? The learner reads this, and it&rsquo;s listed on the public cohort page without their name.
          </label>
          <Input id={`decline-${approvalId}`} data-testid="decline-note" className="mt-1" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
        </div>
      ) : null}
      <div className="mt-3 flex justify-end gap-2">
        <Button
          variant="secondary"
          size="sm"
          icon={<X className="size-4" />}
          loading={busy === "denied"}
          disabled={!!busy || (declining && !note.trim())}
          onClick={() => (askDeclineNote && !declining ? setDeclining(true) : decide("denied"))}
          data-testid="decline-button"
        >
          {declining ? "Confirm decline" : "Decline"}
        </Button>
        <Button variant="success" size="sm" icon={<Check className="size-4" />} loading={busy === "approved"} disabled={!!busy} onClick={() => decide("approved")} data-testid="approve-button">
          Approve
        </Button>
      </div>
    </div>
  );
}
