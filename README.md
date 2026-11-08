# Pass or Refund

> Online courses that pay you back if they can't teach you: Claude grades the final check against a public rubric, and a second fail sends a real PayPal refund to a person for approval.

**Live demo:** https://pass-or-refund.onrender.com · **Video (3 min or less):** not recorded yet · **License:** MIT

## Who it's for

Course creators who sell a skill course they know works, to buyers who've been burned by small-print guarantees. The landing page puts the creator's case first: the knobs (price $49, pass mark 70, two fails 24 hours apart), the refund rate on a sample cohort, what one AI grade costs, what a sale is worth after refunds and grading, and the six rules that stop a learner taking the course and failing on purpose.

## The problem

People don't trust online courses, because a guarantee usually means small print and an email to support. Creators with a good course have no way to prove it. A guarantee only means something if it's tied to whether you learned, and if paying it out doesn't depend on anyone's mood.

## What it does

- **Buy with the guarantee in view.** The terms sit next to the pay button. PayPal captures the payment at purchase.
- **Take the final check.** Four written questions, 25 points each, on a short sample course, *Sharp at Home* by a made-up creator.
- **See your grade point by point.** Every rubric item shows met, partial or missed, with the words quoted from your answer. Missed items become your study list.
- **Pass:** you get a certificate, and no refund happens.
- **Fail once:** you tick off the study list item by item, and your next attempt opens 24 hours later. Judges can press **Skip the wait (demo)** to fail twice right away.
- **Fail twice:** a refund agent checks the policy, proposes the refund with its reasons, and stops. After a person on the course team approves, PayPal pays it and you see "Refund issued, sorry we let you down", with the refund id and status read back from PayPal.
- **A person declines:** no money moves, and you read the decision and their note on your page.
- **A score of 69 or 70:** you see "under review, answer within one business day", and no refund starts. On `/team` a person goes through every item that lost points, one tick each, adds a note and decides. Your score stays as graded, and a fail counts like any other, so a second one sends the refund to the same approval.
- **Course creators** see `/cohort`: pass rate by course and question, refunds, and the rubric items learners miss most, so they know which lesson to fix. Until real learners arrive it shows a labelled sample cohort of 36 made-up learners graded on the real rubric.

**The refund rule, enforced in code (`src/lib/course/policy.ts`).** It takes two completed failing attempts: every question answered, at least 25 points each time, and not a near-copy of an earlier attempt (90% of the same words, in any order). The learner must tick off the first attempt's study list before the second one counts. Trying to instruct the grader gets no credit, is flagged and voids the guarantee. Each learner gets one refund per course, matched on the email typed at checkout and on the PayPal payer from the order: PayPal's account id, or the email PayPal has for the buyer, which a guest card checkout in PayPal's window also gives (a declined or blocked refund doesn't use it up). The purchase screen says "Guarantee: one refund per PayPal account". A refund ends the learner's access to the lessons.

## How PayPal is used

All PayPal calls go to the **sandbox** (`https://api-m.sandbox.paypal.com`); there is no live mode in the code. Every call shows on the in-app timeline with its HTTP status and PayPal `debug_id`.

| PayPal API | Endpoint(s) | Where and why |
|---|---|---|
| JS SDK v6 (buyer approval) | `web-sdk/v6/core`, `PayPalOneTimePaymentButton` | The buy button on `/course` opens PayPal's own checkout window. With no sandbox login, choose **Pay with Debit or Credit Card** there and use PayPal's test card (4111 1111 1111 1111, any future date, any CVV); the sandbox suite and the demo pay this way. A server-side test card button sits beside it as a shortcut. |
| Orders v2 | `POST /v2/checkout/orders`, `GET /v2/checkout/orders/{id}`, `POST .../capture` | One `CAPTURE` order per enrollment. The server sets the amount. |
| Payments v2 | `GET /v2/payments/captures/{id}`, `POST .../refund`, `GET /v2/payments/refunds/{id}` | The refund amount comes from the capture, and the result is read back after the refund. |
| Webhooks | `POST /v1/notifications/verify-webhook-signature`; `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.REFUNDED`, `CUSTOMER.DISPUTE.*` | Each verified event is matched to its enrollment by PayPal's ids. A capture event confirms the payment and enrolls a learner whose record missed it. A refund event records the refund and settles a `PENDING` one at once, with no timer. The refund card and `/team` say "PayPal's webhook confirmed it at" beside the read-back. Each event goes to the course team and to its own learner's timeline, never to other learners. |
| Disputes v1 | `GET /v1/customer/disputes/{id}`, `POST .../accept-claim` | A learner's dispute attaches to their enrollment. If the guarantee covers them, the refund agent proposes accepting it (`accept_dispute_claim`, behind the Guard), and only a person's approval pays it. If not, the team sees why and answers it in PayPal. |

