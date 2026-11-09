"use client";

import { useState, type FormEvent } from "react";
import { CircleAlert, CircleCheck } from "lucide-react";
import { useKit } from "@/components/kit/kit-provider";
import { Button, Card, CardBody, CardHeader } from "@/components/ui";
import type { ReceiptCheck } from "@/lib/course/grade-receipt";

/** The public receipt check: paste or open a grade receipt, and see whether it still matches the record. */
export function ReceiptCheckForm() {
  const { kitFetch } = useKit();
  const [text, setText] = useState("");
  const [result, setResult] = useState<ReceiptCheck | null>(null);
  const [busy, setBusy] = useState(false);

  async function check(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      let receipt: unknown;
      try {
        receipt = JSON.parse(text);
      } catch {
        receipt = null;
      }
      setResult(await kitFetch<ReceiptCheck>("/api/rubric/receipt-check", { json: receipt }));
    } catch (err) {
      setResult({ status: "changed", problems: [(err as Error).message || "The check didn't run."] });
    } finally {
      setBusy(false);
    }
  }

  const matches = result?.status === "matches";
  return (
    <Card className="mb-6" id="receipt-check">
      <CardHeader title="Check a grade receipt" description="Open or paste the JSON a learner downloaded from their grade receipt. It matches only if nothing in it was edited and every grade in it is still the one on file." />
      <CardBody className="space-y-3 text-sm">
        <form onSubmit={check} className="space-y-3" data-testid="receipt-check-form">
          <input
            type="file"
            accept="application/json,.json"
            data-testid="receipt-file"
            className="block text-sm text-zinc-600"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (file) setText(await file.text());
            }}
          />
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            placeholder='{"kind": "pass-or-refund grade receipt", ...}'
            className="w-full rounded-md border border-zinc-300 px-2 py-1 font-mono text-xs"
            data-testid="receipt-text"
            aria-label="Grade receipt JSON"
          />
          <Button type="submit" loading={busy} disabled={!text.trim()} data-testid="receipt-check-submit">
            Check receipt
          </Button>
        </form>
        {result ? (
          <div data-testid="receipt-check" data-status={result.status} className={`rounded-xl border px-4 py-3 ${matches ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-300 bg-amber-50 text-amber-900"}`}>
            <p className="flex items-center gap-2 font-semibold">
              {matches ? <CircleCheck className="size-4" aria-hidden /> : <CircleAlert className="size-4" aria-hidden />}
              <span data-testid="receipt-verdict">{matches ? "Matches" : "Changed"}</span>
            </p>
            {matches ? (
              <p className="mt-1">Every grade, hash and refund id in this receipt is the one on file.</p>
            ) : (
              <ul className="mt-1 list-disc space-y-0.5 pl-5" data-testid="receipt-problems">
                {result.problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}
