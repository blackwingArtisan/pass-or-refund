"use client";

import { ChevronRight, KeyRound } from "lucide-react";
import { useCleanMode } from "../course/clean-mode";
import { JudgeToggle, useJudgeMode } from "../course/judge-mode";
import { cn } from "../ui/cn";
import { ModeBadges } from "./mode-badges";

/**
 * Everything that is there for judges, folded into one small "For judges" menu so learner and
 * creator screens show only the product: the PayPal and AI modes, today's AI spend, and the
 * switch for prepared answers. Gone entirely in clean mode.
 */
export function JudgeTools({ className }: { className?: string }) {
  const clean = useCleanMode();
  const [judge, setJudge] = useJudgeMode();
  if (clean) return null;
  return (
    <details data-testid="judge-tools" className={cn("group text-xs", className)}>
      <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-md px-1 py-1 font-medium text-zinc-500 hover:text-zinc-800 [&::-webkit-details-marker]:hidden">
        <KeyRound className="size-3.5" /> For judges
        <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" />
      </summary>
      <div className="mt-2 space-y-3 px-1">
        <ModeBadges vertical />
        <JudgeToggle on={judge} onChange={setJudge} />
        <p className="text-[11px] leading-relaxed text-zinc-400">Sandbox only. No live PayPal calls are possible from this app.</p>
      </div>
    </details>
  );
}
