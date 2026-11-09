"use client";

import { useSyncExternalStore, type ReactNode } from "react";

/**
 * Clean mode hides everything that is there for judges (the For judges menu, the prepared answers,
 * the PayPal and AI mode badges and the AI spend meter) so a recording shows only what a learner
 * or a creator would see. The demo turns it on with DEMO_CLEAN=1, which sets this key in the
 * browser, so it works the same on a local build and on the hosted site.
 */
export const CLEAN_KEY = "por_clean";

function read() {
  if (process.env.NEXT_PUBLIC_DEMO_CLEAN === "1") return true;
  try {
    return window.localStorage.getItem(CLEAN_KEY) === "1";
  } catch {
    return false;
  }
}

const subscribe = () => () => undefined;

export function useCleanMode(): boolean {
  return useSyncExternalStore(subscribe, read, () => process.env.NEXT_PUBLIC_DEMO_CLEAN === "1");
}

/** Renders its children only when clean mode is off. */
export function HideWhenClean({ children }: { children: ReactNode }) {
  return useCleanMode() ? null : <>{children}</>;
}