**Built with the APIMatic PayPal Context Plugin.** In sandbox, the Orders and Payments calls above run on `@paypal/paypal-server-sdk` 2.5.0, written by following the plugin's TypeScript skills. Mock mode uses the kit's mock client. [docs/APIMATIC-CONTEXT-PLUGIN.md](docs/APIMATIC-CONTEXT-PLUGIN.md) lists exactly what was and wasn't built with it.

**Safety around money:** the money steps (`capture_course_payment`, `refund_course_purchase`, and `accept_dispute_claim` for a learner with an open dispute) are guarded tools. The Guard enforces a per-action cap, a daily cap and idempotency (`PayPal-Request-Id`). A refund always waits for a person, whatever the amount. The agent can only ask: the tool re-checks the policy and the PayPal capture before the approval and again before paying, and refuses any amount that isn't exactly what was paid, so a request for too much stops the refund with no PayPal call. Every decision goes to a hash-chained, append-only audit log, shown on `/activity`.

**Refunds that show PENDING.** This app has its own funded sandbox seller, so its refunds read `COMPLETED` straight away, and the sandbox suite fails on anything else. The background, for anyone running it on another account: PayPal pays a refund from the seller's PayPal balance. When the balance is smaller than the refund, PayPal draws on the seller's bank instead, and the refund stays `PENDING` with status reason `ECHECK`, even though the capture already reads `REFUNDED`. The shared sandbox seller usually holds less than the $49 price, and on a test account those refunds don't settle by themselves. Captured money doesn't reach the balance right away either: 20 minutes after $116.40 of test captures, a $30 refund still went `PENDING`. The app shows the status as PayPal reports it, tells the learner why in plain words, and settles it when PayPal's `PAYMENT.CAPTURE.REFUNDED` webhook arrives. Without webhooks, it asks PayPal again when the learner looks. A refund the balance covers goes straight to `COMPLETED`: the balance decides, not the code. The shared seller has done this at the full $49 when its balance happened to cover it, and at any time with a $2 price, by building with `NEXT_PUBLIC_COURSE_PRICE_CENTS=200`. A funded seller account gives `COMPLETED` on every refund.

**If the app stops halfway.** PayPal is the record of the money. If PayPal took a payment and our record never heard, opening the learner's page, or buying again with the same email, rebuilds the enrollment from the order, so nobody is stuck and nobody pays twice. The same goes for a refund: its order lists it, so the app records that refund and doesn't send another.

## How AI is used

| Where | Model | What it does |
|---|---|---|
| Grading the final check | Claude Sonnet 5.5 (`claude-sonnet-5-5`) | Gives each rubric item a verdict with a verbatim quote, and flags attempts to instruct the grader. It never adds up points. |
| Refund agent | Claude Haiku 5.5 (`claude-haiku-5-5`) | After a second fail, reads the policy check and proposes the refund with reasons. It sees scores and rule results, never the learner's answers. It runs only when code says a refund is due. |

- **AI suggests, code and a person decide.** Code turns verdicts into points (met = full, partial = half rounded down, missed = 0), applies caps and adds up. Under 66 fails and over 73 passes. From 66 to 73 it grades twice more and takes the median: 71 or more passes, 68 or less fails, and 69 or 70 goes to a person.
- **The method is sealed.** Prompts, rules and scoring in `src/lib/grading/frozen/` are byte copies of the set tested on held-out data. A unit test checks their hashes.
- **Structured output**: zod schemas through the Messages API's structured outputs (`output_config.format`).
- **Cost control**: a hard daily spend cap in the app (`AI_DAILY_CAP_USD`; once spent, grading stops with a plain message) and per-IP rate limits. A real grade costs about $0.014.
- **When the model is out:** a due refund still reaches a person. Code builds the proposal from the policy check, through the same tools and Guard, and the card says so. Grading can't be replaced by code, so the learner sees why it stopped, keeps their answers and loses nothing. Running out of AI credit gets its own message.
- **Mock mode**: without an API key the app replays recorded verdicts for the demo answers, clearly labelled, so the demo works anywhere.

