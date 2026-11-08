"use client";

import { useCallback, useSyncExternalStore } from "react";

/** Judges can fill the final check with prepared answers. Off unless they turn it on; remembered in this browser. */
export const JUDGE_KEY = "por_judge";

const listeners = new Set<() => void>();
let thisVisit: boolean | null = null; // used when storage is blocked

function read() {
  try {
    return window.localStorage.getItem(JUDGE_KEY) === "1";
  } catch {
    return thisVisit ?? false;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useJudgeMode(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(subscribe, read, () => false);
  const set = useCallback((next: boolean) => {
    thisVisit = next;
    try {
      if (next) window.localStorage.setItem(JUDGE_KEY, "1");
      else window.localStorage.removeItem(JUDGE_KEY);
    } catch {
      // Not remembered, still on for this visit.
    }
    for (const listener of listeners) listener();
  }, []);
  return [on, set];
}

export function JudgeToggle({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className="inline-flex cursor-pointer select-none items-center gap-2 text-xs font-medium text-zinc-500">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        data-testid="judge-toggle"
        onClick={() => onChange(!on)}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${on ? "bg-brand" : "bg-zinc-300"}`}
      >
        <span className={`inline-block size-4 rounded-full bg-white shadow transition-transform ${on ? "translate-x-4.5" : "translate-x-0.5"}`} />
      </button>
      Judge shortcuts
    </label>
  );
}
