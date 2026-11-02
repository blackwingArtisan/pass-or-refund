import { ShieldCheck } from "lucide-react";
import { COURSE_PRICE_CENTS } from "@/lib/course/content";
import { formatCents, GUARANTEE_TERMS } from "@/lib/course/policy";

/** The policy, word for word the same before purchase and on the fail screen. */
export function Guarantee() {
  return (
    <div data-testid="guarantee" className="rounded-xl border border-brand-200 bg-brand-50/60 p-4">
      <p className="flex items-center gap-2 font-semibold text-zinc-900">
        <ShieldCheck className="size-5 text-brand" /> The {formatCents(COURSE_PRICE_CENTS)} guarantee
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-700">
        {GUARANTEE_TERMS.map((term) => (
          <li key={term}>{term}</li>
        ))}
      </ul>
    </div>
  );
}
