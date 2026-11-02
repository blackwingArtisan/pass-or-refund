/**
 * Orders and refunds through PayPal's APIMatic-generated Server SDK, written from the PayPal
 * Context Plugin's TypeScript skills (docs/APIMATIC-CONTEXT-PLUGIN.md). It extends the kit's
 * sandbox client and swaps only the calls this app's money path makes, so the kit's
 * instrument() still puts them on the timeline and in the ledger, and the Guard sees one PayPalApi.
 * Mock mode never loads this path: getPayPal() returns the kit's mock client there.
 */
import { ApiError, CheckoutPaymentIntent, Client, Environment, OrdersController, PaymentsController } from "@paypal/paypal-server-sdk";
import type { ApiResponse, OrderRequest, PurchaseUnitRequest, RefundRequest } from "@paypal/paypal-server-sdk";
import type { PayPalApi } from "./api";
import { PayPalApiError, PayPalNetworkError } from "./errors";
import { recordCallMeta } from "./meta";
import { SandboxPayPal, type SandboxConfig } from "./sandbox";
import type * as T from "./types";

const REPRESENTATION = "return=representation";
const TIMEOUT_MS = 25_000;

/**
 * One long-lived client. Environment.Sandbox is hard-coded: this app has no live path.
 * The generated timeout default is 0 (no limit) and retries are off, so both are set here. GETs
 * retry; a POST never does. maximumRetryWaitTime defaults to 0, which would switch retries off.
 */
export function createServerSdkClient({ clientId, clientSecret }: Pick<SandboxConfig, "clientId" | "clientSecret">): Client {
  return new Client({
    clientCredentialsAuthCredentials: { oAuthClientId: clientId, oAuthClientSecret: clientSecret },
    environment: Environment.Sandbox,
    timeout: TIMEOUT_MS,
    httpClientOptions: { timeout: TIMEOUT_MS, retryConfig: { maxNumberOfRetries: 2, maximumRetryWaitTime: 10, httpMethodsToRetry: ["GET"] } },
  });
}

function toSdkOrder(body: T.CreateOrderRequest): OrderRequest {
  const purchaseUnits: PurchaseUnitRequest[] = body.purchase_units.map((unit) => ({
    referenceId: unit.reference_id,
    amount: { currencyCode: unit.amount.currency_code, value: unit.amount.value },
    description: unit.description,
    customId: unit.custom_id,
    invoiceId: unit.invoice_id,
  }));
  return { intent: body.intent === "AUTHORIZE" ? CheckoutPaymentIntent.Authorize : CheckoutPaymentIntent.Capture, purchaseUnits };
}

function toSdkRefund(body: T.RefundRequest): RefundRequest {
  return {
    amount: body.amount ? { currencyCode: body.amount.currency_code, value: body.amount.value } : undefined,
    invoiceId: body.invoice_id,
    customId: body.custom_id,
    noteToPayer: body.note_to_payer,
  };
}

/** A bare ApiError fills body, not result, and result keeps the wire's field names when present. */
function errorPayload(error: ApiError): unknown {
  if (error.result !== undefined) return error.result;
  try {
    return JSON.parse(String(error.body));
  } catch {
    return { message: String(error.body) };
  }
}

/**
 * The SDK parses each response into its typed models and throws if one doesn't fit. The ledger and
 * timeline read PayPal's wire JSON, so the same response's raw body is what comes back here.
 */
async function call<R>(op: string, requestId: string | undefined, send: () => Promise<ApiResponse<unknown>>): Promise<R> {
  try {
    const response = await send();
    recordCallMeta({ httpStatus: response.statusCode, debugId: response.headers["paypal-debug-id"], requestId });
    return JSON.parse(String(response.body)) as R;
  } catch (error) {
    if (error instanceof ApiError) {
      recordCallMeta({ httpStatus: error.statusCode, debugId: error.headers?.["paypal-debug-id"], requestId });
      throw PayPalApiError.fromResponse(error.statusCode, errorPayload(error), new Headers(error.headers), op);
    }
    if (error instanceof SyntaxError) throw error;
    throw new PayPalNetworkError(`Network error calling PayPal: ${op}`, op, { cause: error });
  }
}

export class ServerSdkPayPal extends SandboxPayPal {
  constructor(cfg: SandboxConfig & { sdkClient?: Client }) {
    super(cfg);
    const client = cfg.sdkClient ?? createServerSdkClient(cfg);
    const orders = new OrdersController(client);
    const payments = new PaymentsController(client);
    const kit: Pick<PayPalApi, "orders" | "payments"> = { orders: this.orders, payments: this.payments };

    this.orders = {
      ...kit.orders,
      // Test-card and vault orders stay on the kit's REST path. This app's checkout never sends one.
      create: (body, opts) =>
        body.payment_source
          ? kit.orders.create(body, opts)
          : call("orders.create", opts?.requestId, () => orders.createOrder({ body: toSdkOrder(body), paypalRequestId: opts?.requestId, prefer: REPRESENTATION })),
      get: (id) => call("orders.get", undefined, () => orders.getOrder({ id })),
      capture: (id, opts) => call("orders.capture", opts?.requestId, () => orders.captureOrder({ id, paypalRequestId: opts?.requestId, prefer: REPRESENTATION, body: {} })),
    };

    this.payments = {
      ...kit.payments,
      getCapture: (id) => call("payments.getCapture", undefined, () => payments.getCapturedPayment({ captureId: id })),
      refundCapture: (id, body, opts) =>
        call("payments.refundCapture", opts?.requestId, () =>
          payments.refundCapturedPayment({ captureId: id, paypalRequestId: opts?.requestId, prefer: REPRESENTATION, body: toSdkRefund(body ?? {}) }),
        ),
      getRefund: (id) => call("payments.getRefund", undefined, () => payments.getRefund({ refundId: id })),
    };
  }
}
