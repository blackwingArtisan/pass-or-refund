import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { CircleAlert, CircleCheck, SearchCheck } from "lucide-react";
import { PageHeader } from "@/components/shell/app-shell";
import { Card, CardBody } from "@/components/ui";
import { ChangeOneLine } from "@/components/course/change-one-line";
import { publicRubricBody, verifyOnPayPal, type Verification } from "@/lib/course/verify";

export const metadata = { title: "Verify a purchase on PayPal" };

/** "3f2a9c1e04b7" -> "3f2a 9c1e 04b7", easier to compare by eye. */
const grouped = (fingerprint?: string) => fingerprint?.match(/.{1,4}/g)?.join(" ") ?? "none";

function Row({ label, testId, children }: { label: string; testId: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 py-2 sm:grid-cols-[11rem_1fr]">
      <dt className="text-zinc-500">{label}</dt>
      <dd data-testid={testId} className="min-w-0 break-words text-zinc-900">
        {children}
      </dd>
    </div>
  );
}

function Result({ v }: { v: Verification }) {
  if (v.status === "unrecognised") {
    return (
      <p data-testid="verify-result" data-status={v.status} className="mb-6 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        That isn&rsquo;t a PayPal order id (17 letters and digits) or an invoice id from this site (it starts PR-v).
      </p>
    );
  }
  const matches = v.status === "match";
  const verdict = matches ? "Matches" : v.status === "no-match" ? "Doesn't match" : v.status === "no-terms" ? "No terms on PayPal's record" : "Not found";
  return (
    <div data-testid="verify-result" data-status={v.status} className={`mb-6 rounded-xl border px-4 py-3 text-sm ${matches ? "border-emerald-200 bg-emerald-50 text-emerald-950" : "border-amber-300 bg-amber-50 text-amber-950"}`}>
      <p className="flex items-center gap-2 font-semibold">
        {matches ? <CircleCheck className="size-4" aria-hidden /> : <CircleAlert className="size-4" aria-hidden />}
        <span data-testid="verify-verdict">{verdict}</span>
        <span className="font-normal">{matches ? "PayPal's record of this order carries the same rubric as the public one, and the guarantee." : v.reason}</span>
      </p>
      {v.call ? (
        <p className="mt-2 text-xs">
          Read just now from PayPal:{" "}
          <code data-testid="verify-call" className="rounded bg-white/70 px-1 font-mono">
            {v.call}
          </code>
          {v.orderStatus ? (
            <>
              , order status <span data-testid="verify-order-status" className="font-mono">{v.orderStatus}</span>
            </>
          ) : null}
        </p>
      ) : null}
      {v.paypal ? (
        <dl className="mt-3 divide-y divide-current/10 rounded-lg bg-white/70 px-3 text-sm">
          <Row label="PayPal: invoice_id" testId="verify-paypal-invoice">
            <code className="font-mono">{v.paypal.invoiceId ?? "none"}</code>
          </Row>
          <Row label="PayPal: item line" testId="verify-paypal-item">
            {v.paypal.itemName ?? "none"}
          </Row>
          <Row label="PayPal: guarantee" testId="verify-paypal-guarantee">
            {v.paypal.guarantee ?? "none"}
          </Row>
          <Row label="PayPal: rubric" testId="verify-paypal-rubric">
            v{v.paypal.version ?? "?"}, fingerprint <code className="font-mono">{grouped(v.paypal.fingerprint)}</code>
          </Row>
          {v.rubric ? (
            <Row label="Public rubric, hashed now" testId="verify-public-rubric">
              {v.rubric.title} v{v.rubric.version}, fingerprint <code className="font-mono">{grouped(v.rubric.fingerprint)}</code>{" "}
              <Link href={v.rubric.href} className="font-medium text-brand underline" data-testid="verify-rubric-link">
                Read it
              </Link>
            </Row>
          ) : null}
        </dl>
      ) : null}
    </div>
  );
}

type Search = Promise<{ q?: string }>;

/** Only the result reads the address and PayPal, so the rest of the page prerenders. */
async function ResultFromAddress({ searchParams }: { searchParams: Search }) {
  const { q } = await searchParams;
  if (!q?.trim()) return null;
  await connection();
  const v = await verifyOnPayPal(q);
  // On a matching order, a visitor can change one line of a copy and watch the match break.
  const body = v.status === "match" && v.paypal?.version && v.paypal.fingerprint ? publicRubricBody(v.paypal.version, v.paypal.fingerprint) : null;
  return (
    <>
      <Result v={v} />
      {body && v.paypal?.fingerprint ? <ChangeOneLine rubric={body} paypalFingerprint={v.paypal.fingerprint} /> : null}
    </>
  );
}

async function QueryInput({ searchParams }: { searchParams: Search }) {
  const { q } = await searchParams;
  return <QueryField value={q ?? ""} />;
}

function QueryField({ value }: { value: string }) {
  return (
    <input
      id="q"
      name="q"
      defaultValue={value}
      placeholder="5YN554220W4690159 or PR-v1-ada21f9fbe03-en_…"
      className="min-w-0 flex-1 rounded-md border border-zinc-300 px-2 py-1.5 font-mono text-sm"
      data-testid="verify-input"
      autoComplete="off"
    />
  );
}

export default function VerifyPage({ searchParams }: { searchParams: Search }) {
  return (
    <>
      <PageHeader
        eyebrow="Check it yourself"
        title="Verify a purchase on PayPal"
        description="Paste the PayPal order id from your receipt, or the invoice id from PayPal's email. This page reads the order back from PayPal and sets its terms beside the public rubric."
      />
      <Card className="mb-6">
        <CardBody className="space-y-3 text-sm text-zinc-700">
          <form action="/verify" method="get" className="flex flex-wrap items-center gap-2" data-testid="verify-form">
            <label htmlFor="q" className="flex items-center gap-1.5 text-zinc-600">
              <SearchCheck className="size-4 text-brand" aria-hidden /> Order or invoice id
            </label>
            <Suspense fallback={<QueryField value="" />}>
              <QueryInput searchParams={searchParams} />
            </Suspense>
            <button type="submit" className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-brand-foreground" data-testid="verify-submit">
              Verify
            </button>
          </form>
          <p className="text-xs text-zinc-500">It only reads. It shows the terms PayPal holds for the order, never who bought it or their answers.</p>
        </CardBody>
      </Card>
      <Suspense fallback={null}>
        <ResultFromAddress searchParams={searchParams} />
      </Suspense>
    </>
  );
}
