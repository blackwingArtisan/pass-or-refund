import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { CircleAlert, CircleCheck, Fingerprint } from "lucide-react";
import { ReceiptCheckForm } from "@/components/course/receipt-check";
import { PageHeader } from "@/components/shell/app-shell";
import { Card, CardBody, CardHeader } from "@/components/ui";
import { readOrderTerms, type PayPalTermsCheck } from "@/lib/course/order-terms";
import { checkFingerprint, rubricFingerprint, rubricOnSaleNow } from "@/lib/course/rubric-lock";
import { SHOWN_REFUND } from "@/lib/course/shown-refund";

export const metadata = { title: "The public rubric" };

/** "3f2a9c1e04b7" -> "3f2a 9c1e 04b7", easier to compare by eye. */
const grouped = (fingerprint: string) => fingerprint.match(/.{1,4}/g)?.join(" ") ?? fingerprint;

/** The third row: PayPal's own record of the learner's order, read back with GET /v2/checkout/orders/{id}. */
function PayPalRow({ terms }: { terms: PayPalTermsCheck }) {
  const agrees = terms.status === "matches";
  return (
    <div data-testid="paypal-order-terms" data-status={terms.status} className="mt-2 border-t border-current/15 pt-2">
      <p>
        PayPal&rsquo;s record of your order{" "}
        <code className="rounded bg-white/70 px-1 font-mono text-xs" data-testid="paypal-order-call">
          GET /v2/checkout/orders/{terms.orderId}
        </code>
        :{" "}
        {terms.status === "missing" ? (
          "this order was placed before the terms were written on PayPal's record, so PayPal holds no fingerprint for it."
        ) : (
          <>
            invoice_id <code className="font-mono" data-testid="paypal-invoice-id">{terms.invoiceId ?? "none"}</code>, item &ldquo;<span data-testid="paypal-item-name">{terms.itemName ?? "none"}</span>&rdquo;
            {agrees ? ", the same fingerprint." : ", which differs from the fingerprint on your receipt."}
          </>
        )}
      </p>
    </div>
  );
}

function CheckResult({ version, fingerprint, terms }: { version: string; fingerprint: string; terms?: PayPalTermsCheck | null }) {
  const check = checkFingerprint({ version, fingerprint });
  // With PayPal's record read, "matches" needs all three: the receipt, the rubric on sale and PayPal's order.
  const paypalDiffers = terms?.status === "changed" || (terms?.status === "matches" && !terms.itemName?.includes(check.bought.fingerprint));
  const matches = check.status === "matches" && !paypalDiffers;
  return (
    <div
      data-testid="fingerprint-check"
      data-status={check.status}
      className={`mb-6 rounded-xl border px-4 py-3 text-sm ${matches ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-300 bg-amber-50 text-amber-900"}`}
    >
      <p className="flex items-center gap-2 font-semibold">
        {matches ? <CircleCheck className="size-4" aria-hidden /> : <CircleAlert className="size-4" aria-hidden />}
        <span data-testid="fingerprint-verdict">{matches ? "Matches" : paypalDiffers && check.status === "matches" ? "PayPal's record differs" : "Changed since you bought"}</span>
        {terms && terms.status !== "missing" ? <span className="font-normal">{matches ? "Your receipt, the rubric on sale and PayPal's record of your order all carry it." : null}</span> : null}
      </p>
      <p className="mt-1">
        Your receipt says rubric v{check.bought.version}, fingerprint <code className="font-mono">{grouped(check.bought.fingerprint)}</code>. This page shows v{check.onSale.version}, fingerprint{" "}
        <code className="font-mono">{grouped(check.onSale.fingerprint)}</code>.
      </p>
      <p className="mt-1">
        {matches
          ? "The rubric below is word for word the one you bought."
          : check.boughtOnFile
            ? `The rubric on sale now differs from yours. Your attempts are still graded on v${check.bought.version}, the one you bought.`
            : "We have no rubric with your fingerprint on file, so grading would stop rather than use different words. Contact the course team."}
      </p>
      {terms ? <PayPalRow terms={terms} /> : null}
    </div>
  );
}

