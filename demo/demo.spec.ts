/**
 * DEMO VIDEO (npm run demo:record). The story: a learner buys a course, fails twice, a person
 * approves, and PayPal pays them back. Stays under ~2:50.
 */
import { expect, test } from "@playwright/test";
import { caption, DemoClock, highlight, titleCard } from "./captions";

test("demo", async ({ page, request }) => {
  const clock = new DemoClock(170);
  const sandbox = (await (await request.get("/api/kit/status")).json()).paypal.mode === "sandbox";

  // Scene 1: the pitch
  await page.goto("/");
  await titleCard(page, "Pass or Refund", "Pass the course, or get your money back");
  await caption(page, "Course guarantees are usually small print. This one pays out.");
  clock.check("pitch");

  // Scene 2: buying, with the guarantee in view
  await page.goto("/course");
  await page.getByTestId("guarantee").waitFor();
  await highlight(page, page.getByTestId("guarantee"));
  await caption(page, "The guarantee sits right next to the pay button.");
  await page.getByTestId("learner-name").fill("Alex Rivera");
  await page.getByTestId("learner-email").fill(`alex.rivera.${Date.now()}@example.com`);
  await page.getByTestId(sandbox ? "sandbox-test-card" : "simulate-paypal-approval").click();
  if (!sandbox) await page.getByTestId("mock-approve").click();
  await page.waitForURL(/\/learn\/en_/, { timeout: 60_000 });
  await caption(page, "PayPal takes the payment. Every call shows on the timeline.");
  clock.check("bought");

  // Scene 3: first fail
  await page.getByTestId("sample-fail1").click();
  await page.getByTestId("submit-attempt").click();
  await page.getByTestId("attempt-1").waitFor({ timeout: 90_000 });
  await page.getByTestId("attempt-1").scrollIntoViewIfNeeded();
  await caption(page, "Claude marks every rubric item and quotes the answer. Code adds up the score.");
  await page.getByTestId("study-list").scrollIntoViewIfNeeded();
  await caption(page, "What was missed becomes the study list.");
  await page.getByTestId("fail-count").scrollIntoViewIfNeeded();
  for (const item of await page.locator('[data-testid^="study-item-"]').all()) await item.click();
  await caption(page, "The learner ticks off each item before the next attempt counts.");
  await page.getByTestId("mark-reviewed").click();
  await page.getByTestId("skip-wait").scrollIntoViewIfNeeded();
  await highlight(page, page.getByTestId("attempt-gap"));
  await caption(page, "Attempts are a day apart, so there's time to study. Judges can skip the wait.");
  await page.getByTestId("skip-wait").click();
  clock.check("first fail");

  // Scene 4: second fail
  await page.getByTestId("sample-fail2").click();
  await page.getByTestId("submit-attempt").click();
  await page.getByTestId("refund-waiting").waitFor({ timeout: 90_000 });
  await caption(page, "A second real try fails too. The refund is due, but no money has moved.");
  clock.check("second fail");

  // Scene 5: a person approves
  await page.getByTestId("refund-waiting").getByRole("link").click();
  const approve = page.getByTestId("approve-button").first();
  await approve.waitFor();
  await highlight(page, approve);
  await caption(page, "AI suggests, policy decides, and a person approves before any money moves.");
  await approve.click();
  await expect(page.getByText("Refunded", { exact: true }).first()).toBeVisible({ timeout: 60_000 });
  clock.check("approved");

  // Scene 6: the refund
  await page.getByTestId("learner-link").first().click();
  await page.getByTestId("refund-issued").waitFor();
  await caption(page, "A real PayPal refund, with its id and status read back from PayPal.");
  clock.check("refunded");

  // Scene 7: the audit log
  await page.goto("/activity");
  await page.getByTestId("audit-row").first().waitFor();
  await caption(page, "Every decision is in a hash-chained audit log.");
  clock.check("audit");

  // Scene 8: what the creator learns
  if (!sandbox) await request.post("/api/dev/seed");
  await page.goto("/cohort");
  await page.getByTestId("cohort-fix-first").waitFor();
  await highlight(page, page.getByTestId("cohort-fix-first"));
  await caption(page, "The creator sees what learners miss most, and which lesson to fix first.");
  await page.mouse.wheel(0, 500);
  await caption(page, "No names or emails here. Just the rubric, the results and the refunds.");
  await titleCard(page, "Pass or Refund", "Built with PayPal, Claude and Claude Code");
  clock.check("end");

  const video = page.video();
  await page.close();
  await video?.saveAs("videos/demo-pass-or-refund.webm");
});
