# Pass or Refund

> Online courses that pay you back if they can't teach you: Claude grades the final check against a public rubric, and a second fail sends a real PayPal refund to a person for approval.

**Live demo:** not deployed yet · **Video (3 min or less):** not recorded yet · **License:** MIT

## The problem

People don't trust online courses, because a guarantee usually means small print and an email to support. Creators with a good course have no way to prove it. A guarantee only means something if it's tied to whether you learned, and if paying it out doesn't depend on anyone's mood.

## What it does

- **Buy with the guarantee in view.** The terms sit next to the pay button. PayPal captures the payment at purchase.
- **Take the final check.** Four written questions, 25 points each, on a short sample course, *Sharp at Home* by a made-up creator.
- **See your grade point by point.** Every rubric item shows met, partial or missed, with the words quoted from your answer. Missed items become your study list.
- **Pass:** you get a certificate, and no refund happens.
- **Fail once:** you get the study list and a second attempt.
- **Fail twice:** the refund goes to a person on the course team. After they approve, PayPal pays it and you see "Refund issued, sorry we let you down", with the refund id and status read back from PayPal.

**The refund rule.** It takes two completed failing attempts: every question answered and at least 25 points each time. Trying to instruct the grader gets no credit, is flagged and voids the guarantee.

## How PayPal is used

All PayPal calls go to the **sandbox** (`https://api-m.sandbox.paypal.com`); there is no live mode in the code. Every call shows on the in-app timeline with its HTTP status and PayPal `debug_id`.

| PayPal API | Endpoint(s) | Where and why |
|---|---|---|
| JS SDK v6 (buyer approval) | `web-sdk/v6/core`, `PayPalOneTimePaymentButton` | The buy button on `/course`. A sandbox test card button sits beside it for people with no sandbox login. |
| Orders v2 | `POST /v2/checkout/orders`, `GET /v2/checkout/orders/{id}`, `POST .../capture` | One `CAPTURE` order per enrollment. The server sets the amount. |
| Payments v2 | `GET /v2/payments/captures/{id}`, `POST .../refund`, `GET /v2/payments/refunds/{id}` | The refund amount comes from the capture, and the result is read back after the refund. |

**Built with the APIMatic PayPal Context Plugin.** In sandbox, the Orders and Payments calls above run on `@paypal/paypal-server-sdk` 2.5.0, written by following the plugin's TypeScript skills. Mock mode uses the kit's mock client. [docs/APIMATIC-CONTEXT-PLUGIN.md](docs/APIMATIC-CONTEXT-PLUGIN.md) lists exactly what was and wasn't built with it.

**Safety around money:** both money steps (`capture_course_payment`, `refund_course_purchase`) are guarded tools. The Guard enforces a per-action cap, a daily cap and idempotency (`PayPal-Request-Id`). A refund always waits for a person, whatever the amount. The refund amount is computed in code from the PayPal capture and is never passed in or set by AI. Every decision goes to a hash-chained, append-only audit log, shown on `/activity`.

## How AI is used

| Where | Model | What it does |
|---|---|---|
| Grading the final check | Claude Sonnet 5.5 (`claude-sonnet-5-5`) | Gives each rubric item a verdict with a verbatim quote, and flags attempts to instruct the grader. It never adds up points. |

- **AI suggests, code and a person decide.** Code turns verdicts into points (met = full, partial = half rounded down, missed = 0), applies caps and adds up. Under 66 fails and over 73 passes. From 66 to 73 it grades twice more and takes the median: 71 or more passes, 68 or less fails, and 69 or 70 goes to a person.
- **The method is sealed.** Prompts, rules and scoring in `src/lib/grading/frozen/` are byte copies of the set tested on held-out data. A unit test checks their hashes.
- **Structured output**: zod schemas through the Messages API's structured outputs (`output_config.format`).
- **Cost control**: a hard daily spend cap and per-IP rate limits. A real grade costs about $0.014.
- **Mock mode**: without an API key the app replays recorded verdicts for the demo answers, clearly labelled, so the demo works anywhere.

**Built with AI.** This project was built with **Claude Code** (Anthropic's coding agent), which wrote the code under human direction. It started from a shared starter kit that Claude Code also wrote. The product idea, scope and review were human decisions.

## Architecture

```
Browser (Next.js 16 / React 19, Tailwind)
  │  PayPal JS SDK v6 button ─────────────► PayPal sandbox checkout (buyer approval)
  │  SSE /api/events (live timeline)
  ▼
Next.js route handlers (Node)
  ├─ lib/course   enrollments, guarantee policy, purchase, attempts, refund
  ├─ lib/grading  sealed prompts and scoring, the decision band, mock verdicts
  ├─ agents/tools capture_course_payment, refund_course_purchase (risk: money)
  ├─ lib/agent    Guard: caps, approvals, idempotency, audit
  ├─ lib/paypal   Server SDK client for Orders and Payments in sandbox, in-memory mock otherwise
  ├─ lib/ai       Claude Sonnet 5.5 structured output; daily spend cap
  └─ .data/       local JSON: enrollments, ledger, audit log, AI spend
```

## Run locally

Requirements: Node 24+ (developed on Node 26), npm.

```bash
npm ci
PAYPAL_MODE=mock AI_MODE=mock npm run dev      # no credentials needed
```

Open http://localhost:3020, go to **Course**, buy it, then use the demo answer buttons above the quiz. For the real sandbox set `PAYPAL_MODE=sandbox`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` and `DEMO_TEST_CARD=1`. For real AI set `ANTHROPIC_API_KEY`.

Checks: `npm run check` (lint, typecheck, unit tests, build), `npm run test:e2e` (mock PayPal), `npm run test:e2e:sandbox` (real sandbox), `npm run test:sandbox`. Set `E2E_BASE_URL` to run the sandbox flows against a deployed copy.

## Sandbox test accounts

1. In the PayPal Developer Dashboard → **Testing Tools → Sandbox Accounts**, use the default Personal (buyer) and Business (seller) accounts or create new ones.
2. Create a sandbox REST app under **Apps & Credentials → Sandbox** and copy its client ID and secret.
3. At checkout, log in with the **Personal** sandbox account (password on the account's details page).
4. Optional: add a webhook for `https://<your-deploy>/api/paypal/webhooks` and set `PAYPAL_WEBHOOK_ID`.

With `DEMO_TEST_CARD=1`, no buyer login is needed: **Pay with sandbox test card** completes the purchase.

## Deploy

Render Blueprint (`render.yaml`): New → Blueprint → this repo, then enter the secrets in the dashboard.

## Limitations

- Sandbox only; no live payments are possible.
- Automated sandbox tests pay with PayPal's test card, and the mock flow uses the simulated approval.
- Local JSON storage: data resets on redeploy (fine for a demo, not for production).
- `/team` has no login, so anyone who can open the demo can approve a refund. Fine in sandbox, not for production.
- A score in the review band stops at "under review". There's no screen yet for a person to settle it.
- Not built yet: a gap between attempts, near-copy detection, one refund per learner per course, and a cap on attempts.
- The real PayPal wallet popup is untested, because it needs a sandbox buyer login. Tests pay with the test card.

## License

MIT, see [LICENSE](LICENSE).
