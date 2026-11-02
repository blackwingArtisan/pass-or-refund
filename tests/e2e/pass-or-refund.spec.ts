/**
 * The course flows in a real browser. Runs on mock PayPal (npm run test:e2e) and on the real
 * sandbox (npm run test:e2e:sandbox), where PayPal's objects are read back directly.
 * `E2E_AI_MODE=live npx playwright test -c playwright.sandbox.config.ts -g "real AI"` is the paid run.
 */
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { COURSE_PRICE_CENTS } from "../../src/lib/course/content";
import { fromMinor } from "../../src/lib/money";
import type { EnrollmentView } from "../../src/lib/course/types";
import { readPayPalObjects } from "./paypal-reread";

const PRICE = fromMinor(COURSE_PRICE_CENTS, "USD");
const LIVE_AI = process.env.E2E_AI_MODE === "live";

const mode = async (request: APIRequestContext) => (await (await request.get("/api/kit/status")).json()).paypal.mode as "mock" | "sandbox";

async function buy(page: Page, request: APIRequestContext, name: string): Promise<string> {
  await page.goto("/course");
  await expect(page.getByTestId("guarantee")).toContainText("Fail the final check twice");
  await page.getByTestId("learner-name").fill(name);
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

async function attempt(page: Page, sample: string, number: number) {
  await page.getByTestId(`sample-${sample}`).click();
  await page.getByTestId("submit-attempt").click();
  await expect(page.getByTestId(`attempt-${number}`)).toBeVisible({ timeout: 120_000 });
  return Number(await page.getByTestId(`score-${number}`).innerText().then((t) => t.split("/")[0].trim()));
}

const enrollmentOf = async (request: APIRequestContext, id: string) => (await (await request.get(`/api/enrollments/${id}`)).json()) as EnrollmentView;

test.describe("mock-safe flows", () => {
  test.skip(LIVE_AI, "These flows use mock AI. The paid run is the real AI test.");

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
    await page.screenshot({ path: "screenshots/graded-result.png", fullPage: true });

    const second = await attempt(page, "fail2", 2);
    expect(second).toBeLessThan(66);
    await expect(page.getByTestId("refund-waiting")).toBeVisible();

    const sandbox = (await mode(request)) === "sandbox";
    if (sandbox) expect((await readPayPalObjects(payment!.orderId, payment!.captureId!)).capture.status).toBe("COMPLETED");

    await page.getByTestId("refund-waiting").getByRole("link").click();
    const team = page.getByTestId(`enrollment-${id}`);
    await team.getByTestId("approve-button").click();
    await expect(team.getByText("Refunded", { exact: true })).toBeVisible({ timeout: 60_000 });
    await team.getByTestId("learner-link").click();
    await expect(page.getByTestId("refund-issued")).toContainText("Refund issued, sorry we let you down", { timeout: 60_000 });
    await expect(page.getByTestId("refund-status")).toHaveText("COMPLETED");
    await expect(page.getByTestId("capture-status")).toHaveText("REFUNDED");
    await expect(page.getByTestId("refund-amount")).toHaveText(`$${PRICE}`);
    await page.screenshot({ path: "screenshots/refund-issued.png", fullPage: true });

    const { refund } = await enrollmentOf(request, id);
    await expect(page.getByTestId("refund-id")).toHaveText(refund!.refundId!);
    if (sandbox) {
      const paypal = await readPayPalObjects(payment!.orderId, payment!.captureId!, refund!.refundId);
      console.log("PayPal re-read:", JSON.stringify({ order: [paypal.order.id, paypal.order.status], capture: [paypal.capture.id, paypal.capture.status, paypal.capture.amount.value], refund: [paypal.refund?.id, paypal.refund?.status, paypal.refund?.amount.value] }));
      expect(paypal.order.status).toBe("COMPLETED");
      expect(paypal.order.intent).toBe("CAPTURE");
      expect(paypal.order.purchase_units[0].custom_id).toBe(id);
      expect(paypal.capture).toMatchObject({ status: "REFUNDED", amount: { currency_code: "USD", value: PRICE } });
      expect(paypal.refund).toMatchObject({ status: "COMPLETED", amount: { currency_code: "USD", value: PRICE } });
    }
  });

  test("a passing attempt gets a certificate and no refund", async ({ page, request }) => {
    const id = await buy(page, request, "Sam Okafor");
    const score = await attempt(page, "pass", 1);
    expect(score).toBeGreaterThan(73);
    await expect(page.getByTestId("certificate")).toContainText("Sam Okafor");
    const { payment, refund, status } = await enrollmentOf(request, id);
    expect(status).toBe("passed");
    expect(refund).toBeUndefined();
    if ((await mode(request)) === "sandbox") {
      const paypal = await readPayPalObjects(payment!.orderId, payment!.captureId!);
      console.log("PayPal re-read:", JSON.stringify({ order: [paypal.order.id, paypal.order.status], capture: [paypal.capture.id, paypal.capture.status, paypal.capture.amount.value] }));
      expect(paypal.capture).toMatchObject({ status: "COMPLETED", amount: { value: PRICE } });
    }
  });

  test("trying to trick the grader gets flagged and voids the guarantee", async ({ page, request }) => {
    const id = await buy(page, request, "Jo Tricks");
    const score = await attempt(page, "inject", 1);
    expect(score).toBeLessThan(66);
    await expect(page.getByTestId("flagged")).toContainText("instruct the grader");
    await expect(page.getByTestId("fail-count")).toBeHidden();
    expect((await enrollmentOf(request, id)).guaranteeVoid).toBe(true);
  });

  test("a borderline attempt waits for a person, with no refund", async ({ page, request }) => {
    const id = await buy(page, request, "Dee Close");
    expect(await attempt(page, "borderline", 1)).toBe(69);
    await expect(page.getByTestId("under-review")).toContainText("Under review, answer within one business day");
    const { status, refund, attempts } = await enrollmentOf(request, id);
    expect(status).toBe("under_review");
    expect(refund).toBeUndefined();
    expect(attempts[0].runs).toHaveLength(3);
  });
});

test.describe("paid run", () => {
  test.skip(!LIVE_AI, "Needs E2E_AI_MODE=live, which spends real money.");

  test("real AI: one failing and one passing attempt", async ({ page, request }) => {
    const id = await buy(page, request, "Real Run");
    const failing = await attempt(page, "fail1", 1);
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
