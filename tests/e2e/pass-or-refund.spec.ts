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
import { readPayPalObjects } from "./paypal-reread";

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

async function attempt(page: Page, sample: string, number: number) {
  await page.getByTestId(`sample-${sample}`).click();
  await page.getByTestId("submit-attempt").click();
  await expect(page.getByTestId(`attempt-${number}`)).toBeVisible({ timeout: 120_000 });
  return Number(await page.getByTestId(`score-${number}`).innerText().then((t) => t.split("/")[0].trim()));
}

/** Marks the study list, so the next attempt can count toward a refund. */
async function review(page: Page) {
  await page.getByTestId("mark-reviewed").click();
  await expect(page.getByTestId("study-list-reviewed")).toBeVisible();
}

async function failTwice(page: Page) {
  await attempt(page, "fail1", 1);
  await review(page);
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
    test.skip((await mode(request)) !== "mock", "Sample data only exists on mock PayPal.");
    expect((await request.post("/api/dev/seed")).ok()).toBe(true);
    await page.goto("/cohort");
    await expect(page.getByText("Includes 36 made-up sample learners")).toBeVisible();
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
    await review(page);

    const second = await attempt(page, "fail2", 2);
    expect(second).toBeLessThan(66);
    await expect(page.getByTestId("refund-waiting")).toBeVisible();

    const sandbox = (await mode(request)) === "sandbox";
    if (sandbox) expect((await readPayPalObjects(payment!.orderId, payment!.captureId!)).capture.status).toBe("COMPLETED");

    const team = await approveOnTeam(page, id);
    await team.getByTestId("learner-link").click();
    await expect(page.getByTestId("refund-issued")).toContainText("Refund issued, sorry we let you down", { timeout: 60_000 });
    const sandboxRefund = (await enrollmentOf(request, id)).refund;
    await expect(page.getByTestId("refund-status")).toHaveText(sandbox ? sandboxRefund!.refundStatus! : "COMPLETED");
    if (sandboxRefund?.refundStatus === "PENDING") await expect(page.getByTestId("refund-pending-note")).toContainText("still paying it out");
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
      // The shared sandbox seller can run short, and then PayPal pays from its bank: PENDING, reason ECHECK.
      expect(paypal.refund).toMatchObject({ status: refund!.refundStatus, amount: { currency_code: "USD", value: PRICE } });
      expect(["COMPLETED", "PENDING"]).toContain(paypal.refund!.status);
    }
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
    await expect(page.getByTestId("prior-refund")).toContainText("one refund per learner per course");
    await attempt(page, "fail2", 2);
    await expect(page.getByTestId("refund-waiting")).toBeHidden();
    const { status, refund, guarantee } = await enrollmentOf(request, second);
    expect(status).toBe("active");
    expect(refund).toBeUndefined();
    expect(guarantee.due).toBe(false);
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

  test("a borderline second attempt waits for a person, with no refund agent", async ({ page, request }) => {
    const id = await buy(page, request, "Lee Near");
    await attempt(page, "fail1", 1);
    await review(page);
    expect(await attempt(page, "borderline", 2)).toBe(69);
    await expect(page.getByTestId("under-review")).toContainText("Under review, answer within one business day");
    await expect(page.getByTestId("refund-waiting")).toBeHidden();
    const { status, refund, payment } = await enrollmentOf(request, id);
    expect(status).toBe("under_review");
    expect(refund).toBeUndefined();
    if ((await mode(request)) === "sandbox") expect((await readPayPalObjects(payment!.orderId, payment!.captureId!)).capture.status).toBe("COMPLETED");
  });
});

test.describe("paid run", () => {
  test.skip(!LIVE_AI, "Needs E2E_AI_MODE=live, which spends real money.");

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
    const budget = (await (await request.get("/api/kit/status")).json()).ai.budget;
    console.log("Real AI:", JSON.stringify({ scores: attempts.map((a) => a.score), reasons: held.refund?.proposal?.reasons, refund: [refund?.refundId, refund?.refundStatus, refund?.refundedCents], gradingUsd: attempts.reduce((sum, a) => sum + a.costUsd, 0), spentUsd: budget.spentUsd }));
    expect(attempts.flatMap((a) => a.runs).every((r) => !r.mocked)).toBe(true);
    if ((await mode(request)) === "sandbox") {
      const paypal = await readPayPalObjects(payment!.orderId, payment!.captureId!, refund!.refundId);
      console.log("PayPal re-read:", JSON.stringify({ capture: [paypal.capture.id, paypal.capture.status], refund: [paypal.refund?.id, paypal.refund?.status, paypal.refund?.amount.value] }));
      expect(paypal.refund).toMatchObject({ status: refund!.refundStatus, amount: { value: PRICE } });
      expect(["COMPLETED", "PENDING"]).toContain(paypal.refund!.status);
    }
  });

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
