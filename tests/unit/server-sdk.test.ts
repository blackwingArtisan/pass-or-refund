import { Client, Environment } from "@paypal/paypal-server-sdk";
import { describe, expect, it, vi } from "vitest";
import { PayPalApiError, PayPalNetworkError } from "@/lib/paypal/errors";
import { createServerSdkClient, ServerSdkPayPal } from "@/lib/paypal/server-sdk";

interface StubRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  data?: string;
}

const CAPTURE = { id: "CAP1", status: "COMPLETED", amount: { currency_code: "USD", value: "49.00" } };
const REFUND = { id: "REF1", status: "COMPLETED", amount: { currency_code: "USD", value: "49.00" } };

/** A PayPal client whose HTTP layer is a stub. Every generated SDK layer above it runs for real. */
function stubbed(respond: (request: StubRequest) => { status: number; body: unknown; headers?: Record<string, string> }) {
  const requests: StubRequest[] = [];
  const adapter = vi.fn(async (config: StubRequest) => {
    requests.push(config);
    const { status, body, headers } = respond(config);
    return { data: JSON.stringify(body), status, statusText: String(status), headers: { "content-type": "application/json", ...headers }, config };
  });
  const sdkClient = new Client({
    clientCredentialsAuthCredentials: {
      oAuthClientId: "id",
      oAuthClientSecret: "secret",
      oAuthToken: { accessToken: "token", tokenType: "Bearer", expiry: BigInt(Math.floor(Date.now() / 1000) + 3600) },
    },
    environment: Environment.Sandbox,
    unstable_httpClientOptions: { adapter },
  });
  return { paypal: new ServerSdkPayPal({ clientId: "id", clientSecret: "secret", sdkClient }), requests };
}

describe("server SDK PayPal client", () => {
  it("is fixed to the sandbox", async () => {
    const client = createServerSdkClient({ clientId: "id", clientSecret: "secret" }) as unknown as { _config: { environment: Environment } };
    expect(client._config.environment).toBe(Environment.Sandbox);

    const { paypal, requests } = stubbed(() => ({ status: 200, body: CAPTURE }));
    await paypal.payments.getCapture("CAP1");
    expect(requests[0].url).toBe("https://api-m.sandbox.paypal.com/v2/payments/captures/CAP1");
  });

  it("creates an order with PayPal's wire fields and the request id", async () => {
    const { paypal, requests } = stubbed(() => ({ status: 201, body: { id: "ORDER1", status: "CREATED" } }));
    const order = await paypal.orders.create(
      { intent: "CAPTURE", purchase_units: [{ amount: { currency_code: "USD", value: "49.00" }, custom_id: "en_1", description: "Sharp at Home" }] },
      { requestId: "order-en_1" },
    );
    expect(order).toMatchObject({ id: "ORDER1", status: "CREATED" });
    expect(requests[0].method.toUpperCase()).toBe("POST");
    expect(requests[0].headers["PayPal-Request-Id"]).toBe("order-en_1");
    expect(requests[0].headers.Prefer).toBe("return=representation");
    expect(JSON.parse(requests[0].data!)).toEqual({ intent: "CAPTURE", purchase_units: [{ amount: { currency_code: "USD", value: "49.00" }, custom_id: "en_1", description: "Sharp at Home" }] });
  });

  it("sends the order's item line, item total and invoice_id, so PayPal's window and records carry the terms", async () => {
    const { paypal, requests } = stubbed(() => ({ status: 201, body: { id: "ORDER2", status: "CREATED" } }));
    const price = { currency_code: "USD", value: "49.00" };
    const item = { name: "Sharp at Home · rubric v1 · ada21f9fbe03", description: "Full refund if you fail the public final check twice.", quantity: "1", unit_amount: price, category: "DIGITAL_GOODS" };
    await paypal.orders.create({ intent: "CAPTURE", purchase_units: [{ amount: { ...price, breakdown: { item_total: price } }, custom_id: "en_2", invoice_id: "PR-v1-ada21f9fbe03-en_2", items: [item] }] }, { requestId: "order-en_2" });
    expect(JSON.parse(requests[0].data!)).toEqual({ intent: "CAPTURE", purchase_units: [{ amount: { ...price, breakdown: { item_total: price } }, custom_id: "en_2", invoice_id: "PR-v1-ada21f9fbe03-en_2", items: [item] }] });
  });

  it("returns PayPal's own JSON with snake_case fields", async () => {
    const body = { id: "ORDER1", status: "COMPLETED", purchase_units: [{ payments: { captures: [CAPTURE] } }] };
    const { paypal, requests } = stubbed(() => ({ status: 201, body }));
    const order = await paypal.orders.capture("ORDER1", { requestId: "capture-1" });
    expect(order.purchase_units?.[0].payments?.captures?.[0].id).toBe("CAP1");
    expect(requests[0].url).toContain("/v2/checkout/orders/ORDER1/capture");
    expect(requests[0].headers["PayPal-Request-Id"]).toBe("capture-1");
  });

  it("refunds with the amount from the caller and reads the refund back", async () => {
    const { paypal, requests } = stubbed(() => ({ status: 201, body: REFUND }));
    const refund = await paypal.payments.refundCapture("CAP1", { amount: { currency_code: "USD", value: "49.00" }, invoice_id: "PR-v1-x-en_1", note_to_payer: "Sorry" }, { requestId: "refund-1" });
    expect(refund).toMatchObject({ id: "REF1", status: "COMPLETED" });
    expect(requests[0].url).toContain("/v2/payments/captures/CAP1/refund");
    expect(requests[0].headers["PayPal-Request-Id"]).toBe("refund-1");
    expect(JSON.parse(requests[0].data!)).toEqual({ amount: { currency_code: "USD", value: "49.00" }, invoice_id: "PR-v1-x-en_1", note_to_payer: "Sorry" });

    await paypal.payments.getRefund("REF1");
    expect(requests[1].url).toContain("/v2/payments/refunds/REF1");
  });

  it("maps a PayPal refusal to the kit's error with its issue and debug id", async () => {
    const { paypal } = stubbed(() => ({
      status: 422,
      body: { name: "UNPROCESSABLE_ENTITY", message: "Refused", debug_id: "dbg-1", details: [{ issue: "CAPTURE_FULLY_REFUNDED" }] },
      headers: { "paypal-debug-id": "dbg-1" },
    }));
    const error = await paypal.payments.refundCapture("CAP1", {}, { requestId: "refund-2" }).catch((e) => e);
    expect(error).toBeInstanceOf(PayPalApiError);
    expect(error).toMatchObject({ status: 422, debugId: "dbg-1" });
    expect(String(JSON.stringify(error.details ?? error.issue ?? error.message))).toContain("CAPTURE_FULLY_REFUNDED");
  });

  it("maps a dropped connection to the kit's network error", async () => {
    const { paypal } = stubbed(() => {
      throw new Error("socket hang up");
    });
    await expect(paypal.orders.get("ORDER1")).rejects.toBeInstanceOf(PayPalNetworkError);
  });
});
