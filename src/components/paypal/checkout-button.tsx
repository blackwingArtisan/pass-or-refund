"use client";

/**
 * Buyer approval button.
 *   - PAYPAL_MODE=sandbox: the real PayPal JS SDK v6 button (@paypal/react-paypal-js/sdk-v6),
 *     environment hard-coded to "sandbox".
 *     Without a sandbox login, the buyer picks "Pay with Debit or Credit Card" in PayPal's window
 *     and uses PayPal's sandbox test card, which the page shows. With DEMO_TEST_CARD=1, a
 *     server-side test-card button also appears, but only on `?test-card=1`, for automated tests.
 *     `checkPayment` covers a PayPal window that takes the payment but never tells the page: while
 *     the window is open the page asks the server, which reads the order from PayPal.
 *   - PAYPAL_MODE=mock: a clearly labelled "Simulate PayPal approval" button + dialog that
 *     follows the same server flow (create order -> buyer approves -> onApprove).
 *
 *   <CheckoutButton
 *     createOrder={async () => ({ orderId: (await kitFetch("/api/paypal/orders", { json: {...} })).id })}
 *     onApprove={async ({ orderId }) => { await kitFetch(`/api/paypal/orders/${orderId}/capture`, { method: "POST" }) }}
 *   />
 */
import { createElement, useCallback, useEffect, useRef, useState } from "react";
import { PayPalProvider, usePayPal, usePayPalOneTimePaymentSession } from "@paypal/react-paypal-js/sdk-v6";
import { CreditCard, FlaskConical, ShieldCheck, Wallet } from "lucide-react";
import { Button } from "../ui/button";
import { Modal } from "../ui/modal";
import { Skeleton } from "../ui/skeleton";
import { useKit } from "../kit/kit-provider";

export interface CheckoutButtonProps {
  createOrder: () => Promise<{ orderId: string }>;
  onApprove: (data: { orderId: string; payerId?: string }) => Promise<void>;
  onCancel?: () => void;
  onError?: (error: Error) => void;
  /** Shown in the simulated checkout dialog, e.g. "$120.00". */
  amountLabel?: string;
  disabled?: boolean;
  label?: string;
  /** Mock only: the buyer the simulated PayPal window approves as. Defaults to the sandbox buyer. */
  buyerEmail?: string;
  /**
   * Sandbox: asked every few seconds while PayPal's window is open. Return true once the payment is
   * recorded (the server read the order from PayPal), and the window is closed for the buyer.
   */
  checkPayment?: (orderId: string) => Promise<boolean>;
}

const SANDBOX = "sandbox" as const; // never read from env: v6 picks the environment from this prop only
const CHECK_EVERY_MS = 2_500;
const CHECK_FOR_MS = 15 * 60_000;

/** The server-side test card is for automated tests: it only shows on `?test-card=1`. */
const testCardRequested = () => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("test-card") === "1";

export function CheckoutButton(props: CheckoutButtonProps) {
  const { status } = useKit();
  if (!status) return <Skeleton className="h-11 w-full max-w-sm rounded-lg" />;
  if (status.paypal.mode === "mock") return <MockCheckoutButton {...props} buyerEmail={props.buyerEmail || status.paypal.buyerEmail} />;
  if (!status.paypal.clientId) return <p className="text-sm text-red-600">PAYPAL_CLIENT_ID is missing.</p>;
  return (
    <div className="w-full max-w-sm" data-testid="paypal-v6-button">
      <PayPalProvider clientId={status.paypal.clientId} environment={SANDBOX} components={["paypal-payments"]} pageType="checkout">
        <PayPalWindowButton {...props} />
      </PayPalProvider>
      <PayWithoutAccount />
      {status.paypal.testCard && testCardRequested() ? <TestCardButton {...props} /> : null}
    </div>
  );
}

/** How a judge pays with no PayPal login: PayPal's own guest card form, with PayPal's public sandbox test card. */
function PayWithoutAccount() {
  return (
    <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-600" data-testid="pay-without-account">
      <p className="flex items-center gap-1.5 font-semibold text-zinc-800">
        <ShieldCheck className="size-3.5 shrink-0 text-brand" /> No PayPal account? Pay with debit or credit card inside PayPal&rsquo;s window.
      </p>
      <p className="mt-1">This is PayPal&rsquo;s sandbox, so no real money moves. Use PayPal&rsquo;s sandbox test card:</p>
      <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5" data-testid="sandbox-card-details">
        <dt className="text-zinc-500">Card</dt>
        <dd className="font-mono text-zinc-900">4111 1111 1111 1111</dd>
        <dt className="text-zinc-500">Expiry</dt>
        <dd className="font-mono text-zinc-900">12/30, or any future date</dd>
        <dt className="text-zinc-500">CVV</dt>
        <dd className="font-mono text-zinc-900">123</dd>
      </dl>
      <p className="mt-1.5">Any name, US address and phone number work.</p>
    </div>
  );
}

/**
 * PayPal's v6 button: the same `<paypal-button>` that PayPalOneTimePaymentButton renders, with the
 * session in hand so the page can close PayPal's window once the server has the payment.
 */
