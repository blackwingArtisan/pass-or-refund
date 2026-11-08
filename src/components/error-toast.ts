"use client";

/**
 * Error toasts in plain words.
 *   const { toast } = useToast();
 *   showError(toast, "That didn't save", e);   // a 429 becomes a live "Try again in Ns" that clears itself
 * Error toasts stay until dismissed (see toast.tsx).
 */
import { plainMessage } from "@/lib/plain-message";
import { ApiError } from "./kit/kit-provider";
import type { useToast } from "./toast";

type ToastFn = ReturnType<typeof useToast>["toast"];

/** Seconds to wait when the server said "too many requests", else undefined. */
export const retryAfterOf = (error: unknown) => (error instanceof ApiError ? error.retryAfterSeconds : undefined);

export function showError(toast: ToastFn, title: string, error: unknown) {
  const wait = retryAfterOf(error);
  if (wait) {
    toast({ title: "Busy right now", description: "Nothing was lost. Please wait a moment.", variant: "warning", countdownSeconds: wait });
    return;
  }
  toast({ title, description: plainMessage(error), variant: "error" });
}
