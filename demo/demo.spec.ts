/**
 * DEMO VIDEO (npm run demo:record, then npm run demo:edit). The story, in order:
 *   1. the creator's case on the home page
 *   2. paying in PayPal's own window with the sandbox test card (3-4 s of it)
 *   3. a weak answer, graded with a quote from it
 *   4. another learner trying to trick the grader, flagged
 *   5. the second fail
 *   6. the course team approving the refund
 *   7. "Refund issued", with PayPal's webhook line
 *   8. a passing learner's certificate
 *   9. /cohort and its "Fix first" line, as the close
 * The edited cut stays under 2:30. The two side learners (4 and 8) are set up first, off camera.
 * Local check: mock AI (DEMO_AI_MODE unset), mock or sandbox PayPal. Submission cut: DEMO_PAYPAL_MODE=sandbox
 * DEMO_AI_MODE=live. A local sandbox gets no PayPal webhooks, so beat 7's webhook line only shows on
 * the hosted app or with mock PayPal; the run logs which.
 */
import fs from "node:fs";
import { expect, test, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import { payInPayPalWindow } from "../tests/e2e/paypal-popup";
import { caption, centre, DemoClock, DemoCuts, highlight } from "./captions";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const EDITED_LIMIT_SECONDS = 150;
const WEAK_ANSWER = "Honing sharpens the knife. Her brother is right, she should hone it for longer every Sunday.";
const email = (name: string) => `${name.toLowerCase().replace(/\s+/g, ".")}.${Date.now()}@example.com`;

/** Buys the course on the course page, with the server-side test card on the sandbox. */
async function buyOffCamera(page: Page, name: string, sandbox: boolean) {
  await page.goto("/course");
  await page.getByTestId("learner-name").filter({ visible: true }).fill(name);
  await page.getByTestId("learner-email").filter({ visible: true }).fill(email(name));
  if (sandbox) await page.getByTestId("sandbox-test-card").click();
  else {
    await page.getByTestId("simulate-paypal-approval").click();
    await page.getByTestId("mock-approve").click();
  }
  await page.waitForURL(/\/learn\/en_/, { timeout: 90_000 });
  await page.getByTestId("submit-attempt").waitFor();
  return page.url().split("/learn/")[1];
}

async function submitPrepared(page: Page, sample: string, number: number) {
  await page.getByTestId(`sample-${sample}`).click();
  await page.getByTestId("submit-attempt").click();
  await page.getByTestId(`attempt-${number}`).waitFor({ timeout: 150_000 });
}

/** The two learners beside Jordan: one tries to trick the grader, one passes. Their pages aren't recorded. */
async function sideLearners(browser: Browser, baseURL: string, sandbox: boolean) {
  const context = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [{ origin: new URL(baseURL).origin, localStorage: [{ name: "por_judge", value: "1" }] }] } });
  const page = await context.newPage();
  const trick = await buyOffCamera(page, "Sam Ortiz", sandbox);
  await submitPrepared(page, "inject", 1);
  await expect(page.getByTestId("flagged")).toBeVisible();
  const pass = await buyOffCamera(page, "Riley Chen", sandbox);
  await submitPrepared(page, "pass", 1);
  await expect(page.getByTestId("certificate")).toBeVisible();
  await context.close();
  return { trick, pass };
}

async function unlockTeam(page: Page, request: APIRequestContext) {
  const passcode = (await page.getByTestId("team-passcode-shown").innerText()).trim();
  expect((await page.request.post("/api/team/session", { data: { passcode } })).ok()).toBe(true);
  void request;
}

