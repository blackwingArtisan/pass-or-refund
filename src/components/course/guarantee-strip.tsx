import Link from "next/link";
import { Check, ChevronDown, ShieldCheck } from "lucide-react";
import { guaranteeLine, invoiceIdFor } from "@/lib/course/guarantee-terms";
import { GUARANTEE_SUMMARY } from "@/lib/course/policy";
import type { EnrollmentView } from "@/lib/course/types";
import { RubricTerms } from "./rubric-receipt";

/** Where the receipt's "Check" goes: the course's own page for a creator's course, else the three-column tick on /rubric. */
export function checkHrefFor(enrollment: Pick<EnrollmentView, "id" | "rubric">, courseCheckHref?: string) {
  if (courseCheckHref) return courseCheckHref;
  const lock = enrollment.rubric;
  return lock ? `/rubric?v=${encodeURIComponent(lock.version)}&fp=${encodeURIComponent(lock.fingerprint)}&en=${encodeURIComponent(enrollment.id)}` : "/rubric";
}

/**
 * "Your guarantee": the price, the pass mark, the two tries and the refund in one line, then three
 * plain promises with a link each. This is the only place the learner page states the guarantee: its
 * four rules, the fingerprint and the invoice id sit behind "Check it yourself", so a learner reads
 * the promise once without having to read a hash.
 */
export function GuaranteeStrip({ enrollment, passMark, checkHref }: { enrollment: EnrollmentView; passMark: number; checkHref?: string }) {
  const payment = enrollment.payment;
  if (payment?.capturedCents === undefined) return null;
  const line = guaranteeLine({ priceCents: payment.capturedCents, passMark });
  const verifyHref = `/verify?q=${encodeURIComponent(payment.orderId)}`;
  const check = checkHrefFor(enrollment, checkHref);
  const promises = [
    { text: "Rubric locked at purchase", href: check, label: "Check", testId: "check-fingerprint" },
    { text: "On your PayPal order", href: verifyHref, label: "Verify on PayPal", testId: "verify-on-paypal" },
    { text: "Every rule in writing", href: "/terms", label: "Terms", testId: "strip-terms" },
  ];
  return (
    <section data-testid="receipt" aria-labelledby="your-guarantee" className="rounded-2xl border border-brand-200 bg-brand-50/60 px-4 py-3 text-sm text-zinc-700 sm:px-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="your-guarantee" className="flex items-center gap-2 text-[15px] font-semibold text-zinc-900">
          <ShieldCheck className="size-5 shrink-0 text-brand" aria-hidden /> Your guarantee
        </h2>
        <p className="text-xs text-zinc-600" data-testid="receipt-paid">
          {`${line.price} paid through PayPal, order ${payment.orderId}`}
        </p>
      </div>
      <p className="mt-2 text-zinc-900" data-testid="guarantee-line">
        <strong>{line.price}</strong> · {line.passMark} · {line.tries} · {line.refund}
      </p>
      <ul className="mt-2 grid gap-1.5 sm:grid-cols-3 sm:gap-3" data-testid="guarantee-promises">
        {promises.map((p) => (
          <li key={p.testId} className="flex items-start gap-1.5">
            <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
            <span>
              {p.text}.{" "}
              <Link href={p.href} className="font-medium text-brand underline" data-testid={p.testId}>
                {p.label}
              </Link>
            </span>
          </li>
        ))}
      </ul>
      <details className="group mt-2" data-testid="check-it-yourself">
        <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-zinc-600 hover:text-zinc-900 [&::-webkit-details-marker]:hidden">
          <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" aria-hidden /> Check it yourself
        </summary>
        <div className="mt-2 space-y-1 rounded-lg bg-white/70 px-3 py-2 text-xs text-zinc-600">
          <ul className="list-disc space-y-0.5 pl-4 text-zinc-700" data-testid="strip-guarantee-rules">
            {GUARANTEE_SUMMARY.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
          <RubricTerms lock={enrollment.rubric} link={false} />
          <p>
            PayPal&rsquo;s order carries it on the item line and as invoice_id{" "}
            <code className="break-all font-mono text-zinc-900" data-testid="receipt-invoice-id">
              {invoiceIdFor(enrollment)}
            </code>
            .{" "}
            <Link href={verifyHref} className="font-medium text-brand underline" data-testid="check-verify-link">
              Read it back on /verify
            </Link>
          </p>
        </div>
      </details>
    </section>
  );
}
