import { Check } from "lucide-react";
import { learnerProgress } from "@/lib/course/learner-progress";
import type { EnrollmentView } from "@/lib/course/types";

/** Buy, Take the test, Pass or refund: the whole journey in one row, with the learner's place marked. */
export function ProgressStrip({ enrollment, passMark }: { enrollment: EnrollmentView; passMark: number }) {
  const steps = learnerProgress(enrollment, passMark);
  return (
    <nav aria-label="Where you are" data-testid="progress-strip" className="mb-6">
      <ol className="grid grid-cols-3 gap-2 sm:gap-3">
        {steps.map((step, i) => (
          <li
            key={step.id}
            data-testid={`progress-step-${step.id}`}
            data-state={step.state}
            aria-current={step.state === "current" ? "step" : undefined}
            className={`relative rounded-xl border px-2.5 py-2 sm:px-4 sm:py-3 ${step.state === "current" ? "border-brand-300 bg-brand-50 ring-1 ring-brand-200" : step.state === "done" ? "border-emerald-200 bg-emerald-50/60" : "border-zinc-200 bg-white"}`}
          >
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span
                aria-hidden
                className={`flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold sm:size-6 sm:text-xs ${step.state === "done" ? "bg-emerald-600 text-white" : step.state === "current" ? "bg-brand text-white" : "bg-zinc-200 text-zinc-600"}`}
              >
                {step.state === "done" ? <Check className="size-3.5" /> : i + 1}
              </span>
              <span className={`text-[13px] font-semibold leading-tight sm:text-sm ${step.state === "todo" ? "text-zinc-500" : "text-zinc-900"}`}>{step.label}</span>
              {step.state === "current" ? <span className="sr-only">(you are here)</span> : null}
            </div>
            <p data-testid={`progress-detail-${step.id}`} className={`mt-1 text-[11px] leading-snug sm:text-xs ${step.state === "todo" ? "text-zinc-500" : "text-zinc-700"}`}>
              {step.detail}
            </p>
          </li>
        ))}
      </ol>
    </nav>
  );
}
