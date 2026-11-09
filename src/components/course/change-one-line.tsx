"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CircleAlert, CircleCheck, PencilLine } from "lucide-react";
import { Button, Card, CardBody, CardHeader } from "@/components/ui";
import type { Rubric } from "@/lib/grading/frozen/score-items";
import { changedLine, fingerprintOf, rubricLines, withLine } from "@/lib/course/rubric-hash";

/** "3f2a9c1e04b7" -> "3f2a 9c1e 04b7", easier to compare by eye. */
const grouped = (fingerprint: string) => fingerprint.match(/.{1,4}/g)?.join(" ") ?? fingerprint;

type Checked = { fingerprint: string; changed: ReturnType<typeof changedLine> };

/**
 * "Change one line and check again": edits a copy of the public rubric in this browser, hashes it the
 * way the server does (rubric-hash.ts), and sets the result beside the fingerprint on PayPal's order.
 * Nothing is sent anywhere; the rubric on sale and the order are untouched.
 */
export function ChangeOneLine({ rubric, paypalFingerprint }: { rubric: Rubric; paypalFingerprint: string }) {
  const lines = useMemo(() => rubricLines(rubric), [rubric]);
  const [key, setKey] = useState(lines[0]?.key ?? "");
  const line = lines.find((l) => l.key === key) ?? lines[0];
  const [text, setText] = useState(line?.text ?? "");
  const [asPublished, setAsPublished] = useState<string | null>(null);
  const [checked, setChecked] = useState<Checked | null>(null);

  // The untouched copy, hashed here first: the same fingerprint as PayPal's record.
  useEffect(() => {
    fingerprintOf(rubric).then(setAsPublished, () => setAsPublished(null));
  }, [rubric]);

  if (!line) return null;

  function pick(next: string) {
    setKey(next);
    setText(lines.find((l) => l.key === next)?.text ?? "");
    setChecked(null);
  }

  async function check(e: FormEvent) {
    e.preventDefault();
    const edited = withLine(rubric, line.key, text);
    setChecked({ fingerprint: await fingerprintOf(edited), changed: changedLine(rubric, edited) });
  }

  const matches = checked ? checked.fingerprint === paypalFingerprint : null;
  return (
    <Card className="mb-6 scroll-mt-6" id="change-one-line" data-testid="change-one-line">
      <CardHeader title="Change one line and check again" description="Edit a copy of the public rubric here. Your browser hashes it the way the server does and sets it beside the fingerprint on PayPal's order. Nothing is saved or sent." />
      <CardBody className="space-y-3 text-sm text-zinc-700">
        <dl className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-lg bg-zinc-50 px-3 py-2">
            <dt className="text-xs text-zinc-500">PayPal&rsquo;s record of this order</dt>
            <dd className="font-mono text-base font-semibold text-zinc-900" data-testid="change-paypal-fingerprint">
              {grouped(paypalFingerprint)}
            </dd>
          </div>
          <div className="rounded-lg bg-zinc-50 px-3 py-2">
            <dt className="text-xs text-zinc-500">The public rubric, hashed in your browser</dt>
            <dd className="font-mono text-base font-semibold text-zinc-900" data-testid="change-browser-fingerprint">
              {asPublished ? grouped(asPublished) : "…"}
            </dd>
          </div>
        </dl>
        <form onSubmit={check} className="space-y-2" data-testid="change-form">
          <label className="block">
            <span className="text-xs text-zinc-500">Line to change</span>
            <select value={line.key} onChange={(e) => pick(e.target.value)} className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm" data-testid="change-line-select">
              {lines.map((l) => (
                <option key={l.key} value={l.key}>
                  {l.label} ({l.points} points): {l.text}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-zinc-500">Its words, in your copy</span>
            <textarea
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setChecked(null);
              }}
              rows={2}
              className="mt-1 block w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
              data-testid="change-line-text"
            />
          </label>
          <Button type="submit" size="sm" icon={<PencilLine className="size-4" />} data-testid="change-line-check">
            Check again
          </Button>
        </form>
        {checked ? (
          <div
            data-testid="change-result"
            data-status={matches ? "match" : "no-match"}
            className={`rounded-xl border px-4 py-3 ${matches ? "border-emerald-200 bg-emerald-50 text-emerald-950" : "border-red-200 bg-red-50 text-red-950"}`}
          >
            <p className="flex items-center gap-2 font-semibold">
              {matches ? <CircleCheck className="size-4" aria-hidden /> : <CircleAlert className="size-4" aria-hidden />}
              <span data-testid="change-verdict">{matches ? "Matches PayPal's record" : "Does not match PayPal's record"}</span>
            </p>
            <p className="mt-1">
              Your copy hashes to <code className="font-mono font-semibold" data-testid="change-edited-fingerprint">{grouped(checked.fingerprint)}</code>; PayPal&rsquo;s order says{" "}
              <code className="font-mono font-semibold">{grouped(paypalFingerprint)}</code>.
            </p>
            {checked.changed ? (
              <p className="mt-1" data-testid="change-named-line">
                You changed {checked.changed.label}: &ldquo;{checked.changed.before}&rdquo; is now &ldquo;{checked.changed.after}&rdquo;. One changed word is enough, so the terms you bought can&rsquo;t be moved without it showing.
              </p>
            ) : (
              <p className="mt-1">You haven&rsquo;t changed a word yet. Edit the line above and check again.</p>
            )}
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}