**Built with AI.** This project was built with **Claude Code** (Anthropic's coding agent), which wrote the code under human direction. It started from a shared starter kit that Claude Code also wrote. The product idea, scope and review were human decisions.

## Architecture

```
Browser (Next.js 16 / React 19, Tailwind)
  │  PayPal JS SDK v6 button ─────────────► PayPal sandbox checkout (buyer approval)
  │  SSE /api/events (live timeline)
  ▼
Next.js route handlers (Node)
  ├─ lib/course   enrollments, guarantee policy, purchase, attempts, refund, cohort results
  ├─ lib/grading  sealed prompts and scoring, the decision band, mock verdicts
  ├─ agents       refund agent; tools check_refund_policy, capture_course_payment and refund_course_purchase (risk: money)
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

Checks: `npm run check` (lint, typecheck, unit tests, build, and proof that no sponsor code is in the build), `npm run test:e2e` (mock PayPal), `ENGINE=webkit npm run test:e2e:engines` (also `firefox`, `iphone`, `android`), `npm run test:e2e:sandbox` (real sandbox), `npm run test:sandbox`. Set `E2E_BASE_URL` to run the sandbox flows against a deployed copy.

`npm run demo:record` builds the app, plays the whole story and saves the raw recording; `npm run demo:edit` drops the grading waits, splices in PayPal's checkout window and writes `videos/demo-pass-or-refund.mp4` (under 3:00). The submission cut runs on the sandbox with live grading: `DEMO_PAYPAL_MODE=sandbox DEMO_AI_MODE=live npm run demo:record && npm run demo:edit`.

## The cohort dashboard

`/cohort` is built from real attempts and PayPal-confirmed refunds. It carries no names or email addresses, and attempts flagged for tricking the grader stay out of the question and rubric numbers. It also shows 36 made-up learners, kept apart from real records and labelled "Sample cohort" on the page, so a fresh deploy isn't empty. `npm run seed:sandbox` (run by Render on boot) seeds only them: none of the starter kit's shop orders reach this app's ledger or timeline.

- **Public build:** the same numbers in the kit's plain AG Grid (Community).
- **With `NEXT_PUBLIC_SPONSOR_UI=1` at build time:** a self-serve [AG Studio](https://www.ag-grid.com/) dashboard. Press **Edit dashboard** to add charts, change fields and filter; the layout stays in that browser. At phone width the dashboard is view-only, one widget to a row. Set `AG_STUDIO_LICENSE_KEY` to use a licence key.

AG Studio 3.0.0 is a trial-licence npm dependency from AG Grid Ltd, used here for evaluation. It isn't part of this project's MIT licence, and it stays off the public site: without the switch a build alias keeps it out of the bundle, and `npm run check:sponsor-free` fails if it appears in `.next/static`.

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
- `/team` is open to anyone on purpose, and the page says so: judges need to approve a refund without an account, and only sandbox money can move. A real deployment would put it behind a staff login.
- There's no cap on the number of attempts.
- One refund per PayPal payer is matched on PayPal's account id or PayPal's email for the buyer, never on the card number, which would merge everyone who uses the shared test card. A guest who gives PayPal a different email each time still looks like a new buyer. The server-side test card (tests only) gives PayPal no buyer at all. The mock suite proves both matches; the sandbox can't choose its payer.
- A proposal waiting for a person lasts an hour and dies if the server restarts. The refund then shows as blocked and the team can review it again.
- Recovery needs our enrollment record, so it can't rebuild data lost in a redeploy (see local JSON storage above).
- Disputes are tested on the mock only: PayPal's sandbox opens a dispute only from the buyer's own logged-in account.
- Webhooks can't reach a local server, so the local sandbox suite skips the webhook checks. The hosted suite runs them.
- PayPal's window is tested with guest card checkout. Logging in with a sandbox PayPal wallet there is untested, because it needs a sandbox buyer password.

## License

MIT, see [LICENSE](LICENSE).
