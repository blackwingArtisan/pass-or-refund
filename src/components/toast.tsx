"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { cn } from "./ui/cn";

type Variant = "success" | "error" | "info" | "warning";
interface Toast {
  id: number;
  title: string;
  description?: string;
  variant: Variant;
  /** Shows "Try again in Ns", ticks down, and clears the toast at zero. */
  countdownSeconds?: number;
}
type ToastInput = Omit<Toast, "id" | "variant"> & { variant?: Variant; durationMs?: number };

const ToastContext = createContext<{ toast: (t: ToastInput) => void } | null>(null);

const ICON = { success: CheckCircle2, error: XCircle, info: Info, warning: AlertTriangle };
const TONE = { success: "text-emerald-600", error: "text-red-600", info: "text-brand", warning: "text-amber-600" };

/** toast({ title: "Captured $45.00", description: "Capture 3K9...", variant: "success" }) */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const toast = useCallback(
    ({ durationMs, variant = "info", ...t }: ToastInput) => {
      const id = Date.now() + Math.random();
      setToasts((prev) => [...prev.slice(-3), { ...t, variant, id }]);
      // Errors and countdowns stay until dismissed (countdowns clear themselves at zero).
      const stays = t.countdownSeconds !== undefined || variant === "error";
      if (durationMs !== undefined || !stays) setTimeout(() => dismiss(id), durationMs ?? 4500);
    },
    [dismiss],
  );
  const value = useMemo(() => ({ toast }), [toast]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
        {toasts.map((t) => {
          const Icon = ICON[t.variant];
          return (
            <div key={t.id} className="pointer-events-auto flex animate-slide-up items-start gap-3 rounded-xl border border-zinc-200 bg-white p-3.5 shadow-lg" role="status">
              <Icon className={cn("mt-0.5 size-5 shrink-0", TONE[t.variant])} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-zinc-900">{t.title}</p>
                {t.description ? <p className="mt-0.5 break-words text-sm text-zinc-500">{t.description}</p> : null}
                {t.countdownSeconds !== undefined ? <Countdown seconds={t.countdownSeconds} onDone={() => dismiss(t.id)} /> : null}
              </div>
              <button onClick={() => dismiss(t.id)} className="text-zinc-400 hover:text-zinc-600" aria-label="Dismiss">
                <X className="size-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

function Countdown({ seconds, onDone }: { seconds: number; onDone: () => void }) {
  const [left, setLeft] = useState(seconds);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  useEffect(() => {
    if (left <= 0) {
      done.current();
      return;
    }
    const timer = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(timer);
  }, [left]);
  return (
    <p className="mt-1 text-sm font-medium text-zinc-700" data-testid="busy-countdown">
      Try again in {left}s
    </p>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