type Search = Promise<{ v?: string; fp?: string; en?: string }>;

/** Only the check reads the address, so the rest of the page prerenders. */
async function CheckFromAddress({ searchParams, version }: { searchParams: Search; version: string }) {
  const { v, fp, en } = await searchParams;
  if (!fp) return null;
  // A learner's own receipt link names their purchase, so PayPal's record of it is read too.
  // Reading PayPal happens at request time, never while the page prerenders.
  if (en) await connection();
  const terms = en ? await readOrderTerms(en) : null;
  return <CheckResult version={v ?? version} fingerprint={fp} terms={terms} />;
}

export default function RubricPage({ searchParams }: { searchParams: Search }) {
  const { version, rubric } = rubricOnSaleNow();
  const fingerprint = rubricFingerprint(rubric);
  return (
    <>
      <PageHeader eyebrow="Public rubric" title={rubric.title} description={`Every learner is graded on these lines. Pass mark ${rubric.passMark} of 100. Any change to a single character changes the fingerprint.`} />
      <Suspense fallback={null}>
        <CheckFromAddress searchParams={searchParams} version={version} />
      </Suspense>
      <Card className="mb-6">
        <CardBody className="space-y-3 text-sm text-zinc-700">
          <p className="flex flex-wrap items-center gap-x-1.5">
            <Fingerprint className="size-4 text-brand" aria-hidden /> Rubric <span data-testid="public-rubric-version">v{version}</span>, fingerprint{" "}
            <code data-testid="public-rubric-fingerprint" className="font-mono text-zinc-900">
              {grouped(fingerprint)}
            </code>
          </p>
          <form action="/rubric" method="get" className="flex flex-wrap items-center gap-2" data-testid="fingerprint-form">
            <input type="hidden" name="v" value={version} />
            <label htmlFor="fp" className="text-zinc-600">
              Check the fingerprint on your receipt:
            </label>
            <input id="fp" name="fp" placeholder="3f2a 9c1e 04b7" className="w-40 rounded-md border border-zinc-300 px-2 py-1 font-mono text-sm" data-testid="fingerprint-input" />
            <button type="submit" className="rounded-md bg-brand px-3 py-1 text-sm font-medium text-brand-foreground" data-testid="fingerprint-submit">
              Check
            </button>
          </form>
          <p className="text-xs text-zinc-500">
            Or check it yourself: the fingerprint is the first 12 characters of the SHA-256 of{" "}
            <Link href={`/api/rubric/v${version}.json`} className="underline" data-testid="rubric-download">
              this file
            </Link>{" "}
            (<code>shasum -a 256 rubric-v{version}.json</code>). Bought already?{" "}
            <Link href="/verify" className="underline" data-testid="rubric-verify-link">
              Verify your order on PayPal
            </Link>
            . Or{" "}
            <Link href={`/verify?q=${SHOWN_REFUND.orderId}#change-one-line`} className="underline" data-testid="rubric-change-link">
              change one line and check again
            </Link>{" "}
            against a real order.
          </p>
        </CardBody>
      </Card>
      <ReceiptCheckForm />
      <div className="space-y-4">
        {rubric.questions.map((q, i) => (
          <Card key={q.id} data-testid="public-rubric-question">
            <CardHeader title={`Question ${i + 1}, ${q.points} points`} description={q.text} />
            <CardBody>
              <ul className="space-y-1.5 text-sm text-zinc-700">
                {q.items.map((item) => (
                  <li key={item.id} className="flex gap-3">
                    <span className="w-12 shrink-0 tabular-nums text-zinc-500">{item.points} pts</span>
                    <span>{item.text}</span>
                  </li>
                ))}
                {q.caps.map((cap) => (
                  <li key={cap.id} className="flex gap-3 text-zinc-500">
                    <span className="w-12 shrink-0 tabular-nums">max {cap.max}</span>
                    <span>{cap.text}</span>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        ))}
      </div>
    </>
  );
}
