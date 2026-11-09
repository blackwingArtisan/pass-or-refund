/** Reads the PayPal sandbox directly, so the checks don't depend on the app under test. */
import { loadEnvFiles } from "../../src/lib/env-core";

const API = "https://api-m.sandbox.paypal.com";

interface Amount {
  currency_code: string;
  value: string;
}

export interface PayPalObjects {
  order: { id: string; status: string; intent: string; purchase_units: { amount: Amount; custom_id?: string; invoice_id?: string; items?: { name: string; description?: string; quantity: string; unit_amount: Amount }[]; payments: { captures: { id: string; status: string; amount: Amount }[]; refunds?: { id: string; status: string }[] } }[] };
  capture: { id: string; status: string; amount: Amount };
  refund?: { id: string; status: string; status_details?: { reason: string }; amount: Amount; invoice_id?: string; note_to_payer?: string };
}

async function token(): Promise<string> {
  loadEnvFiles();
  const basic = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(`${API}/v1/oauth2/token`, { method: "POST", headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" }, body: "grant_type=client_credentials" });
  if (!res.ok) throw new Error(`PayPal token request failed: ${res.status}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

async function read<T>(path: string, bearer: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${bearer}` } });
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return (await res.json()) as T;
}

export async function readPayPalObjects(orderId: string, captureId: string, refundId?: string): Promise<PayPalObjects> {
  const bearer = await token();
  return {
    order: await read(`/v2/checkout/orders/${orderId}`, bearer),
    capture: await read(`/v2/payments/captures/${captureId}`, bearer),
    refund: refundId ? await read(`/v2/payments/refunds/${refundId}`, bearer) : undefined,
  };
}

async function send<T>(path: string, body: object): Promise<T> {
  const res = await fetch(`${API}${path}`, { method: "POST", headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`);
  return (await res.json()) as T;
}

/** PayPal takes the money and the app doesn't hear, which is what's left when the app stops halfway. */
export const captureBehindTheApp = (orderId: string) => send(`/v2/checkout/orders/${orderId}/capture`, {});

/** PayPal pays the refund and the app doesn't hear. */
export const refundBehindTheApp = (captureId: string) => send(`/v2/payments/captures/${captureId}/refund`, {});

export async function readRefunds(orderId: string) {
  return (await read<PayPalObjects["order"]>(`/v2/checkout/orders/${orderId}`, await token())).purchase_units[0].payments.refunds ?? [];
}
