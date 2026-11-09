import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { COURSE_PRICE_CENTS } from "@/lib/course/content";
import { formatCents, GUARANTEE_SUMMARY } from "@/lib/course/policy";

/** The policy in four lines, word for word the same before purchase and on the fail screen. The full terms are on /terms. */
export function Guarantee() {
  return (
    <div data-testid="guarantee" className="rounded-xl border border-brand-200 bg-brand-50/60 p-4">
      <p className="flex items-center gap-2 font-semibold text-zinc-900">
        <ShieldCheck className="size-5 text-brand" /> The {formatCents(COURSE_PRICE_CENTS)} guarantee
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-700">
        {GUARANTEE_SUMMARY.map((term) => (
          <li key={term}>{term}</li>
        ))}
      </ul>
      <Link href="/terms" data-testid="guarantee-full-terms" className="mt-2 inline-block text-sm font-medium text-brand underline">
        Full terms
      </Link>
    </div>
  );
}