test("demo", async ({ page, request, browser, baseURL }) => {
  test.setTimeout(600_000);
  const status = await (await request.get("/api/kit/status")).json();
  const sandbox = status.paypal.mode === "sandbox";
  const side = await sideLearners(browser, baseURL!, sandbox);

  const cuts = new DemoCuts();
  cuts.resume(); // The setup above is off camera.
  const clock = new DemoClock(420);
  const beat = (label: string) => {
    clock.check(label);
    console.log(`[demo]   edited cut at ${cuts.editedSeconds}s`);
  };
  let popup: Page | undefined;

  // 1. The creator's case, 8-10 s
  await page.goto("/");
  const headline = page.getByTestId("story-headline");
  await headline.waitFor();
  await unlockTeam(page, request);
  await sleep(500);
  await highlight(page, headline, 2600);
  await caption(page, "Course refund promises are hard to check, so buyers don't trust them.", { ms: 3200 });
  const numbers = page.getByTestId("creator-numbers");
  await centre(numbers);
  await highlight(page, numbers, 3000);
  await caption(page, "Pass or Refund makes the guarantee checkable, and shows the creator what it costs.", { ms: 3600 });
  beat("creator case");

  // 2. PayPal's own window with the sandbox test card, 3-4 s of it
  await page.goto("/course");
  await page.getByTestId("guarantee").waitFor();
  await page.getByTestId("learner-name").filter({ visible: true }).pressSequentially("Jordan Lee", { delay: 40 });
  await page.getByTestId("learner-email").filter({ visible: true }).fill(email("Jordan Lee"));
  let paypalWindow = sandbox;
  if (sandbox) {
    let openedAt = 0;
    const marks: number[] = [];
    const since = () => (Date.now() - openedAt) / 1000;
    popup = await payInPayPalWindow(page, {
      onOpen: async () => {
        openedAt = Date.now();
      },
      onForm: async (p) => {
        marks.push(since());
        await caption(p, "PayPal's own checkout window, paying with the sandbox test card.", { wait: false, ms: 20_000 });
      },
      onFilled: async () => {
        marks.push(since());
      },
    }).catch(async (e) => {
      console.log(`[demo] PayPal window failed, paying with the server-side test card: ${(e as Error).message.split("\n")[0]}`);
      paypalWindow = false;
      for (const p of page.context().pages()) if (p !== page) await p.close().catch(() => undefined);
      await page.getByTestId("sandbox-test-card").click();
      return undefined;
    });
    if (paypalWindow && marks.length === 2) {
      cuts.clips("popup", [
        { from: marks[0], to: marks[0] + 1.6 },
        { from: marks[1] - 0.4, to: marks[1] + 1.8 },
      ]);
    } else {
      paypalWindow = false;
    }
  } else {
    await page.getByTestId("simulate-paypal-approval").click();
    await page.getByTestId("mock-approve").click();
  }
  await page.waitForURL(/\/learn\/en_/, { timeout: 90_000 });
  await page.getByTestId("submit-attempt").waitFor();
  cuts.resume();
  await caption(page, "Paid: PayPal captured $49.00.", { ms: 2200 });
  beat("bought");

  // 3. A weak answer, graded with its quote
  const toggle = page.getByTestId("judge-toggle");
  await centre(toggle);
  await highlight(page, toggle, 1400);
  await toggle.click();
  await page.getByTestId("sample-fail1").click();
  const answer = page.getByTestId("answer-q1");
  await centre(answer);
  await caption(page, "Jordan answers the final check. Judges can fill prepared answers.", { wait: false, ms: 5000 });
  await answer.fill("");
  await answer.pressSequentially(WEAK_ANSWER, { delay: 18 });
  await page.getByTestId("submit-attempt").click();
  await sleep(400);
  cuts.pause(0.8);
  await page.getByTestId("attempt-1").waitFor({ timeout: 150_000 });
  cuts.resume();
  const question = page.getByTestId("question-1-q1");
  await centre(question);
  await highlight(page, question, 2600);
  await caption(page, "The grader marks each rubric line and quotes Jordan's own words.", { ms: 3400 });
  const score = page.getByTestId("score-1");
  await centre(score);
  await highlight(page, score, 1800);
  const firstScore = (await score.innerText()).split("/")[0].trim();
  await caption(page, `Code adds up the points: ${firstScore} out of 100. The pass mark is 70.`, { ms: 2800 });
  // The study list has to be worked through before attempt 2 counts. Off camera.
  cuts.pause(0.3);
  for (const item of await page.locator('[data-testid^="study-item-"]').all()) await item.click();
  if (await page.getByTestId("mark-reviewed").isVisible()) await page.getByTestId("mark-reviewed").click();
  await page.getByTestId("skip-wait").click();
  await page.getByTestId("submit-attempt").waitFor();
  const jordan = page.url();
  beat("first grade");

  // 4. Another learner tries to trick the grader
  await page.goto(`/learn/${side.trick}`);
  const flagged = page.getByTestId("flagged");
  await flagged.waitFor();
  await centre(flagged);
  cuts.resume();
  await highlight(page, flagged, 3000);
  await caption(page, "Another learner tells the grader to give full marks. It's flagged, and the guarantee is void.", { ms: 4200 });
  beat("trick flagged");

  // 5. The second fail
  cuts.pause(0.2);
  await page.goto(jordan);
  await page.getByTestId("submit-attempt").waitFor();
  cuts.resume();
  await page.getByTestId("sample-fail2").click();
  await centre(page.getByTestId("submit-attempt"));
  await caption(page, "Back to Jordan: a second honest try, a day later.", { wait: false, ms: 3000 });
  await sleep(1200);
  await page.getByTestId("submit-attempt").click();
  await sleep(400);
  cuts.pause(0.6);
  const waiting = page.getByTestId("refund-waiting");
  await waiting.waitFor({ timeout: 150_000 });
  cuts.resume();
  const secondScore = (await page.getByTestId("score-2").innerText()).split("/")[0].trim();
  await centre(waiting);
  await highlight(page, waiting, 2600);
  await caption(page, `Second fail: ${secondScore}. A refund is due, and no money moves until a person says yes.`, { ms: 3800 });
  beat("second fail");

  // 6. The course team approves
  await waiting.getByRole("link").click();
  const approve = page.getByTestId("approve-button").first();
  cuts.pause(0.6);
  await approve.waitFor({ timeout: 90_000 });
  cuts.resume();
  await centre(approve);
  await highlight(page, page.getByTestId("approval-reasons").first(), 2600);
  await caption(page, "The refund agent checks the policy and proposes the refund. A person on the course team approves.", { ms: 4000 });
  await approve.click();
  cuts.pause(0.8);
  await expect(page.getByText("Refunded", { exact: true }).first()).toBeVisible({ timeout: 90_000 });
  cuts.resume();
  beat("approved");

  // 7. "Refund issued", read back from PayPal, with the webhook line
  await page.getByTestId("learner-link").first().click();
  const issued = page.getByTestId("refund-issued");
  await issued.waitFor();
  const refundStatus = page.getByTestId("refund-status");
  cuts.pause(0.4);
  await expect(refundStatus).toHaveText(/COMPLETED|PENDING/, { timeout: 60_000 });
  await expect(issued).toContainText("Read back from PayPal", { timeout: 30_000 });
  const webhook = page.getByTestId("refund-webhook");
  const webhookShown = await webhook.waitFor({ timeout: sandbox ? 45_000 : 20_000 }).then(
    () => true,
    () => false,
  );
  console.log(`[demo] webhook line ${webhookShown ? "shown" : "not shown (a local sandbox gets no PayPal webhooks)"}`);
  cuts.resume();
  await expect(refundStatus, "a PENDING refund fails the demo: see the README on seller balance").toHaveText("COMPLETED");
  const amount = await page.getByTestId("refund-amount").innerText();
  await centre(issued);
  await highlight(page, issued, 2800);
  await caption(page, webhookShown ? `Refund issued: ${amount} back to Jordan. PayPal's webhook confirms it.` : `Refund issued: ${amount} back to Jordan, read back from PayPal.`, { ms: 3800 });
  beat("refunded");

  // 8. A learner who passes gets a certificate
  cuts.pause(0.2);
  await page.goto(`/learn/${side.pass}`);
  const certificate = page.getByTestId("certificate");
  await certificate.waitFor();
  await centre(certificate);
  cuts.resume();
  await highlight(page, certificate, 2600);
  await caption(page, "A learner who passes gets a certificate, and no refund happens.", { ms: 3200 });
  beat("certificate");

  // 9. The close: what the creator should fix first
  cuts.pause(0.2);
  await page.goto("/cohort");
  const fixFirst = page.getByTestId("cohort-fix-first");
  await fixFirst.waitFor();
  await centre(fixFirst);
  cuts.resume();
  await highlight(page, fixFirst, 3200);
  await caption(page, "And the creator sees what to fix first: the lesson most learners miss. Pass or Refund.", { ms: 4400 });
  beat("end");

  const edited = cuts.editedSeconds;
  console.log(`[demo] edited cut about ${edited}s (limit ${EDITED_LIMIT_SECONDS}s), PayPal window ${paypalWindow ? "spliced in" : "not in this cut"}`);
  expect(edited).toBeLessThan(EDITED_LIMIT_SECONDS);
  fs.mkdirSync("videos", { recursive: true });
  const parts = cuts.finish();
  const video = page.video();
  await page.close();
  await video?.saveAs("videos/demo-pass-or-refund.webm");
  if (popup && paypalWindow) await popup.video()?.saveAs("videos/demo-paypal-window.webm");
  fs.writeFileSync("videos/demo-edit.json", JSON.stringify({ videos: { main: "videos/demo-pass-or-refund.webm", popup: "videos/demo-paypal-window.webm" }, parts }, null, 2));
});
