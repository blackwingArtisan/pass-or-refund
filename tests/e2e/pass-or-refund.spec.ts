/**
 * The course flows in a real browser. Runs on mock PayPal (npm run test:e2e) and on the real
 * sandbox (npm run test:e2e:sandbox), where PayPal's objects are read back directly.
 * `E2E_AI_MODE=live npx playwright test -c playwright.sandbox.config.ts -g "real AI"` is the paid run.
 */
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { COURSE_PRICE_CENTS } from "../../src/lib/course/content";
import { fromMinor } from "../../src/lib/money";
import type { Cohort } from "../../src/lib/course/cohort";
import type { EnrollmentView } from "../../src/lib/course/types";
import { payInPayPalWindow } from "./paypal-popup";
import { captureBehindTheApp, readPayPalObjects, readRefunds, refundBehindTheApp } from "./paypal-reread";

const PRICE = fromMinor(COURSE_PRICE_CENTS, "USD");
const LIVE_AI = process.env.E2E_AI_MODE === "live";
/** Read at build time, so this has to match the build under test. Never set on the hosted site. */
const SPONSOR_UI = process.env.NEXT_PUBLIC_SPONSOR_UI === "1";

const mode = async (request: APIRequestContext) => (await (await request.get("/api/kit/status")).json()).paypal.mode as "mock" | "sandbox";

/** A new address each time: the hosted suite keeps its data between runs, and a learner only gets one refund. */
const newEmail = (name: string) => `${name.toLowerCase().replace(/\W+/g, ".")}.${Date.now()}@example.com`;

async function buy(page: Page, request: APIRequestContext, name: string, email = newEmail(name)): Promise<string> {
  await page.goto("/course");
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
  await expect(team.getByTestId("approval-reasons")).toContainText("first refund", { timeout: 60_000 });
  await team.getByTestId("approve-button").click();
  await expect(team.getByText("Refunded", { exact: true })).toBeVisible({ timeout: 60_000 });
  return team;
}

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

test.describe("mock-safe flows", () => {
  test.skip(LIVE_AI, "These flows use mock AI. The paid run is the real AI test.");

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

  test("sample learners are labelled, and stay out of the course team's list", async ({ page, request }) => {
    if ((await mode(request)) === "mock") expect((await request.post("/api/dev/seed")).ok()).toBe(true);
    await page.goto("/cohort");
    await expect(page.getByTestId("sample-cohort-label")).toContainText("Sample cohort: 36 made-up learners");
    await expect(page.getByTestId("cohort-fix-first")).toBeVisible();
    await page.goto("/team");
    await expect(page.getByRole("heading", { name: "Refunds and learners" })).toBeVisible();
    await expect(page.getByText("Sample learner")).toHaveCount(0);
  });

  test("fail twice, a person approves, PayPal refunds", async ({ page, request }) => {
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
    await team.getByTestId("learner-link").click();
    await expect(page.getByTestId("refund-issued")).toContainText("Refund issued, sorry we let you down", { timeout: 60_000 });
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

  // Not working yet: after paying, PayPal's guest page variant leaves the window open.
  test.fixme("the buy button opens PayPal's own window, and the test card pays there", async ({ page, request }) => {
    test.skip((await mode(request)) !== "sandbox", "PayPal's window only exists on the sandbox.");
    await page.goto("/course");
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

  test("a person declines: no money moves and the learner reads why", async ({ page, request }) => {
    const id = await buy(page, request, "Dana Decline");
    await failTwice(page);
    const { payment } = await enrollmentOf(request, id);

    await page.getByTestId("refund-waiting").getByRole("link").click();
    const team = page.getByTestId(`enrollment-${id}`);
    await expect(team.getByTestId("approval-reasons")).toContainText("34 and 52", { timeout: 60_000 });
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

  test("trying to trick the grader gets flagged and voids the guarantee", async ({ page, request }) => {
    const id = await buy(page, request, "Jo Tricks");
    const score = await attempt(page, "inject", 1);
    expect(score).toBeLessThan(66);
    await expect(page.getByTestId("flagged")).toContainText("instruct the grader");
    await expect(page.getByTestId("fail-count")).toBeHidden();
    expect((await enrollmentOf(request, id)).guaranteeVoid).toBe(true);
  });

  test("a borderline attempt waits for a person, who goes through it item by item and passes it", async ({ page, request }) => {
    const id = await buy(page, request, "Dee Close");
    expect(await attempt(page, "borderline", 1)).toBe(69);
    await expect(page.getByTestId("under-review")).toContainText("Under review, answer within one business day");
    const { status, refund, attempts } = await enrollmentOf(request, id);
    expect(status).toBe("under_review");
    expect(refund).toBeUndefined();
    expect(attempts[0].runs).toHaveLength(3);

    await page.goto("/team");
    const card = page.getByTestId(`enrollment-${id}`);
    const settle = card.getByTestId("settle-review");
    await expect(settle).toContainText("landed on 69");
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
    await expect(page.getByTestId("score-1")).toContainText("69");
    expect(await enrollmentOf(request, id)).toMatchObject({ status: "passed", attempts: [{ score: 69, outcome: "pass", settled: { outcome: "pass" } }] });
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

  test("the app stops after PayPal takes the money: buying again finds the payment, with no second charge", async ({ page, request }) => {
    const email = newEmail("Ana Stuck");
    const { id, orderId } = await paidBehindTheApp(request, "Ana Stuck", email);

    await page.goto("/course");
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

  test("the app stops after PayPal takes the money: opening the course page is enough", async ({ page, request }) => {
    const { id } = await paidBehindTheApp(request, "Bo Reloads", newEmail("Bo Reloads"));
    await page.goto(`/learn/${id}`);
    await expect(page.getByTestId("payment-recovered")).toBeVisible();
    await expect(page.getByTestId("submit-attempt")).toBeVisible();
  });

  test("a checkout nobody paid for says so", async ({ page, request }) => {
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

    await team.getByTestId("approve-button").click();
    await expect(team.getByTestId("retry-refund")).toBeVisible({ timeout: 60_000 });
    await team.getByTestId("retry-refund").click();
    await expect(team.getByText("Refunded", { exact: true })).toBeVisible({ timeout: 60_000 });
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

  test("a busy grader shows a live countdown that clears itself, and the answers stay", async ({ page, request }) => {
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

  test("other errors stay until dismissed, in plain words", async ({ page, request }) => {
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

  test("/team states its access rule", async ({ page }) => {
    await page.goto("/team");
    await expect(page.getByTestId("team-access-rule")).toContainText("open to anyone on purpose");
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
