/**
 * The course flows in a real browser. Runs on mock PayPal (npm run test:e2e) and on the real
 * sandbox (npm run test:e2e:sandbox), where PayPal's objects are read back directly.
 * `E2E_AI_MODE=live npx playwright test -c playwright.sandbox.config.ts -g "real AI"` is the paid run.
 */
import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";
import { COURSE_PRICE_CENTS } from "../../src/lib/course/content";
import { fromMinor } from "../../src/lib/money";
import type { Cohort } from "../../src/lib/course/cohort";
import type { EnrollmentView } from "../../src/lib/course/types";
import { testRunState } from "./test-run";
import { payInPayPalWindow, paypalButtonReady } from "./paypal-popup";
import { captureBehindTheApp, readPayPalObjects, readRefunds, refundBehindTheApp } from "./paypal-reread";

const PRICE = fromMinor(COURSE_PRICE_CENTS, "USD");
const LIVE_AI = process.env.E2E_AI_MODE === "live";
/** Read at build time, so this has to match the build under test. Never set on the hosted site. */
const SPONSOR_UI = process.env.NEXT_PUBLIC_SPONSOR_UI === "1";

const mode = async (request: APIRequestContext) => (await (await request.get("/api/kit/status")).json()).paypal.mode as "mock" | "sandbox";

/** PayPal's webhooks reach the mock and the hosted site. A local sandbox server has no public address, so none arrive. */
const webhooksArrive = async (request: APIRequestContext) => (await mode(request)) === "mock" || !!process.env.E2E_BASE_URL;

/**
 * PayPal sends the refund webhook within seconds most times, but a sandbox delivery can lag. Waits
 * up to 3 minutes; if it never shows, prints what the server did with each refund webhook it got,
 * so a failure says whether PayPal never delivered, the signature check refused it, or the app
 * didn't tie it to the learner.
 */
