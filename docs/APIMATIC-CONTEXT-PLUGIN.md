# APIMatic Context Plugin: what was built with it

This app's Orders and refund code was written by Claude Code following the **PayPal Context Plugin** (the APIMatic-generated Markdown skills for the PayPal Server SDK, plugin version 0.1.0, TypeScript skills). The SDK is `@paypal/paypal-server-sdk` 2.5.0, pinned exactly. This file says what that covers and what it doesn't.

## Built with the plugin

All of it is in one file, [`src/lib/paypal/server-sdk.ts`](../src/lib/paypal/server-sdk.ts), plus its test.

| Call in the app's money path | SDK call | Where the app uses it |
|---|---|---|
| Create order | `OrdersController.createOrder` | Learner clicks buy |
| Get order | `OrdersController.getOrder` | The capture tool checks status and amount |
| Capture order | `OrdersController.captureOrder` | The learner's payment, through the Guard |
| Get capture | `PaymentsController.getCapturedPayment` | Refund amount and the read-back after refund |
| Refund capture | `PaymentsController.refundCapturedPayment` | The refund, through the Guard, after a person approves |
| Get refund | `PaymentsController.getRefund` | The read-back shown on the refund screen |

## Which skill shaped what

| Plugin skill | What it decided here |
|---|---|
| `typescript-getting-started`, `typescript-client-initialization` | One long-lived `Client`, controllers built from it, `Environment.Sandbox` |
| `typescript-authentication` | `clientCredentialsAuthCredentials`, leaving the token flow to the SDK |
| `typescript-calling-endpoints` | Options-object calls, `paypalRequestId` and `prefer`, enums such as `CheckoutPaymentIntent` rather than bare strings, camelCase body models, split `import type` |
| `typescript-configuration-resilience` | An explicit 25 second timeout (the default is none), retries only on GET, and setting `maximumRetryWaitTime` as well, because leaving it at 0 turns retries off |
| `typescript-error-handling` | Catching `ApiError`, reading `body` when `result` is empty, treating transport errors separately |
| `typescript-testing` | The stub adapter behind `unstable_httpClientOptions` and a seeded `oAuthToken`, used in [`tests/unit/server-sdk.test.ts`](../tests/unit/server-sdk.test.ts), so every generated layer above HTTP runs in the test |

`typescript-models` was only searched for specific terms, not read in full.

## Not built with the plugin

- **The Guard, the tools and the approval gate** are the kit's and this app's own code. The SDK sits behind them.
- **Mock mode** uses the kit's `MockPayPal`. The SDK isn't used there.
- **The test-card step** (`/api/dev/sandbox/approve-order`) and any order with a `payment_source`, which includes the seed script's card sales, stay on the kit's REST client. So do webhooks, invoicing and payouts.
- **The buyer button** is PayPal's JS SDK v6, a different product.
- **The grading, the course and the UI** have nothing to do with the plugin.

## How the SDK sits next to the kit

`ServerSdkPayPal` extends the kit's `SandboxPayPal` and swaps only the six calls above. The kit's `getPayPal()` still returns one `PayPalApi`, so its timeline, ledger and Guard work unchanged. The kit reads PayPal's wire JSON, whose fields are snake_case, while the SDK's models are camelCase. So the adapter takes the SDK's call and its parsed-response check, then returns the same response's raw body. One deliberate cost: the app doesn't consume the SDK's typed response models.

## Evidence

- `tests/e2e/pass-or-refund.spec.ts` runs on the real sandbox through this client (`npm run test:e2e:sandbox`) and re-reads the order, capture and refund directly from PayPal's API.
- `spikes/apimatic/` in the hackathon workspace has the first working sandbox call, which this code grew from. It isn't part of this repo.