function PayPalWindowButton({ createOrder, onApprove, onCancel, onError, disabled, checkPayment }: CheckoutButtonProps) {
  const { isHydrated } = usePayPal();
  const checking = useRef<{ orderId: string; until: number } | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const stop = useCallback(() => {
    checking.current = null;
    setOrderId(null);
  }, []);

  const session = usePayPalOneTimePaymentSession({
    presentationMode: "auto",
    createOrder: async () => {
      const created = await createOrder();
      checking.current = { orderId: created.orderId, until: Date.now() + CHECK_FOR_MS };
      setOrderId(created.orderId);
      return created;
    },
    onApprove: async (data) => {
      stop();
      await onApprove({ orderId: data.orderId, payerId: data.payerId });
    },
    onCancel: () => {
      stop();
      onCancel?.();
    },
    onError: (e) => {
      stop();
      onError?.(new Error(e?.message ?? "PayPal checkout error"));
    },
  });
  const { handleCancel, handleClick, isPending, error } = session;

  useEffect(() => {
    if (!orderId || !checkPayment) return;
    const timer = setInterval(async () => {
      const current = checking.current;
      if (!current || current.orderId !== orderId) return;
      if (Date.now() > current.until) return stop();
      const paid = await checkPayment(orderId).catch(() => false);
      if (paid && checking.current?.orderId === orderId) {
        stop();
        handleCancel(); // closes PayPal's window, which took the payment but never told the page
      }
    }, CHECK_EVERY_MS);
    return () => clearInterval(timer);
  }, [orderId, checkPayment, handleCancel, stop]);

  useEffect(() => {
    if (error) console.error(error);
  }, [error]);

  if (!isHydrated) return <div />;
  return createElement("paypal-button", { onClick: handleClick, type: "pay", disabled: disabled || isPending || error !== null ? true : undefined });
}

function TestCardButton({ createOrder, onApprove, onError, disabled }: CheckoutButtonProps) {
  const { kitFetch } = useKit();
  const [busy, setBusy] = useState(false);

  async function pay() {
    setBusy(true);
    try {
      const { orderId } = await createOrder();
      await kitFetch(`/api/dev/sandbox/approve-order/${orderId}`, { method: "POST" });
      await onApprove({ orderId });
    } catch (e) {
      onError?.(e as Error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="secondary" className="mt-3 w-full" icon={<CreditCard className="size-4" />} loading={busy} disabled={disabled} onClick={pay} data-testid="sandbox-test-card">
      Pay with sandbox test card
    </Button>
  );
}

function MockCheckoutButton({ createOrder, onApprove, onCancel, onError, amountLabel, disabled, label, buyerEmail }: Omit<CheckoutButtonProps, "buyerEmail"> & { buyerEmail: string }) {
  const { kitFetch } = useKit();
  const [orderId, setOrderId] = useState<string | null>(null);
  const [busy, setBusy] = useState<"create" | "approve" | null>(null);

  async function start() {
    setBusy("create");
    try {
      const { orderId } = await createOrder();
      setOrderId(orderId);
    } catch (e) {
      onError?.(e as Error);
    } finally {
      setBusy(null);
    }
  }

  async function approve() {
    if (!orderId) return;
    setBusy("approve");
    try {
      await kitFetch(`/api/dev/mock/approve-order/${orderId}`, { json: { email: buyerEmail } });
      setOrderId(null);
      await onApprove({ orderId });
    } catch (e) {
      onError?.(e as Error);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="w-full max-w-sm">
      <button
        type="button"
        onClick={start}
        disabled={disabled || !!busy}
        data-testid="simulate-paypal-approval"
        className="group flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#ffc439] font-semibold text-[#111] shadow-sm transition hover:brightness-95 active:scale-[0.99] disabled:opacity-50"
      >
        <Wallet className="size-4" />
        {busy === "create" ? "Creating order…" : (label ?? "Simulate PayPal approval")}
        <span className="rounded bg-black/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide">Mock</span>
      </button>
      <p className="mt-2 flex items-center gap-1.5 text-xs text-zinc-500">
        <FlaskConical className="size-3.5" /> Mock mode: no real PayPal window. Same server flow as sandbox.
      </p>
      <Modal
        open={!!orderId}
        onClose={() => {
          setOrderId(null);
          onCancel?.();
        }}
        title="Simulated PayPal checkout"
        description="In sandbox or live mode this is PayPal's own approval window."
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setOrderId(null);
                onCancel?.();
              }}
            >
              Cancel
            </Button>
            <Button onClick={approve} loading={busy === "approve"} data-testid="mock-approve">
              Approve payment
            </Button>
          </>
        }
      >
        <div className="space-y-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm">
          <div className="flex justify-between">
            <span className="text-zinc-500">Buyer</span>
            <span className="font-medium">{buyerEmail}</span>
          </div>
          {amountLabel ? (
            <div className="flex justify-between">
              <span className="text-zinc-500">Amount</span>
              <span className="font-semibold tabular-nums">{amountLabel}</span>
            </div>
          ) : null}
          <div className="flex justify-between">
            <span className="text-zinc-500">Order</span>
            <span className="font-mono text-xs">{orderId}</span>
          </div>
        </div>
      </Modal>
    </div>
  );
}