async function refundWebhookShows(team: Locator, request: APIRequestContext, id: string) {
  const started = Date.now();
  try {
    await expect(team.getByTestId("team-webhook")).toContainText(/PayPal's webhook confirmed the refund at \d{1,2}:\d{2}\s[AP]M/, { timeout: 180_000 });
    console.log(`Refund webhook for ${id} showed after ${Math.round((Date.now() - started) / 1000)} s`);
  } catch (e) {
    const { payment, refund } = await enrollmentOf(request, id);
    const { deliveries } = (await (await request.get("/api/paypal/webhook-trail")).json()) as { deliveries: { resourceId?: string; captureId?: string; eventType?: string }[] };
    const ours = deliveries.filter((d) => [payment?.captureId, refund?.refundId].includes(d.resourceId) || d.captureId === payment?.captureId);
    console.log("Webhook trail for", id, JSON.stringify({ captureId: payment?.captureId, refundId: refund?.refundId, ours, rejectedOrOther: deliveries.filter((d) => !d.eventType || d.eventType === "PAYMENT.CAPTURE.REFUNDED").slice(0, 10) }));
    throw e;
  }
}

/** A new address each time: the hosted suite keeps its data between runs, and a learner only gets one refund. */
const newEmail = (name: string) => `${name.toLowerCase().replace(/\W+/g, ".")}.${Date.now()}@example.com`;

/** The server-side test card only shows on this address, so learners never see it. */
const COURSE_FOR_TESTS = "/course?test-card=1";

async function buy(page: Page, request: APIRequestContext, name: string, email = newEmail(name)): Promise<string> {
  await page.goto(COURSE_FOR_TESTS);
  await expect(page.getByTestId("guarantee").filter({ visible: true })).toContainText("Fail the final check twice");
  await expect(page.getByText("Guarantee: one refund per PayPal account").filter({ visible: true })).toBeVisible();
  await page.getByTestId("learner-name").filter({ visible: true }).fill(name);
  await page.getByTestId("learner-email").filter({ visible: true }).fill(email);
  if ((await mode(request)) === "sandbox") {
    await page.getByTestId("sandbox-test-card").click();
  } else {
    await page.getByTestId("simulate-paypal-approval").click();
    await page.getByTestId("mock-approve").click();
  }
  await page.waitForURL(/\/learn\/en_/, { timeout: 60_000 });
  await expect(page.getByTestId("submit-attempt")).toBeVisible();
  return page.url().split("/learn/")[1];
}

/** The hosted app allows 6 AI requests a minute per address, and each submit is one. Local configs lift the limit. */
const AI_CALL_GAP_MS = 11_000;
let lastAiCall = 0;

async function submitAttempt(page: Page) {
  for (let tries = 0; ; tries++) {
    if (process.env.E2E_BASE_URL) {
      const wait = lastAiCall + AI_CALL_GAP_MS - Date.now();
      if (wait > 0) await page.waitForTimeout(wait);
      lastAiCall = Date.now();
    }
    const answered = page.waitForResponse((r) => r.request().method() === "POST" && r.url().endsWith("/attempts"));
    await page.getByTestId("submit-attempt").click();
    const res = await answered;
    // The refund agent's AI calls share the per-minute limit, so a busy minute can still refuse a submit. Wait it out once or twice.
    if (res.status() !== 429 || tries >= 2) return;
    await page.waitForTimeout((Number(res.headers()["retry-after"]) || 30) * 1000 + 500);
  }
}

async function attempt(page: Page, sample: string, number: number) {
  await page.getByTestId(`sample-${sample}`).click();
  await submitAttempt(page);
  await expect(page.getByTestId(`attempt-${number}`)).toBeVisible({ timeout: 120_000 });
  return Number(await page.getByTestId(`score-${number}`).innerText().then((t) => t.split("/")[0].trim()));
}

/** Ticks off the study list one item at a time, so the next attempt can count toward a refund. */
async function review(page: Page) {
  await expect(page.getByTestId("mark-reviewed")).toBeDisabled();
  const items = page.locator('[data-testid^="study-item-"]');
  for (const item of await items.all()) {
    await item.click();
    await expect(item).toBeChecked();
  }
  await page.getByTestId("mark-reviewed").click();
  await expect(page.getByTestId("study-list-reviewed")).toBeVisible();
}

async function skipTheWait(page: Page) {
  await page.getByTestId("skip-wait").click();
  await expect(page.getByTestId("submit-attempt")).toBeVisible();
}

async function studyThenRetry(page: Page) {
  await review(page);
  await skipTheWait(page);
}

async function failTwice(page: Page) {
  await attempt(page, "fail1", 1);
  await studyThenRetry(page);
  await attempt(page, "fail2", 2);
  await expect(page.getByTestId("refund-waiting")).toBeVisible();
}

async function approveOnTeam(page: Page, id: string) {
  await page.getByTestId("refund-waiting").getByRole("link").click();
  const team = page.getByTestId(`enrollment-${id}`);
  await expect(team.getByTestId("approval-reasons")).toBeVisible({ timeout: 90_000 });
  // The mock agent's words. A real agent words its reasons its own way.
  if (!LIVE_AI) await expect(team.getByTestId("approval-reasons")).toContainText("first refund");
  await expect(team).toContainText("Every refund needs a person's approval.");
  await expect(team).not.toContainText("refund_course_purchase");
  await team.getByTestId("approve-button").click();
  await expect(team.getByText("Refunded", { exact: true })).toBeVisible({ timeout: 60_000 });
  return team;
}

/** The course team passcode, read the way a judge reads it: from the For judges box on the home page. */
async function passcodeFromHome(request: APIRequestContext) {
  const html = await (await request.get("/")).text();
  const shown = /data-testid="team-passcode-shown"[^>]*>([^<]+)</.exec(html)?.[1];
  expect(shown, "the home page prints the team passcode").toBeTruthy();
  return shown!;
}

/** Signs a browser (and its API calls) in as the course team. */
async function unlockTeam(request: APIRequestContext) {
  const res = await request.post("/api/team/session", { data: { passcode: await passcodeFromHome(request) } });
  expect(res.ok()).toBe(true);
}

const EMAIL_SHAPE = /[\w.+-]+@[\w-]+(\.[\w-]+)+/;

const enrollmentOf = async (request: APIRequestContext, id: string) => (await (await request.get(`/api/enrollments/${id}`)).json()) as EnrollmentView;

const cohortOf = async (request: APIRequestContext) => (await (await request.get("/api/team/cohort")).json()) as Cohort;

/** Every script and stylesheet the page loads, so a test can read exactly what reached the browser. */
function watchCode(page: Page) {
  const bodies: Promise<string>[] = [];
  page.on("response", (response) => {
    if (["script", "stylesheet"].includes(response.request().resourceType())) bodies.push(response.text().catch(() => ""));
  });
  return async () => (await Promise.all(bodies)).join("\n");
}

// Every flow plays both sides, so each test's browser and API calls start signed in as the course team.
test.beforeEach(async ({ page, request }) => {
  await unlockTeam(page.request);
  await unlockTeam(request);
});

test.describe("who sees what", () => {
  test("the course team view needs the passcode from the For judges box, and no API sends an email", async ({ page, request, browser }) => {
    const id = await buy(page, request, "Gita <i>Gate</i>", newEmail("Gita Gate"));
    await expect(page.getByText("Gita Gate").first()).toBeVisible();

    // A new visitor: no passcode yet.
    const stranger = await browser.newContext();
    const visitor = await stranger.newPage();
    await visitor.goto("/");
    const passcode = (await visitor.getByTestId("team-passcode-shown").innerText()).trim();
    expect(passcode.length).toBeGreaterThan(3);
    for (const path of ["/api/team", "/api/audit", "/api/agent/approvals", "/api/paypal/ledger", "/api/agent/runs", "/api/paypal/webhook-trail"]) {
      expect(`${path} ${(await stranger.request.get(path)).status()}`).toBe(`${path} 401`);
    }
    expect((await stranger.request.post("/api/agent/approvals/ap_nope", { data: { decision: "approved" } })).status()).toBe(401);
    expect((await stranger.request.post(`/api/enrollments/${id}/settle`, { data: { outcome: "pass", note: "x", checkedItems: [] } })).status()).toBe(401);
    expect((await stranger.request.post(`/api/enrollments/${id}/contest/ruling`, { data: { upheld: true, note: "x" } })).status()).toBe(401);
    for (const path of ["/team", "/activity"]) {
      await visitor.goto(path);
      await expect(visitor.getByTestId("team-passcode-form")).toBeVisible();
      await expect(visitor.getByTestId(`enrollment-${id}`)).toHaveCount(0);
    }
    await visitor.getByTestId("team-passcode").fill("not-it");
    await visitor.getByTestId("team-passcode-submit").click();
    await expect(visitor.getByTestId("team-passcode-form")).toContainText("isn't right");
    await visitor.getByTestId("team-passcode").fill(passcode);
    await visitor.getByTestId("team-passcode-submit").click();
    await expect(visitor.getByRole("heading", { name: "Activity" })).toBeVisible();
    await expect(visitor.getByTestId("audit-row").first()).toBeVisible();
    const activity = await visitor.locator("main").innerText();
    expect(activity).toContain("Take the course payment");
    expect(activity).not.toMatch(/capture_course_payment|refund_course_purchase|tool\.requested|tool\.executed/);
    await visitor.screenshot({ path: "screenshots/activity-plain.png" });
    await visitor.goto("/team");
    await expect(visitor.getByRole("heading", { name: "Refunds and learners" })).toBeVisible();
    await expect(visitor.getByTestId("team-access-rule")).toContainText("passcode");
    await stranger.close();

    // The test suite's buyers are hidden from a real visitor's list, and shown to the suite's own.
    const judge = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    await unlockTeam(judge.request);
    const judgeIds = ((await (await judge.request.get("/api/team")).json()) as { enrollments: EnrollmentView[] }).enrollments.map((e) => e.id);
    expect(judgeIds).not.toContain(id);
    await judge.close();
    const ours = await (await page.request.get("/api/team")).text();
    expect(ours).toContain(id);

    // No email reaches a screen: not the team list, not the enrollment, not the audit log.
    for (const path of ["/api/team", `/api/enrollments/${id}`, "/api/audit", "/api/paypal/ledger", "/api/agent/approvals"]) {
      const body = await (await page.request.get(path)).text();
      expect(`${path} ${EMAIL_SHAPE.exec(body)?.[0] ?? "none"}`).toBe(`${path} none`);
    }
    if ((await mode(request)) === "sandbox") expect((await (await request.get("/api/kit/status")).json()).paypal.buyerEmail).toBe("");
  });
});

test.describe("the story on the first screen", () => {
  test("the home page leads with the researched headline and sourced pain points, and links a sample certificate", async ({ page, request }) => {
    await page.goto("/");
    const story = page.getByTestId("story");
    await expect(page.getByTestId("story-headline")).toContainText("up to 86%");
    await expect(page.getByTestId("story-source")).toHaveAttribute("href", /consumerfinance\.gov/);
    await expect(story).toContainText("Course promises are hard to check");
    await expect(page.locator("body")).not.toContainText(/guarantees get broken/i);
    const pains = page.getByTestId("story-pains").locator("li");
    await expect(pains).toHaveCount(4);
    for (const pain of await pains.all()) await expect(pain.locator("a[href^='https://']")).toHaveCount(1);
    // The story sits above the fold on a laptop screen.
    const box = await page.getByTestId("story-headline").boundingBox();
    expect(box!.y + box!.height).toBeLessThan(900);
    await page.screenshot({ path: "screenshots/landing-story.png" });

    await page.getByTestId("sample-pass-link").click();
    await page.waitForURL(/\/learn\/sample_pass/);
    await expect(page.getByTestId("sample-pass")).toContainText("Sample learner");
    await expect(page.getByTestId("certificate")).toContainText("Mara Lind");
    const sample = (await (await request.get("/api/enrollments/sample_pass")).json()) as EnrollmentView;
    expect(sample).toMatchObject({ status: "passed" });
    expect(sample.payment).toBeUndefined();
    await page.getByTestId("certificate").screenshot({ path: "screenshots/sample-certificate.png" });
  });

  test("prepared answers stay behind the Judge shortcuts switch until a judge turns it on", async ({ browser, request }) => {
    // A visitor with no shortcuts saved: only the test-run cookie.
    const visitor = await browser.newContext({ storageState: { cookies: testRunState(test.info().project.use.baseURL!).cookies, origins: [] } });
    const page = await visitor.newPage();
    await page.goto("/");
    await expect(page.getByTestId("for-judges")).toContainText("Judge shortcuts");
    await buy(page, request, "Juno Judge");
    const toggle = page.getByTestId("judge-toggle");
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await expect(page.getByTestId("sample-buttons")).toHaveCount(0);
    await toggle.click();
    await expect(page.getByTestId("sample-buttons")).toContainText("Fill all four answers with a prepared example");
    await page.getByTestId("sample-fail1").click();
    await expect(page.getByTestId("answer-q1")).not.toHaveValue("");
    await page.reload();
    await expect(page.getByTestId("judge-toggle")).toHaveAttribute("aria-checked", "true");
    await page.getByTestId("judge-toggle").click();
    await expect(page.getByTestId("sample-buttons")).toHaveCount(0);
    await visitor.close();
  });

  test("the brand font is on every screen, and webhook names wrap at their dots", async ({ page, request }) => {
    const id = await buy(page, request, "Fern Font");
    for (const path of ["/", "/course", `/learn/${id}`, "/learn/sample_pass", "/team", "/cohort", "/activity"]) {
      await page.goto(path);
      const font = await page.evaluate(async () => {
        await document.fonts.ready;
        const loaded = [...document.fonts].some((f) => /geist/i.test(f.family) && f.status === "loaded");
        return { loaded, family: getComputedStyle(document.body).fontFamily, heading: getComputedStyle(document.querySelector("h1, h2") ?? document.body).fontFamily };
      });
      expect(`${path} ${font.loaded}`).toBe(`${path} true`);
      expect(font.family).toMatch(/geist/i);
      expect(font.heading).toMatch(/geist/i);
    }
    if ((await mode(request)) === "mock") {
      await page.goto(`/learn/${id}`);
      const webhook = page.getByTestId("step-title").filter({ hasText: "PAYMENT.CAPTURE.COMPLETED" }).first();
      await expect(webhook).toBeVisible({ timeout: 20_000 });
      expect(await webhook.innerHTML()).toContain("PAYMENT.<wbr>CAPTURE.<wbr>COMPLETED");
    }
  });
});

test.describe("mock-safe flows", () => {
  // On real AI (the hosted suite), only flows tagged @live run: those that make no AI call, and a
  // few that read their scores from the page instead of the mock's fixed ones. About 20 AI calls in all.
  test.beforeEach(({}, testInfo) => test.skip(LIVE_AI && !testInfo.tags.includes("@live"), "Needs the mock's fixed scores, or more AI calls than the hosted limit allows."));

  test("cohort results: real attempts show what to fix", async ({ page, request }) => {
    const before = await cohortOf(request);
    if (before.sources.attempts.length === 0) {
      await page.goto("/cohort");
      await expect(page.getByText("No results yet")).toBeVisible();
    }

    await buy(page, request, "Noor Haddad");
    await attempt(page, "fail1", 1);
    const after = await cohortOf(request);
    expect(after.sources.attempts).toHaveLength(before.sources.attempts.length + 1);
    expect(after.sources.items.length).toBeGreaterThan(before.sources.items.length);
    const worst = after.items[0];
    expect(worst.missRate).toBeGreaterThan(0);

    const code = watchCode(page);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/cohort");
    await expect(page.getByTestId("cohort-fix-first")).toContainText(worst.item);

    if (SPONSOR_UI) {
      const studio = page.getByTestId("cohort-studio");
      await expect(studio.getByText("Rubric items missed most")).toBeVisible();
      await expect(studio.getByText("Pass rate by question")).toBeVisible();
      await expect(studio.getByText("Pass rate by course")).toBeVisible();
      await expect(studio.locator("canvas").first()).toBeVisible();
      await expect(page.getByTestId("cohort-tables")).toHaveCount(0);
      await expect(page.getByText("AG Studio by AG Grid Ltd")).toBeVisible();
      expect(await code()).toMatch(/ag-studio/i);

      // Self-serve: a creator adds a widget, it survives a reload, and reset brings the layout back.
      const numbers = studio.locator(".ag-studio-value-widget");
      await expect(numbers).toHaveCount(4);
      await page.setViewportSize({ width: 1440, height: 1400 });
      await page.getByTestId("studio-edit").click();
      await expect(studio.getByText("Compose", { exact: true })).toBeVisible();
      const tile = await studio.getByText("KPI", { exact: true }).last().boundingBox();
      await page.mouse.click(tile!.x + tile!.width / 2, tile!.y - 10);
      await expect(numbers).toHaveCount(5);
      await page.reload();
      await expect(numbers).toHaveCount(5);
      await page.getByTestId("studio-reset").click();
      await expect(numbers).toHaveCount(4);
    } else {
      const tables = page.getByTestId("cohort-tables");
      await expect(tables.getByRole("gridcell", { name: "Q1 Honing or sharpening" })).toBeVisible();
      await expect(tables.getByRole("gridcell", { name: worst.item }).first()).toBeVisible();
      await expect(tables.getByText("Rubric items missed most")).toBeVisible();
      await expect(page.getByTestId("cohort-studio")).toHaveCount(0);
      await page.waitForLoadState("networkidle");
      const served = await code();
      expect(served.length).toBeGreaterThan(100_000);
      expect(served).not.toMatch(/ag-?studio|bryntum/i);
    }
    expect(errors).toEqual([]);
    await page.screenshot({ path: "screenshots/cohort-results.png" });
  });

  test("sample learners are labelled, and stay out of the course team's list", { tag: "@live" }, async ({ page, request }) => {
    if ((await mode(request)) === "mock") expect((await request.post("/api/dev/seed")).ok()).toBe(true);
    await page.goto("/cohort");
    await expect(page.getByTestId("sample-cohort-label")).toContainText("Sample cohort: 36 made-up learners");
    await expect(page.getByTestId("cohort-fix-first")).toBeVisible();
    await page.goto("/team");
    await expect(page.getByRole("heading", { name: "Refunds and learners" })).toBeVisible();
    await expect(page.getByText("Sample learner")).toHaveCount(0);
  });

  test("fail twice, a person approves, PayPal refunds", { tag: "@live" }, async ({ page, request }) => {
    if (process.env.E2E_BASE_URL) test.setTimeout(600_000); // real grading, and up to 3 minutes for PayPal's refund webhook
    const id = await buy(page, request, "Alex Rivera");
    const { payment } = await enrollmentOf(request, id);
    expect(payment).toMatchObject({ captureStatus: "COMPLETED", capturedCents: COURSE_PRICE_CENTS });

    const first = await attempt(page, "fail1", 1);
    expect(first).toBeLessThan(66);
    await expect(page.getByTestId("attempt-1").locator('[data-verdict="not_met"]').first()).toBeVisible();
    await expect(page.getByTestId("attempt-1").locator('[data-verdict="partial"], [data-verdict="met"]').first()).toBeVisible();
    await expect(page.getByTestId("study-list")).toBeVisible();
    await expect(page.getByTestId("fail-count")).toContainText("1 of 2");
    // Next keeps the course page mounted but hidden, so only the visible copy counts.
    await expect(page.getByTestId("guarantee").filter({ visible: true })).toBeVisible();
    await page.getByTestId("attempt-1").scrollIntoViewIfNeeded();
    await page.screenshot({ path: "screenshots/graded-result.png" });
    await studyThenRetry(page);

    const second = await attempt(page, "fail2", 2);
    expect(second).toBeLessThan(66);
    await expect(page.getByTestId("refund-waiting")).toBeVisible();

    const sandbox = (await mode(request)) === "sandbox";
    if (sandbox) expect((await readPayPalObjects(payment!.orderId, payment!.captureId!)).capture.status).toBe("COMPLETED");

    const team = await approveOnTeam(page, id);
    const hooks = await webhooksArrive(request);
    if (hooks) await refundWebhookShows(team, request, id);
    await team.getByTestId("learner-link").click();
    await expect(page.getByTestId("refund-issued")).toContainText("Refund issued, sorry we let you down", { timeout: 60_000 });
    if (hooks) await expect(page.getByTestId("refund-webhook")).toContainText(/PayPal.s webhook confirmed it at \d{1,2}:\d{2}\s[AP]M/, { timeout: 60_000 });
    const sandboxRefund = (await enrollmentOf(request, id)).refund;
    await expect(page.getByTestId("refund-status")).toHaveText("COMPLETED", { timeout: 30_000 });
    await expect(page.getByTestId("capture-status")).toHaveText(sandboxRefund!.captureStatus!);
    await expect(page.getByTestId("refund-amount")).toHaveText(`$${PRICE}`);
    await page.screenshot({ path: "screenshots/refund-issued.png" });

    const { refund } = await enrollmentOf(request, id);
    await expect(page.getByTestId("refund-id")).toHaveText(refund!.refundId!);
    if (sandbox) {
      const paypal = await readPayPalObjects(payment!.orderId, payment!.captureId!, refund!.refundId);
      console.log("PayPal re-read:", JSON.stringify({ order: [paypal.order.id, paypal.order.status], capture: [paypal.capture.id, paypal.capture.status, paypal.capture.amount.value], refund: [paypal.refund?.id, paypal.refund?.status, paypal.refund?.status_details?.reason, paypal.refund?.amount.value] }));
      expect(paypal.order.status).toBe("COMPLETED");
      expect(paypal.order.intent).toBe("CAPTURE");
      expect(paypal.order.purchase_units[0].custom_id).toBe(id);
      expect(paypal.capture.amount).toEqual({ currency_code: "USD", value: PRICE });
      expect(paypal.capture.status).toBe(refund!.captureStatus);
      // This app's seller is funded, so a refund settles at once. PENDING (reason ECHECK) means the balance ran short.
      expect(paypal.refund, `refund ${paypal.refund?.status} ${paypal.refund?.status_details?.reason ?? ""}`).toMatchObject({ status: "COMPLETED", amount: { currency_code: "USD", value: PRICE } });
      expect(paypal.capture.status).toBe("REFUNDED");
    }
  });

  test("the buy button opens PayPal's own window, and the test card pays there", { tag: "@live" }, async ({ page, request }) => {
    test.skip((await mode(request)) !== "sandbox", "PayPal's window only exists on the sandbox.");
    await page.goto("/course");
    const help = page.getByTestId("pay-without-account");
    await expect(help).toContainText("Pay with debit or credit card inside PayPal\u2019s window");
    await expect(page.getByTestId("sandbox-card-details")).toContainText("4111 1111 1111 1111");
    await expect(page.getByTestId("sandbox-test-card")).toHaveCount(0); // the server-side shortcut is for tests only
    await page.getByTestId("learner-name").filter({ visible: true }).fill("Pat Window");
    await page.getByTestId("learner-email").filter({ visible: true }).fill(newEmail("Pat Window"));
    await payInPayPalWindow(page);
    await page.waitForURL(/\/learn\/en_/, { timeout: 90_000 });
    const id = page.url().split("/learn/")[1];
    const { payment } = await enrollmentOf(request, id);
    expect(payment).toMatchObject({ captureStatus: "COMPLETED", capturedCents: COURSE_PRICE_CENTS });
    const paypal = await readPayPalObjects(payment!.orderId, payment!.captureId!);
    console.log("PayPal window purchase:", JSON.stringify({ order: [paypal.order.id, paypal.order.status], capture: [paypal.capture.id, paypal.capture.status, paypal.capture.amount.value] }));
    expect(paypal.order.status).toBe("COMPLETED");
    expect(paypal.capture).toMatchObject({ status: "COMPLETED", amount: { currency_code: "USD", value: PRICE } });
  });

  test("PayPal approves but its window never tells the page: the page finds the payment and closes the window", async ({ page, request }) => {
    test.skip((await mode(request)) !== "sandbox", "PayPal's window only exists on the sandbox.");
    await page.goto(COURSE_FOR_TESTS);
    await page.getByTestId("learner-name").filter({ visible: true }).fill("Pat Silent");
    await page.getByTestId("learner-email").filter({ visible: true }).fill(newEmail("Pat Silent"));
    const button = await paypalButtonReady(page);
    const created = page.waitForResponse((r) => r.request().method() === "POST" && r.url().endsWith("/api/enrollments"));
    const opened = page.waitForEvent("popup", { timeout: 30_000 });
    await button.click();
    const popup = await opened;
    const { orderId } = await (await created).json();
    // What the buyer does in PayPal's window, done behind it, so the window never reports back.
    expect((await request.post(`/api/dev/sandbox/approve-order/${orderId}`)).ok()).toBe(true);
    await popup.waitForEvent("close", { timeout: 30_000 });
    await page.waitForURL(/\/learn\/en_/, { timeout: 30_000 });
    const { payment } = await enrollmentOf(request, page.url().split("/learn/")[1]);
    const paypal = await readPayPalObjects(payment!.orderId, payment!.captureId!);
    console.log("PayPal re-read:", JSON.stringify({ silentWindow: [paypal.order.id, paypal.order.status, paypal.capture.id, paypal.capture.status] }));
    expect(paypal.order).toMatchObject({ id: orderId, status: "COMPLETED" });
    expect(paypal.capture).toMatchObject({ status: "COMPLETED", amount: { currency_code: "USD", value: PRICE } });
  });

  test("a person declines: no money moves and the learner reads why", { tag: "@live" }, async ({ page, request }) => {
    const id = await buy(page, request, "Dana Decline");
    await failTwice(page);
    const { payment } = await enrollmentOf(request, id);

    const { attempts } = await enrollmentOf(request, id);
    await page.getByTestId("refund-waiting").getByRole("link").click();
    const team = page.getByTestId(`enrollment-${id}`);
    // The agent's reasons name both scores, whatever the grader gave.
    await expect(team.getByTestId("approval-reasons")).toBeVisible({ timeout: 90_000 });
    for (const a of attempts) await expect(team.getByTestId("approval-reasons")).toContainText(String(a.score));
    await team.getByTestId("decline-button").click();
    await expect(team.getByTestId("decline-button")).toBeDisabled();
    await team.getByTestId("decline-note").fill("The two attempts look copied from another learner");
    await team.getByTestId("decline-button").click();
    await expect(team.getByTestId("refund-stopped")).toContainText("look copied");

    await team.getByTestId("learner-link").click();
    await expect(page.getByTestId("refund-declined")).toContainText("No money has moved");
    await expect(page.getByTestId("refund-declined")).toContainText("look copied");

    const { status, refund } = await enrollmentOf(request, id);
    expect(status).toBe("refund_declined");
    expect(refund?.refundId).toBeUndefined();
    if ((await mode(request)) === "sandbox") {
      const paypal = await readPayPalObjects(payment!.orderId, payment!.captureId!);
      console.log("PayPal re-read:", JSON.stringify({ capture: [paypal.capture.id, paypal.capture.status, paypal.capture.amount.value] }));
      expect(paypal.capture).toMatchObject({ status: "COMPLETED", amount: { value: PRICE } });
    }
  });

  test("one refund per learner per course", async ({ page, request }) => {
    const email = newEmail("Rae Twice");
    const first = await buy(page, request, "Rae Twice", email);
    await failTwice(page);
    await approveOnTeam(page, first);

    const second = await buy(page, request, "Rae Twice", email.toUpperCase());
    await attempt(page, "fail1", 1);
    await expect(page.getByTestId("prior-refund")).toContainText("one refund per PayPal account and per email");
    await skipTheWait(page);
    await attempt(page, "fail2", 2);
    await expect(page.getByTestId("refund-waiting")).toBeHidden();
    const { status, refund, guarantee } = await enrollmentOf(request, second);
    expect(status).toBe("active");
    expect(refund).toBeUndefined();
    expect(guarantee.due).toBe(false);
  });

  test("a passing attempt gets a certificate and no refund", async ({ page, request }) => {
    // The rubric's fingerprint before buying, on the receipt, and on the certificate are one and the same.
    await page.goto("/course");
    const onSale = (await page.getByTestId("rubric-fingerprint").first().innerText()).replace(/\s/g, "");
    expect(onSale).toMatch(/^[0-9a-f]{12}$/);
    const id = await buy(page, request, "Sam Okafor");
    await expect(page.getByTestId("receipt").getByTestId("rubric-fingerprint")).toHaveText(onSale.match(/.{4}/g)!.join(" "));
    await expect(page.getByTestId("receipt")).toContainText("locked when you bought");
    const score = await attempt(page, "pass", 1);
    expect(score).toBeGreaterThan(73);
    await expect(page.getByTestId("certificate")).toContainText("Sam Okafor");
    await expect(page.getByTestId("certificate").getByTestId("rubric-fingerprint")).toHaveText(onSale.match(/.{4}/g)!.join(" "));
    await expect(page.getByTestId("certificate").getByTestId("rubric-version")).toHaveText("v1");
    await page.getByTestId("certificate").screenshot({ path: "screenshots/certificate-rubric.png" });
    const { payment, refund, status, rubric: lock } = await enrollmentOf(request, id);
    expect(lock).toMatchObject({ version: "1", fingerprint: onSale });
    expect(status).toBe("passed");
    expect(refund).toBeUndefined();
    if ((await mode(request)) === "sandbox") {
      const paypal = await readPayPalObjects(payment!.orderId, payment!.captureId!);
      console.log("PayPal re-read:", JSON.stringify({ order: [paypal.order.id, paypal.order.status], capture: [paypal.capture.id, paypal.capture.status, paypal.capture.amount.value] }));
      expect(paypal.capture).toMatchObject({ status: "COMPLETED", amount: { value: PRICE } });
    }
  });

  test("a learner contests one rubric line, a person upholds it, and the score is added up again", async ({ page, request }) => {
    await page.goto("/");
    const stats = page.getByTestId("landing-cohort");
    await expect(stats.getByTestId("cohort-pass-rate")).toHaveText(/^\d+%$/);
    await expect(stats.getByTestId("cohort-refund-rate")).toHaveText(/^\d+%$/);
    await expect(stats).toContainText("made-up sample learners");

    const id = await buy(page, request, "Cleo Contest");
    const first = await attempt(page, "fail1", 1);
    const contest = page.getByTestId("contest-line");
    await contest.locator("summary").click();
    // Pick a line from a question no cap held down, so upholding it has to raise the score.
    const graded = (await enrollmentOf(request, id)).attempts[0];
    const run = graded.runs[graded.shownRun];
    const capped = new Set(run.caps.filter((c) => c.triggered).map((c) => c.id.split("-")[0]));
    const line = run.items.find((item) => item.verdict !== "met" && !capped.has(item.id.replace(/[a-z]$/, "")))!.id;
    await contest.getByTestId("contest-item").selectOption(line);
    await contest.getByTestId("contest-note").fill("My answer says the edge is worn, so it needs the stone.");
    await contest.getByTestId("contest-send").click();
    await expect(page.getByTestId("contest-status")).toContainText("With the course team");
    await expect(page.getByTestId("contest-line")).toHaveCount(0);

    await page.goto("/team");
    const card = page.getByTestId(`enrollment-${id}`);
    await expect(card.getByTestId("team-contest")).toContainText("My answer says the edge is worn");
    await card.getByTestId("contest-ruling-note").fill("Agreed: your answer says it plainly.");
    await card.getByTestId("contest-uphold").click();
    await expect(card.getByTestId("team-contest-done")).toContainText("upheld");

    const after = await enrollmentOf(request, id);
    expect(after.contest?.ruling).toMatchObject({ upheld: true, scoreBefore: first });
    expect(after.contest!.ruling!.scoreAfter).toBeGreaterThan(first);
    expect(after.attempts[0].score).toBe(after.contest!.ruling!.scoreAfter);
    await page.goto(`/learn/${id}`);
    await expect(page.getByTestId("contest-ruling")).toContainText(`from ${first} to ${after.contest!.ruling!.scoreAfter}`);
    await expect(page.getByTestId("contest-ruling")).toContainText("Agreed: your answer says it plainly.");
    await expect(page.getByTestId("score-1")).toContainText(String(after.contest!.ruling!.scoreAfter));
    await page.getByTestId("contest-status").screenshot({ path: "screenshots/contest-upheld.png" });
  });

  test("trying to trick the grader gets flagged and voids the guarantee", { tag: "@live" }, async ({ page, request }) => {
    const id = await buy(page, request, "Jo Tricks");
    const score = await attempt(page, "inject", 1);
    expect(score).toBeLessThan(66);
    await expect(page.getByTestId("flagged")).toContainText("instruct the grader");
    await expect(page.getByTestId("fail-count")).toBeHidden();
    expect((await enrollmentOf(request, id)).guaranteeVoid).toBe(true);
  });

  test("a borderline attempt waits for a person, who goes through it item by item and passes it", { tag: "@live" }, async ({ page, request }) => {
    const id = await buy(page, request, "Dee Close");
    const score = await attempt(page, "borderline", 1);
    const { status, refund, attempts } = await enrollmentOf(request, id);
    if (LIVE_AI && status !== "under_review") {
      // Real grading can land these answers outside 69-70. The learner still gets the result the rules give.
      expect(status).toBe(attempts[0].outcome === "pass" ? "passed" : "active");
      test.info().annotations.push({ type: "real AI", description: `Borderline answers scored ${score} (${attempts[0].runs.map((r) => r.total).join(", ")}), so no person was needed` });
      return;
    }
    if (!LIVE_AI) expect(score).toBe(69);
    await expect(page.getByTestId("under-review")).toContainText("Under review, answer within one business day");
    expect(status).toBe("under_review");
    expect(refund).toBeUndefined();
    expect(attempts[0].runs).toHaveLength(3);

    await page.goto("/team");
    const card = page.getByTestId(`enrollment-${id}`);
    const settle = card.getByTestId("settle-review");
    await expect(settle).toContainText(`landed on ${score}`);
    await expect(settle).toContainText(attempts[0].runs.map((r) => r.total).join(", "));
    await expect(settle.getByTestId("settle-pass")).toBeDisabled();
    await expect(settle.getByTestId("settle-fail")).toBeDisabled();
    const items = settle.locator('[data-testid^="settle-item-"]');
    expect(await items.count()).toBeGreaterThan(1);
    for (const item of await items.all()) await item.check();
    await expect(settle.getByTestId("settle-pass")).toBeDisabled();
    await settle.getByTestId("settle-note").fill("All four answers show the idea, in their own words.");
    await settle.scrollIntoViewIfNeeded();
    await page.screenshot({ path: "screenshots/settle-review.png" });
    await settle.getByTestId("settle-pass").click();
    await expect(card.getByText("Passed", { exact: true })).toBeVisible();

    await card.getByTestId("learner-link").click();
    await expect(page.getByTestId("certificate")).toContainText("Dee Close");
    await expect(page.getByTestId("settled-note")).toContainText("All four answers show the idea");
    await expect(page.getByTestId("score-1")).toContainText(String(score));
    expect(await enrollmentOf(request, id)).toMatchObject({ status: "passed", attempts: [{ score, outcome: "pass", settled: { outcome: "pass" } }] });
  });

  test("a borderline second attempt waits for a person, with no refund agent", async ({ page, request }) => {
    const id = await buy(page, request, "Lee Near");
    await attempt(page, "fail1", 1);
    await studyThenRetry(page);
    expect(await attempt(page, "borderline", 2)).toBe(69);
    await expect(page.getByTestId("under-review")).toContainText("Under review, answer within one business day");
    await expect(page.getByTestId("refund-waiting")).toBeHidden();
    const { status, refund, payment } = await enrollmentOf(request, id);
    expect(status).toBe("under_review");
    expect(refund).toBeUndefined();
    if ((await mode(request)) === "sandbox") expect((await readPayPalObjects(payment!.orderId, payment!.captureId!)).capture.status).toBe("COMPLETED");

    await page.goto("/team");
    const settle = page.getByTestId(`enrollment-${id}`).getByTestId("settle-review");
    await expect(settle).toBeVisible();
    for (const item of await settle.locator('[data-testid^="settle-item-"]').all()) await item.check();
    await settle.getByTestId("settle-note").fill("Two ideas are still missing.");
    await settle.getByTestId("settle-fail").click();
    const team = page.getByTestId(`enrollment-${id}`);
    await expect(team.getByTestId("approval-reasons")).toContainText("34 and 69", { timeout: 60_000 });
    expect((await enrollmentOf(request, id)).refund?.refundId).toBeUndefined();
    await team.getByTestId("decline-button").click();
    await team.getByTestId("decline-note").fill("Keeping this one open for the demo");
    await team.getByTestId("decline-button").click();
    await expect(team.getByTestId("refund-stopped")).toBeVisible();
  });

  test("a near-copy of an earlier attempt counts as incomplete", async ({ page, request }) => {
    const id = await buy(page, request, "Cy Copies");
    await attempt(page, "fail1", 1);
    await studyThenRetry(page);
    await attempt(page, "fail1", 2);
    await expect(page.getByTestId("attempt-2").getByTestId("near-copy")).toContainText("nearly the same as attempt 1");
    await expect(page.getByTestId("fail-count")).toContainText("nearly the same as attempt 1");
    await expect(page.getByTestId("refund-waiting")).toBeHidden();
    await page.getByTestId("near-copy").scrollIntoViewIfNeeded();
    await page.screenshot({ path: "screenshots/near-copy.png" });
    expect(await enrollmentOf(request, id)).toMatchObject({ status: "active", completedFails: 1, guarantee: { due: false }, attempts: [{}, { nearCopyOf: 1 }] });
  });

  test("the wait between attempts is shown, and judges can skip it to fail twice right away", async ({ page, request }) => {
    const id = await buy(page, request, "Gia Gap");
    await attempt(page, "fail1", 1);
    await expect(page.getByTestId("attempt-gap")).toContainText("Attempts are 24 hours apart");
    await expect(page.getByTestId("next-attempt-at")).not.toBeEmpty();
    await expect(page.getByTestId("submit-attempt")).toHaveCount(0);
    await page.screenshot({ path: "screenshots/attempt-gap.png", fullPage: true });
    const early = await request.post(`/api/enrollments/${id}/attempts`, { data: { answers: { q1: "Trying early", q2: "Trying early", q3: "Trying early", q4: "Trying early" } } });
    expect(early.status()).toBe(409);
    await studyThenRetry(page);
    await attempt(page, "fail2", 2);
    await expect(page.getByTestId("refund-waiting")).toBeVisible();
  });

  /** Buys through the mock PayPal window as a given PayPal payer: an account id, or just the email PayPal has (a guest card buyer). */
  async function buyAsPayer(page: Page, request: APIRequestContext, name: string, payer: { payerId?: string; email?: string }) {
    const { enrollmentId, orderId } = await (await request.post("/api/enrollments", { data: { learnerName: name, learnerEmail: newEmail(name) } })).json();
    expect((await request.post(`/api/dev/mock/approve-order/${orderId}`, { data: payer })).ok()).toBe(true);
    expect((await request.post(`/api/enrollments/${enrollmentId}/pay`, { data: { orderId } })).ok()).toBe(true);
    await page.goto(`/learn/${enrollmentId}`);
    return enrollmentId as string;
  }

  async function expectNoSecondRefund(page: Page, request: APIRequestContext, second: string) {
    await attempt(page, "fail1", 1);
    await expect(page.getByTestId("prior-refund")).toContainText("you\u2019ve had yours");
    await skipTheWait(page);
    await attempt(page, "fail2", 2);
    await expect(page.getByTestId("refund-waiting")).toBeHidden();
    const { status, refund, guarantee, payment } = await enrollmentOf(request, second);
    expect(status).toBe("active");
    expect(refund).toBeUndefined();
    expect(guarantee.checks.find((c) => c.rule === "one_refund_per_learner")?.passed).toBe(false);
    expect(payment).not.toHaveProperty("payerEmail");
  }

  for (const [label, payers] of [
    // Two wallet logins on one PayPal account: the account id matches, PayPal's email for it is told apart here on purpose.
    ["the same PayPal account", () => { const payerId = `PAYER${Date.now()}`; return [{ payerId, email: newEmail("Wallet One") }, { payerId, email: newEmail("Wallet Two") }]; }],
    // Two guest card checkouts in PayPal's window: a new account id each time, the same buyer email.
    ["the same PayPal payer email (a guest card buyer)", () => { const email = newEmail("Guest Card"); return [{ email }, { email: email.toUpperCase() }]; }],
  ] as const) {
    test(`a new email on ${label} can't get a second refund`, async ({ page, request }) => {
      test.skip((await mode(request)) !== "mock", "The PayPal payer can only be chosen on mock PayPal: a sandbox wallet buyer needs a login.");
      const [one, two] = payers();
      const first = await buyAsPayer(page, request, "Pat First", one);
      await failTwice(page);
      await approveOnTeam(page, first);
      const second = await buyAsPayer(page, request, "Pat Second", two);
      await expectNoSecondRefund(page, request, second);
    });
  }

  /** A checkout started and approved at PayPal, with the money taken while the app wasn't listening. */
  async function paidBehindTheApp(request: APIRequestContext, name: string, email: string) {
    const { enrollmentId, orderId } = await (await request.post("/api/enrollments", { data: { learnerName: name, learnerEmail: email } })).json();
    if ((await mode(request)) === "sandbox") {
      expect((await request.post(`/api/dev/sandbox/approve-order/${orderId}`)).ok()).toBe(true);
      await captureBehindTheApp(orderId);
    } else {
      expect((await request.post(`/api/dev/mock/approve-order/${orderId}`, { data: { email: `paypal.${email}` } })).ok()).toBe(true);
      expect((await request.post(`/api/dev/mock/behind-the-app/${enrollmentId}`, { data: { step: "capture" } })).ok()).toBe(true);
    }
    return { id: enrollmentId as string, orderId: orderId as string };
  }

  test("the app stops after PayPal takes the money: buying again finds the payment, with no second charge", { tag: "@live" }, async ({ page, request }) => {
    const email = newEmail("Ana Stuck");
    const { id, orderId } = await paidBehindTheApp(request, "Ana Stuck", email);

    await page.goto(COURSE_FOR_TESTS);
    await page.getByTestId("learner-name").filter({ visible: true }).fill("Ana Stuck");
    await page.getByTestId("learner-email").filter({ visible: true }).fill(email);
    await page.getByTestId((await mode(request)) === "sandbox" ? "sandbox-test-card" : "simulate-paypal-approval").click();
    await page.waitForURL(new RegExp(`/learn/${id}`), { timeout: 60_000 });
    await expect(page.getByTestId("payment-recovered")).toContainText("You paid once");
    await expect(page.getByTestId("submit-attempt")).toBeVisible();
    await page.screenshot({ path: "screenshots/payment-recovered.png" });
    const { payment, status } = await enrollmentOf(request, id);
    expect(status).toBe("active");
    expect(payment).toMatchObject({ orderId, recovered: true, captureStatus: "COMPLETED", capturedCents: COURSE_PRICE_CENTS });
    if ((await mode(request)) === "sandbox") {
      const paypal = await readPayPalObjects(orderId, payment!.captureId!);
      console.log("PayPal re-read:", JSON.stringify({ recovered: [paypal.order.id, paypal.order.purchase_units[0].payments.captures.map((c) => [c.id, c.status])] }));
      expect(paypal.order.purchase_units[0].payments.captures).toHaveLength(1);
    }
  });

  test("the app stops after PayPal takes the money: opening the course page is enough", { tag: "@live" }, async ({ page, request }) => {
    const { id } = await paidBehindTheApp(request, "Bo Reloads", newEmail("Bo Reloads"));
    await page.goto(`/learn/${id}`);
    await expect(page.getByTestId("payment-recovered")).toBeVisible();
    await expect(page.getByTestId("submit-attempt")).toBeVisible();
  });

  test("a checkout nobody paid for says so", { tag: "@live" }, async ({ page, request }) => {
    const { enrollmentId } = await (await request.post("/api/enrollments", { data: { learnerName: "Una Paid", learnerEmail: newEmail("Una Paid") } })).json();
    await page.goto(`/learn/${enrollmentId}`);
    await expect(page.getByTestId("purchase-unfinished")).toContainText("PayPal hasn\u2019t taken any money");
    await page.screenshot({ path: "screenshots/purchase-unfinished.png" });
  });

  test("the app stops after PayPal pays a refund: it's recorded, not paid twice", async ({ page, request }) => {
    const id = await buy(page, request, "Rob Stuck");
    await failTwice(page);
    const { payment } = await enrollmentOf(request, id);
    await page.getByTestId("refund-waiting").getByRole("link").click();
    const team = page.getByTestId(`enrollment-${id}`);
    await expect(team.getByTestId("approval-reasons")).toContainText("first refund", { timeout: 60_000 });

    if ((await mode(request)) === "sandbox") await refundBehindTheApp(payment!.captureId!);
    else expect((await request.post(`/api/dev/mock/behind-the-app/${id}`, { data: { step: "refund" } })).ok()).toBe(true);

    if (await webhooksArrive(request)) {
      // PayPal's REFUNDED webhook records the refund, and the approval waiting for it closes: nothing is left to pay.
      await expect(team.getByText("Refunded", { exact: true })).toBeVisible({ timeout: 60_000 });
      await expect(team.getByTestId("approve-button")).toHaveCount(0);
      await expect(team.getByTestId("team-webhook")).toContainText("PayPal's webhook confirmed the refund");
    } else {
      await team.getByTestId("approve-button").click();
      await expect(team.getByTestId("retry-refund")).toBeVisible({ timeout: 60_000 });
      await team.getByTestId("retry-refund").click();
      await expect(team.getByText("Refunded", { exact: true })).toBeVisible({ timeout: 60_000 });
    }
    const { refund, status } = await enrollmentOf(request, id);
    expect(status).toBe("refunded");
    expect(refund?.refundId).toBeTruthy();
    if ((await mode(request)) === "sandbox") {
      const refunds = await readRefunds(payment!.orderId);
      console.log("PayPal re-read:", JSON.stringify({ recoveredRefund: [refund?.refundId, refunds] }));
      expect(refunds).toHaveLength(1);
      expect(refunds[0].id).toBe(refund!.refundId);
    }
  });

  test("a PENDING refund settles when PayPal's webhook says so, with no reload", async ({ page, request }) => {
    test.skip((await mode(request)) !== "mock", "Only the mock can hold a refund PENDING on purpose.");
    expect((await request.post("/api/dev/mock/refund-hold", { data: { action: "hold" } })).ok()).toBe(true);
    try {
      const id = await buy(page, request, "Pia Pending");
      await failTwice(page);
      const team = await approveOnTeam(page, id);
      await team.getByTestId("learner-link").click();
      await expect(page.getByTestId("refund-status")).toHaveText("PENDING", { timeout: 30_000 });
      await expect(page.getByTestId("refund-pending-note")).toContainText("ECHECK");
      await expect(page.getByTestId("refund-webhook")).toHaveCount(0);

      expect((await request.post("/api/dev/mock/refund-hold", { data: { action: "release" } })).ok()).toBe(true);
      // Well inside the 30 s the server waits before asking PayPal again on its own: this is the webhook.
      await expect(page.getByTestId("refund-status")).toHaveText("COMPLETED", { timeout: 10_000 });
      await expect(page.getByTestId("capture-status")).toHaveText("REFUNDED");
      await expect(page.getByTestId("refund-webhook")).toContainText("PayPal\u2019s webhook confirmed it at");
      await expect(page.getByTestId("refund-pending-note")).toHaveCount(0);
    } finally {
      await request.post("/api/dev/mock/refund-hold", { data: { action: "off" } });
    }
  });

  test("a learner's PayPal dispute: the agent proposes accepting it once a refund is due, and a person approves", async ({ page, request }) => {
    test.skip((await mode(request)) !== "mock", "PayPal's sandbox only opens a dispute from the buyer's own account.");
    const id = await buy(page, request, "Dee Spute");
    await attempt(page, "fail1", 1);
    expect((await request.post(`/api/dev/mock/dispute/${id}`)).ok()).toBe(true);
    await expect(page.getByTestId("learner-dispute")).toContainText("You opened a PayPal dispute on this payment");
    await expect(page.getByTestId("tool-call-timeline").getByText("CUSTOMER.DISPUTE.CREATED")).toBeVisible();
    await page.goto("/team");
    await expect(page.getByTestId(`enrollment-${id}`).getByTestId("team-dispute")).toContainText("doesn't cover this yet");
    await expect(page.getByTestId(`enrollment-${id}`).getByTestId("approve-button")).toHaveCount(0);

    await page.goto(`/learn/${id}`);
    await studyThenRetry(page);
    await attempt(page, "fail2", 2);
    await expect(page.getByTestId("refund-waiting")).toBeVisible();
    await page.getByTestId("refund-waiting").getByRole("link").click();
    const team = page.getByTestId(`enrollment-${id}`);
    await expect(team.getByTestId("approval-reasons")).toContainText("PayPal dispute", { timeout: 60_000 });
    await expect(team).toContainText("Accept Dee Spute's PayPal dispute and refund $49.00");
    await team.getByTestId("approve-button").click();
    await expect(team.getByText("Refunded", { exact: true })).toBeVisible({ timeout: 60_000 });
    await expect(team).toContainText("paid by accepting the dispute");
    await expect(team.getByTestId("team-dispute")).toContainText("PayPal closed the dispute in the learner's favour");
    await team.getByTestId("learner-link").click();
    await expect(page.getByTestId("refund-via-dispute")).toBeVisible();
    await expect(page.getByTestId("refund-status")).toHaveText("COMPLETED", { timeout: 30_000 });
    await expect(page.getByTestId("capture-status")).toHaveText("REFUNDED");
    await expect(page.getByTestId("refund-webhook")).toBeVisible();
  });

  test("a learner's timeline shows only their own PayPal events", { tag: "@live" }, async ({ page, request, browser, baseURL }) => {
    await buy(page, request, "Ivy First");
    const other = await browser.newContext({ baseURL });
    const second = await other.newPage();
    try {
      await buy(second, request, "Oli Second");
      const captured = second.getByTestId("tool-call-timeline").locator('[data-kind="webhook"]').filter({ hasText: "PAYMENT.CAPTURE.COMPLETED" });
      if (await webhooksArrive(request)) await expect(captured).toHaveCount(1, { timeout: 60_000 });
      // Give anyone else's webhook time to show up, if it could.
      await second.waitForTimeout(3_000);
      expect(await captured.count()).toBeLessThanOrEqual(1);
    } finally {
      await other.close();
    }
  });

  test("a busy grader shows a live countdown that clears itself, and the answers stay", { tag: "@live" }, async ({ page, request }) => {
    await buy(page, request, "Busy Grader");
    await expect(page.getByTestId("submit-attempt")).toBeDisabled(); // nothing written yet
    await page.route("**/attempts", (route) =>
      route.request().method() === "POST"
        ? route.fulfill({ status: 429, headers: { "Retry-After": "7" }, json: { error: { type: "rate_limited", message: "Too many requests. Try again in 7s.", retryAfterSeconds: 7 } } })
        : route.continue(),
    );
    await page.getByTestId("sample-fail1").click();
    const typed = await page.getByTestId("answer-q1").inputValue();
    await page.getByTestId("submit-attempt").click();
    const countdown = page.getByTestId("busy-countdown");
    await expect(countdown).toHaveText(/Try again in [5-7]s/);
    await expect(page.getByRole("status").filter({ hasText: "The grader is busy" })).toBeVisible();
    await expect(page.getByTestId("grader-busy")).toBeVisible();
    await expect(page.getByTestId("submit-attempt")).toBeDisabled();
    // It ticks, and it outlasts the old 4.5 s toast.
    await page.waitForTimeout(5_000);
    await expect(countdown).toHaveText(/Try again in [1-3]s/);
    await expect(countdown).toBeHidden({ timeout: 6_000 });
    await expect(page.getByTestId("grader-busy")).toBeHidden();
    await expect(page.getByTestId("submit-attempt")).toBeEnabled();
    await expect(page.getByTestId("answer-q1")).toHaveValue(typed);
  });

  test("other errors stay until dismissed, in plain words", { tag: "@live" }, async ({ page, request }) => {
    await buy(page, request, "Plain Words");
    await page.route("**/attempts", (route) => (route.request().method() === "POST" ? route.fulfill({ status: 500, json: {} }) : route.continue()));
    await page.getByTestId("sample-fail1").click();
    await page.getByTestId("submit-attempt").click();
    const toast = page.getByRole("status").filter({ hasText: "Your attempt wasn't graded" });
    await expect(toast).toContainText("Something went wrong. Please try again.");
    await expect(toast).not.toContainText("500");
    await page.waitForTimeout(6_000);
    await expect(toast).toBeVisible();
    await toast.getByRole("button", { name: "Dismiss" }).click();
    await expect(toast).toBeHidden();
  });

  test("/team states its access rule", { tag: "@live" }, async ({ page }) => {
    await page.goto("/team");
    await expect(page.getByTestId("team-access-rule")).toContainText("behind a passcode that is printed for judges");
    await expect(page.getByTestId("team-access-rule")).toContainText("no real money can move");
  });

  test.describe("when the AI is out", () => {
    const outage = (request: APIRequestContext, mode: "down" | "credit" | null) => request.post("/api/dev/mock/ai-outage", { data: { mode } });

    test.beforeEach(async ({ request }) => {
      test.skip((await mode(request)) !== "mock", "Mock mode is the only place to switch the model off. The real path is checked in the unit tests.");
    });
    test.afterEach(async ({ request }) => {
      if ((await mode(request)) === "mock") await outage(request, null);
    });

    test("grading says what happened, keeps the answers and counts nothing", async ({ page, request }) => {
      const id = await buy(page, request, "Ty Credit");
      await page.getByTestId("sample-fail1").click();
      const typed = await page.getByTestId("answer-q1").inputValue();

      await outage(request, "credit");
      await submitAttempt(page);
      await expect(page.getByTestId("grading-unavailable")).toContainText("run out of AI grading credit");
      await expect(page.getByTestId("answer-q1")).toHaveValue(typed);
      await page.getByTestId("grading-unavailable").scrollIntoViewIfNeeded();
      await page.screenshot({ path: "screenshots/ai-credit-out.png" });

      await outage(request, "down");
      await submitAttempt(page);
      await expect(page.getByTestId("grading-unavailable")).toContainText("isn't answering right now");
      expect((await enrollmentOf(request, id)).attempts).toHaveLength(0);

      await outage(request, null);
      await submitAttempt(page);
      await expect(page.getByTestId("attempt-1")).toBeVisible();
      await expect(page.getByTestId("grading-unavailable")).toHaveCount(0);
    });

    test("a refund still reaches a person, who can approve it", async ({ page, request }) => {
      const id = await buy(page, request, "Mo Model");
      await failTwice(page);
      await page.getByTestId("refund-waiting").getByRole("link").click();
      const team = page.getByTestId(`enrollment-${id}`);
      await team.getByTestId("decline-button").click({ timeout: 60_000 });
      await team.getByTestId("decline-note").fill("Reopening with the model off");
      await team.getByTestId("decline-button").click();
      await expect(team.getByTestId("retry-refund")).toBeVisible();

      await outage(request, "down");
      await team.getByTestId("retry-refund").click();
      await expect(team.getByTestId("proposed-without-ai")).toContainText("The AI model wasn't available");
      await expect(team.getByTestId("approval-reasons")).toContainText("code built this proposal", { timeout: 60_000 });
      await team.scrollIntoViewIfNeeded();
      await page.screenshot({ path: "screenshots/refund-without-ai.png" });
      await team.getByTestId("approve-button").click();
      await expect(team.getByText("Refunded", { exact: true })).toBeVisible({ timeout: 60_000 });
      expect(await enrollmentOf(request, id)).toMatchObject({ status: "refunded", refund: { refundStatus: "COMPLETED" } });
    });
  });

  test("every page fits a phone with no sideways scroll", async ({ page, request }) => {
    const id = await buy(page, request, "Phoebe Phone");
    await attempt(page, "fail1", 1);
    await page.setViewportSize({ width: 390, height: 844 });
    for (const path of ["/course", `/learn/${id}`, "/team", "/cohort"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const { wide, room } = await page.evaluate(() => ({ wide: document.documentElement.scrollWidth, room: window.innerWidth }));
      expect(`${path} ${wide}`).toBe(`${path} ${room}`);
      await page.screenshot({ path: `screenshots/phone${path.replace(/\/learn\/.*/, "/learn").replace("/", "-")}.png`, fullPage: true });
    }

    if (SPONSOR_UI) {
      // Studio's widgets sit inside the screen, with no side panel taking half of it.
      const numbers = page.locator(".ag-studio-value-widget");
      await expect(numbers).toHaveCount(4);
      for (const box of await numbers.evaluateAll((all) => all.map((one) => one.getBoundingClientRect().right))) expect(box).toBeLessThanOrEqual(390);
      await expect(page.getByTestId("cohort-studio").getByText("Filters", { exact: true })).toHaveCount(0);
      await expect(page.getByTestId("studio-edit")).toHaveCount(0);
    }
  });
});

test.describe("real AI path with no budget left", () => {
  test.skip(!LIVE_AI || process.env.AI_DAILY_CAP_USD !== "0", "Needs E2E_AI_MODE=live and AI_DAILY_CAP_USD=0. It costs nothing, because the cap stops the call.");

  test("no AI budget: the learner reads why, keeps their answers and nothing counts", async ({ page, request }) => {
    const id = await buy(page, request, "Cap Zero");
    await page.getByTestId("sample-fail1").click();
    await submitAttempt(page);
    await expect(page.getByTestId("grading-unavailable")).toContainText("run out of AI grading credit");
    await expect(page.getByTestId("answer-q1")).not.toBeEmpty();
    expect((await enrollmentOf(request, id)).attempts).toHaveLength(0);
  });
});

test.describe("paid run", () => {
  test.skip(!LIVE_AI || process.env.AI_DAILY_CAP_USD === "0", "Needs E2E_AI_MODE=live, which spends real money.");

  test("real AI: two fails, the refund agent proposes, a person approves", async ({ page, request }) => {
    const id = await buy(page, request, "Real Agent");
    await failTwice(page);
    const team = await (async () => {
      await page.getByTestId("refund-waiting").getByRole("link").click();
      return page.getByTestId(`enrollment-${id}`);
    })();
    await expect(team.getByTestId("approval-reasons")).toBeVisible({ timeout: 90_000 });
    const held = await enrollmentOf(request, id);
    expect(held.status).toBe("refund_pending");
    expect(held.refund?.refundId).toBeUndefined();
    if ((await mode(request)) === "sandbox") expect((await readPayPalObjects(held.payment!.orderId, held.payment!.captureId!)).capture.status).toBe("COMPLETED");

    await team.getByTestId("approve-button").click();
    await expect(team.getByText("Refunded", { exact: true })).toBeVisible({ timeout: 90_000 });
    const { attempts, refund, payment } = await enrollmentOf(request, id);
    await page.goto(`/learn/${id}`);
    await expect(page.getByTestId("grader-1")).toContainText("Graded by Claude Sonnet 5.5");
    await expect(page.getByTestId("attempt-1").locator("blockquote").first()).toBeVisible();
    const budget = (await (await request.get("/api/kit/status")).json()).ai.budget;
    console.log("Real AI:", JSON.stringify({ scores: attempts.map((a) => a.score), reasons: held.refund?.proposal?.reasons, refund: [refund?.refundId, refund?.refundStatus, refund?.refundedCents], gradingUsd: attempts.reduce((sum, a) => sum + a.costUsd, 0), spentUsd: budget.spentUsd }));
    expect(attempts.flatMap((a) => a.runs).every((r) => !r.mocked)).toBe(true);
    if ((await mode(request)) === "sandbox") {
      const paypal = await readPayPalObjects(payment!.orderId, payment!.captureId!, refund!.refundId);
      console.log("PayPal re-read:", JSON.stringify({ capture: [paypal.capture.id, paypal.capture.status], refund: [paypal.refund?.id, paypal.refund?.status, paypal.refund?.amount.value] }));
      expect(paypal.refund).toMatchObject({ status: "COMPLETED", amount: { value: PRICE } });
      expect(paypal.capture.status).toBe("REFUNDED");
    }
  });

  test("real AI: one failing and one passing attempt", async ({ page, request }) => {
    const id = await buy(page, request, "Real Run");
    const failing = await attempt(page, "fail1", 1);
    await skipTheWait(page);
    const passing = await attempt(page, "pass", 2);
    const { attempts, status } = await enrollmentOf(request, id);
    const budget = (await (await request.get("/api/kit/status")).json()).ai.budget;
    console.log("Real AI:", JSON.stringify({
      attempts: attempts.map((a) => ({ score: a.score, outcome: a.outcome, grades: a.runs.map((r) => r.total), quoteChecked: a.runs.map((r) => r.totalQuoteChecked), mocked: a.runs.some((r) => r.mocked), model: a.runs[0].model, costUsd: a.costUsd })),
      spentUsd: budget.spentUsd,
    }));
    expect(attempts.flatMap((a) => a.runs).every((r) => !r.mocked)).toBe(true);
    expect(attempts[0].outcome).toBe("fail");
    expect(failing).toBeLessThan(66);
    expect(attempts[1].outcome).toBe("pass");
    expect(passing).toBeGreaterThan(73);
    expect(status).toBe("passed");
  });
});
