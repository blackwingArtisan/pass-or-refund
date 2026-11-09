# Pass or Refund

> Online courses that pay you back if they can't teach you: Claude grades the final check against a public rubric, and a second fail sends a real PayPal refund to a person for approval.

**Live demo:** https://pass-or-refund.onrender.com · **Video (3 min or less):** not recorded yet · **License:** MIT

## Why this matters

**A coding school advertised job placement of up to 86%. A US regulator found it was closer to half** ([CFPB on BloomTech, 17 Apr 2024](https://www.consumerfinance.gov/about-us/newsroom/cfpb-takes-action-against-coding-boot-camp-bloomtech-and-ceo-austen-allred-for-deceiving-students-and-hiding-loan-costs/)). Course promises are hard to check before you pay. BloomTech promised jobs, not a refund, but course buyers describe the same gap with guarantees:

- **The seller is the only judge.** A $5,997 course buyer asked for the guaranteed refund: "it was quickly DENIED" ([Trustpilot, Sep 2026](https://www.trustpilot.com/review/replaceyouruniversity.com)). Here the refund rule is code, and every point quotes the learner's own answer.
- **Refund requests stall.** "The refund process turned into an 11-month ordeal", under a policy that read "no questions asked" ([Trustpilot, Nov 2025](https://ca.trustpilot.com/review/pappsmastery.com)). Here two fails put the refund in front of a person, PayPal pays it, and the learner sees the refund id.
- **Terms move after you pay.** A $199 course launched with no refund policy, and a 14-day window appeared about four weeks later ([The Register, Sep 2019](https://www.theregister.com/2019/09/27/youtube_ai_star)). Here the rubric's version and fingerprint lock at purchase.
- **Good creators can't prove it.** A creator with a handful of refunds against hundreds of buyers offers them because "I don't wanna be called a scam" ([Chaotic Creator, Mar 2026](https://chaotic-creator.beehiiv.com/p/course-creation-mistakes-that-cost-me-20k)). Here `/cohort` shows pass rates, refunds and the rubric lines learners miss.

The buyer accounts are single reviews: they show the pattern recurs, not how often. Refund-if-you-fail already exists in exam prep (Becker, BarMax). What's new here is the trigger, the course's own public rubric, and a PayPal refund that a person approves.

## Who it's for

Course creators who sell a skill course they know works, to buyers who've been burned by small-print guarantees. The landing page puts the creator's case first: the knobs (price $49, pass mark 70, two fails 24 hours apart), the refund rate on a sample cohort, what one AI grade costs, what a sale is worth after refunds and grading, and the six rules that stop a learner taking the course and failing on purpose.

## The problem

People don't trust online courses, because a guarantee usually means small print and an email to support. Creators with a good course have no way to prove it. A guarantee only means something if it's tied to whether you learned, and if paying it out doesn't depend on anyone's mood.

## What it does

- **Buy with the guarantee in view.** The terms sit next to the pay button. PayPal captures the payment at purchase.
- **Take the final check.** Four written questions, 25 points each, on a short sample course, *Sharp at Home* by a made-up creator.
- **See your grade point by point.** Every rubric item shows met, partial or missed, with the words quoted from your answer. Missed items become your study list.
- **The terms can't move after you pay.** The course page shows the rubric version and its fingerprint (the first 12 characters of the rubric's SHA-256). Buying locks both on your enrollment, your receipt and certificate show them, and grading uses that locked version. If the text on file no longer matched the fingerprint, grading would stop and count nothing (`src/lib/course/rubric-lock.ts`). **Check it yourself:** "Check it against the public rubric" on the receipt or certificate opens `/rubric`, which shows the rubric on sale and says "Matches" or "Changed since you bought". From a learner's own receipt it is a three-way check: the fingerprint on the receipt, the rubric on sale, and PayPal's own record of the order, read back from PayPal (`GET /v2/checkout/orders/{id}`), whose item line and `invoice_id` carry the fingerprint; "Matches" needs all three. `/api/rubric/v1.json` serves the exact bytes the fingerprint is taken from, so `shasum -a 256` gives the same first 12 characters. **Grade receipt:** "Grade receipt" on a learner's results opens a printable page and a JSON download with the locked fingerprint, every rubric line's verdict and points, a SHA-256 of each attempt (and of its answers, which stay out of the receipt) and any PayPal refund id, under one receipt hash. Anyone holding it can open or paste it under "Check a grade receipt" on `/rubric`: it says "Matches" only if the receipt's own hash fits its contents and every attempt and the refund id are still what's on file, and "Changed" with what differs otherwise (`src/lib/course/grade-receipt.ts`).
- **Contest one line, once.** After a failed first attempt and before the retake, you can contest one rubric line you lost points on and say why. Claude reads it first as a second reader and writes the person on `/team` a recommendation, uphold or let the grade stand, with one reason, quoting your case and your answer (code checks each quote word for word). The person reads it beside the grader's quote and rules; the recommendation never changes a grade. Upheld, the line counts as met and the sealed scoring code adds the attempt up again, which can turn it into a pass. Not upheld, the grade stands and you read their note. Taking the retake first withdraws the contest.
- **See how learners did before you buy.** The home page shows the pass and refund rates from `/cohort`.
- **Pass:** you get a certificate, and no refund happens. To see one without passing, the home page links to a made-up sample learner's certificate (`/learn/sample_pass`), labelled as a sample.
- **Fail once:** you tick off the study list item by item, and your next attempt opens 24 hours later. Judges can press **Skip the wait (demo)** to fail twice right away.
- **Fail twice:** a refund agent checks the policy, reads the rubric lines you fell short on (never your answers), and writes you a short note and the course team a summary. It proposes the refund with its reasons and stops. If you contested a line, or a grade was a close call code decided, it can instead ask a person on the team to look first; they send it on for approval or decline it with a note. After a person approves, PayPal pays it and you see "Refund issued, sorry we let you down", with the refund id and status read back from PayPal.
- **A person declines:** no money moves, and you read the decision and their note on your page. Every decline and its note is listed on the public `/cohort` page, without your name, and you can still open a dispute with PayPal.
- **Nobody decides in time:** the course team has an hour. After that the refund shows "overdue, X hours" on `/team` and on `/cohort` until someone acts.
- **A score of 69 or 70:** you see "under review, answer within one business day", and no refund starts. On `/team` a person goes through every item that lost points, one tick each, adds a note and decides. Your score stays as graded, and a fail counts like any other, so a second one sends the refund to the same approval.
- **Course creators** see `/cohort`: pass rate by course and question, refunds, and the rubric items learners miss most, so they know which lesson to fix. Until real learners arrive it shows a labelled sample cohort of 36 made-up learners graded on the real rubric.

**The refund rule, enforced in code (`src/lib/course/policy.ts`).** It takes two completed failing attempts: every question answered, at least 25 points each time, and not a near-copy of an earlier attempt (90% of the same words, in any order). The learner must tick off the first attempt's study list before the second one counts. Trying to instruct the grader gets no credit, is flagged and voids the guarantee. Each learner gets one refund per course, matched on the email typed at checkout and on the PayPal payer from the order: PayPal's account id, or the email PayPal has for the buyer, which a guest card checkout in PayPal's window also gives (a declined or blocked refund doesn't use it up). The purchase screen says "Guarantee: one refund per PayPal account". A refund ends the learner's access to the lessons.

## What is this entry's, and what is new

**This entry versus the shared kit.** The kit is a starter written for several hackathon apps: a typed PayPal layer (mock and sandbox), the Guard (caps, approvals, idempotency, audit log), a Claude agent loop, the live timeline, an AG Grid ledger and a design system. Everything about the guarantee is this entry's own: the rubric locked and fingerprinted at purchase, the sealed grader and its band, the refund rule in code, the refund agent and its tools, the contest, the terms written onto PayPal's order and refund, `/rubric`, `/cohort`, `/creator` and the Server SDK money path.

**What is new here versus other refund-approval agents in this hackathon.** An AI that recommends a refund and a person who approves it is common in this hackathon, so that is not the claim. The claim is what the approval enforces: a guarantee whose terms are locked, public and hashed before the buyer pays (the rubric fingerprint, checkable byte for byte on `/rubric`); written onto PayPal's own records (the order's item line and `invoice_id`, and the refund's `note_to_payer` with both scores); and accountable afterwards, with every decline and every overdue refund published on `/cohort`. None of the refund-agent pages we read describes a refund trigger that is locked and hashed before purchase, or terms written onto the PayPal order.

## How PayPal is used

All PayPal calls go to the **sandbox** (`https://api-m.sandbox.paypal.com`); there is no live mode in the code. Every call shows on the in-app timeline with its HTTP status and PayPal `debug_id`.

| PayPal API | Endpoint(s) | Where and why |
|---|---|---|
| JS SDK v6 (buyer approval) | `web-sdk/v6/core`, `usePayPalOneTimePaymentSession` + `<paypal-button>` | The buy button on `/course` opens PayPal's own checkout window. The page says how to pay with no PayPal login: choose **Pay with Debit or Credit Card** inside PayPal's window and use PayPal's sandbox test card (4111 1111 1111 1111, 12/30, CVV 123), shown under the button. The sandbox suite pays this way on desktop Chrome and on the iPhone 15 and Pixel 7 presets. While the window is open the page also asks the server every few seconds, which reads the order from PayPal: one of PayPal's checkout pages takes the payment but never tells the page, and then the server finishes the purchase and the page closes PayPal's window. |
| Orders v2 | `POST /v2/checkout/orders`, `GET /v2/checkout/orders/{id}`, `POST .../capture` | One `CAPTURE` order per enrollment. The server sets the amount. The guarantee's terms go on the order itself: one `items[]` line named for the course, rubric version and fingerprint ("Sharp at Home · rubric v1 · ada21f9fbe03") with the description "Full refund if you fail the public final check twice", and an `invoice_id` of `PR-v1-<fingerprint>-<enrollment id>`, which PayPal shows the buyer in their history and email. The `/rubric` check reads the order back with `GET /v2/checkout/orders/{id}` (`src/lib/course/order-terms.ts`). |
| Payments v2 | `GET /v2/payments/captures/{id}`, `POST .../refund`, `GET /v2/payments/refunds/{id}` | The refund amount comes from the capture, and the result is read back after the refund. The refund carries the order's `invoice_id` and a `note_to_payer` that code builds from the graded record ("Guarantee refund, rubric v1 ada21f9fbe03: scored <first score> and <second score>, pass mark 70. Sorry we let you down."); the agent never writes it. The refund card shows the note as PayPal reads it back. |
| Webhooks | `POST /v1/notifications/verify-webhook-signature`; `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.REFUNDED`, `CUSTOMER.DISPUTE.*` | Each verified event is matched to its enrollment by PayPal's ids. A capture event confirms the payment and enrolls a learner whose record missed it. A refund event records the refund and settles a `PENDING` one at once, with no timer. The refund card and `/team` say "PayPal's webhook confirmed it at" beside the read-back. Each event goes to the course team and to its own learner's timeline, never to other learners. |
| Disputes v1 | `GET /v1/customer/disputes/{id}`, `POST .../accept-claim` | A learner's dispute attaches to their enrollment. If the guarantee covers them, the refund agent proposes accepting it (`accept_dispute_claim`, behind the Guard), and only a person's approval pays it. If not, the team sees why and answers it in PayPal. |

**Built with the APIMatic PayPal Context Plugin.** In sandbox, the Orders and Payments calls above run on `@paypal/paypal-server-sdk` 2.5.0, written by following the plugin's TypeScript skills. Mock mode uses the kit's mock client. [docs/APIMATIC-CONTEXT-PLUGIN.md](docs/APIMATIC-CONTEXT-PLUGIN.md) lists exactly what was and wasn't built with it.

**Safety around money:** the money steps (`capture_course_payment`, `refund_course_purchase`, and `accept_dispute_claim` for a learner with an open dispute) are guarded tools. The Guard enforces a per-action cap, a daily cap and idempotency (`PayPal-Request-Id`). The daily cap is counted separately for refunds and for learners' payments coming in, and browser test runs have their own counts, so test traffic on a shared deploy can't use up a real learner's refund. If the Guard stops a refund before it reaches a person, the learner and the course team read its reason in plain words, and the team can send it again. A refund always waits for a person, whatever the amount. The agent can only ask: the tool re-checks the policy and the PayPal capture before the approval and again before paying, and refuses any amount that isn't exactly what was paid, so a request for too much stops the refund with no PayPal call. Every decision goes to a hash-chained, append-only audit log, shown on `/activity`.

**Refunds that show PENDING.** This app has its own funded sandbox seller, so its refunds read `COMPLETED` straight away, and the sandbox suite fails on anything else. The background, for anyone running it on another account: PayPal pays a refund from the seller's PayPal balance. When the balance is smaller than the refund, PayPal draws on the seller's bank instead, and the refund stays `PENDING` with status reason `ECHECK`, even though the capture already reads `REFUNDED`. The shared sandbox seller usually holds less than the $49 price, and on a test account those refunds don't settle by themselves. Captured money doesn't reach the balance right away either: 20 minutes after $116.40 of test captures, a $30 refund still went `PENDING`. The app shows the status as PayPal reports it, tells the learner why in plain words, and settles it when PayPal's `PAYMENT.CAPTURE.REFUNDED` webhook arrives. Without webhooks, it asks PayPal again when the learner looks. A refund the balance covers goes straight to `COMPLETED`: the balance decides, not the code. The shared seller has done this at the full $49 when its balance happened to cover it, and at any time with a $2 price, by building with `NEXT_PUBLIC_COURSE_PRICE_CENTS=200`. A funded seller account gives `COMPLETED` on every refund.

**If the app stops halfway.** PayPal is the record of the money. If PayPal took a payment and our record never heard, opening the learner's page, or buying again with the same email, rebuilds the enrollment from the order, so nobody is stuck and nobody pays twice. The same goes for a refund: its order lists it, so the app records that refund and doesn't send another.

## How AI is used

| Where | Model | What it does |
|---|---|---|
| Grading the final check | Claude Sonnet 5.5 (`claude-sonnet-5-5`) | Gives each rubric item a verdict with a verbatim quote, and flags attempts to instruct the grader. It never adds up points. |
| Second reader on a contest | Claude Sonnet 5.5 (`claude-sonnet-5-5`) | When a learner contests a rubric line, reads the line, the grader's quote, the learner's note and their answer, and recommends to the person ruling: uphold or let the grade stand, one reason, a quote from each side. It only recommends: the person rules, and code (`ruleOnContest`) applies the ruling with the sealed scoring. Code drops any quote not found word for word, and records beside the ruling what the reader had recommended. With the model out, the card says so and the person rules as before. |
| Refund agent | Claude Haiku 5.5 (`claude-haiku-5-5`) | After a second fail, reads the policy check, the rubric lines the learner fell short on and any contest. It writes the learner's note and the team's summary, then either proposes the refund with reasons or, for a contested or close case, sends it to a person first (`route_refund_to_review`). It sees scores, rubric lines and rule results, never the learner's answers. Code decides which cases may go to review, enforces the policy and the amount, and the Guard waits for a person. With the model out, code writes the notes and proposes. |

- **AI suggests, code and a person decide.** Code turns verdicts into points (met = full, partial = half rounded down, missed = 0), applies caps and adds up. Under 66 fails and over 73 passes. From 66 to 73 it grades twice more and takes the median: 71 or more passes, 68 or less fails, and 69 or 70 goes to a person.
- **The method is sealed.** Prompts, rules and scoring in `src/lib/grading/frozen/` are byte copies of the set tested on held-out data. A unit test checks their hashes.
- **How accurate the grader is.** The sealed method was tested on 20 new attempts across 2 new courses that it had never seen, 11 of them near the pass mark and 3 that told the grader what to do. 2 blind judges scored each attempt first, and the whole method ran 4 times:
  - No attempt both judges failed was ever passed.
  - No attempt both judges scored 80 or more was ever refunded.
  - Attempts both judges passed came out passed 89-100% of the time.
  - The same outcome on 95% of repeats.
  - All 3 attempts that told the grader what to do were flagged, every time.
  - $0.018-0.021 per decision, extra grades included.

  **Not real learners:** the judges, the attempts and the grader are all Claude, and the attempts were written to land near the pass mark, so real learners will be messier. 20 attempts is a small set. Only 1 of the 4 runs is a fully independent repeat; the other 3 reuse the same grades inside the 66-73 band. The figures are in `src/lib/course/grader-accuracy.ts`. `/cohort` shows how many of this app's own attempts needed three grades and how many went to a person.
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
  ├─ agents       refund agent; tools check_refund_policy, route_refund_to_review, capture_course_payment and refund_course_purchase (risk: money)
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

Open http://localhost:3020, go to **Course**, buy it, then open **For judges** at the bottom of the sidebar and turn on **Judge shortcuts** for the prepared answers above the quiz. For the real sandbox set `PAYPAL_MODE=sandbox`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` and `DEMO_TEST_CARD=1`. For real AI set `ANTHROPIC_API_KEY`.

Checks: `npm run check` (lint, typecheck, unit tests, build, and proof that no sponsor code is in the build), `npm run test:e2e` (mock PayPal), `ENGINE=webkit npm run test:e2e:engines` (also `firefox`, `iphone`, `android`), `npm run test:e2e:sandbox` (real sandbox), `npm run test:sandbox`. Set `E2E_BASE_URL` to run the sandbox flows against a deployed copy.

`npm run demo:record` builds the app, plays the whole story and saves the raw recording; `npm run demo:edit` drops the grading waits, splices in PayPal's checkout window and writes `videos/demo-pass-or-refund.mp4` (under 2:30, PayPal's window included). The captions are the voiceover script: `videos/demo-voiceover.txt` lists each line at its time in the cut. The video is 1280x800 with the For judges menu hidden (`DEMO_CLEAN`, on unless `DEMO_CLEAN=0`). It opens on a refund card, keeps the home page to 8 s and PayPal's window to 5 s, shows **Skip the wait (demo)** before the second graded attempt, ends the refund on the What PayPal did drawer with the refund call's debug_id, then checks the learner's grade receipt on the public rubric page. The script reads the modes from `/api/kit/status` and words its captions to match, so replayed grades are never credited to Claude. `DEMO_REQUIRE_LIVE=1` fails the take if any recorded screen says "mock" or "simulated". A local take runs on the PayPal sandbox with mock grading: `DEMO_PAYPAL_MODE=sandbox npm run demo:record && npm run demo:edit`. The submission take records the hosted app with live grading, starting nothing locally: `DEMO_BASE_URL=https://pass-or-refund.onrender.com DEMO_REQUIRE_LIVE=1 npm run demo:record && npm run demo:edit`.

## Your own course on /creator

A creator sets up their own course with no account. On `/creator` they write the rubric in a simple form (each question, then one line per thing a good answer says, points first) or paste JSON in the shape of the sample's `/api/rubric/1`. Mistakes come back in plain words, for example "The points add up to 50. They have to add up to 100, so the pass mark reads as a percentage."

A valid rubric gets its fingerprint (the same SHA-256 as the sample course, so pasting the sample rubric gives the sample's own fingerprint) and a link, `/c/cc_<fingerprint>`. The link carries the fingerprint, so it always grades against those exact words; change one word and you get a new fingerprint and a new link, and the old one keeps its rubric. If the stored words ever stopped matching the link, grading stops. The course page shows the public rubric and a final check graded by the same sealed grader, with the creator's optional notes as the course text. Courses are stored like the sample cohort, in a collection on the app's disk (`creator-courses`). The creator sets a price from $1 to $49 (at or under the Guard's approval threshold, like the sample course's $49). A learner buys at the link through the same Orders v2 checkout, the purchase locks that rubric's fingerprint, and grading, the study list, the refund agent, the course team's approval and the PayPal refund work as on the sample course. The course page also has a practice check that saves nothing. Creator courses stay out of the sample course's cohort numbers. Paying creators out is not built.

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

No buyer login is needed: pay with PayPal's test card inside PayPal's window, as the course page says. For automated tests, `DEMO_TEST_CARD=1` adds a server-side **Pay with sandbox test card** button, shown only on `/course?test-card=1`, so learners never see it.

## Deploy

Render Blueprint (`render.yaml`): New → Blueprint → this repo, then enter the secrets in the dashboard.

## Limitations

- Sandbox only; no live payments are possible.
- Automated sandbox tests pay with PayPal's test card, and the mock flow uses the simulated approval.
- Local JSON storage: data resets on redeploy (fine for a demo, not for production).
- `/team` and `/activity` sit behind a passcode that the home page prints in a For judges box (`lena-49`, or `TEAM_PASSCODE`). It keeps crawlers and passers-by out; it isn't a staff login, and the page says so. Only sandbox money can move. A real deployment would use staff logins.
- No API sends a learner's email: enrollment views drop it, the timeline stream and the PayPal ledger hide every address, and the audit API sends only what /activity shows.
- Learner and course team screens show only the product. The PayPal and AI modes, today's AI spend and the **Judge shortcuts** switch for prepared answers sit in one small **For judges** menu at the bottom of the sidebar. `DEMO_CLEAN` on a demo recording (on unless `DEMO_CLEAN=0`) sets `por_clean` in the browser, which hides that menu and the home page's For judges box, so the video shows what a learner or creator would see.
- The browser test suites set a `por_test_run` cookie on the app's own address. Their learners are kept off `/team` and out of the cohort numbers for everyone else, so a hosted test run leaves nothing for a judge to wade through.
- There's no cap on the number of attempts.
- One refund per PayPal payer is matched on PayPal's account id or PayPal's email for the buyer, never on the card number, which would merge everyone who uses the shared test card. A guest who gives PayPal a different email each time still looks like a new buyer. The server-side test card (tests only) gives PayPal no buyer at all. The mock suite proves both matches; the sandbox can't choose its payer.
- A proposal waiting for a person lasts an hour and dies if the server restarts. The refund then shows as blocked and the team can review it again.
- Recovery needs our enrollment record, so it can't rebuild data lost in a redeploy (see local JSON storage above).
- Disputes are tested on the mock only: PayPal's sandbox opens a dispute only from the buyer's own logged-in account.
- Webhooks can't reach a local server, so the local sandbox suite skips the webhook checks. The hosted suite runs them.
- PayPal's window is tested with guest card checkout. Logging in with a sandbox PayPal wallet there is untested, because it needs a sandbox buyer password.

## License

MIT, see [LICENSE](LICENSE).
