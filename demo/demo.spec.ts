/**
 * DEMO VIDEO (npm run demo:record, then npm run demo:edit). The story, in order:
 *   0. a title line on who it's for
 *   1. the creator's case on the home page
 *   2. paying in PayPal's own window with the sandbox test card, held 8-10 s with a slow zoom
 *   3. a weak answer in Jordan's own words, graded, with one quote zoomed in to read
 *   4. another learner trying to trick the grader, flagged
 *   5. the second fail
 *   6. the course team's approval card, held 6-8 s on the agent's summary and reasons, then approved
 *   7. "Refund issued", with the refund id, COMPLETED, PayPal's debug_id and the webhook line, held 4-5 s
 *   8. a passing learner's certificate
 *   9. /cohort and its "Fix first" line, as the close
 * The edited cut, PayPal's window included, stays under 2:30. The captions are the voiceover script:
 * videos/demo-voiceover.txt lists each line at its time in the edited cut. The two side learners
 * (4 and 8) are set up first, off camera. The video is 1280x800 and shows only the learner and creator
 * screens: DEMO_CLEAN (on unless DEMO_CLEAN=0) hides the For judges menu, so Jordan types every answer.
 * Local check: mock AI (DEMO_AI_MODE unset), mock or sandbox PayPal. Submission cut: the hosted app with
 * live AI, DEMO_BASE_URL=https://… (nothing is started locally). A local sandbox gets no PayPal webhooks, so beat 7's webhook line only shows on
 * the hosted app or with mock PayPal; the run logs which.
 */
import fs from "node:fs";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { payInPayPalWindow } from "../tests/e2e/paypal-popup";
import { samples } from "../src/lib/course/samples";
import { caption, centre, DemoClock, DemoCuts, highlight, titleCard, zoomOn } from "./captions";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const EDITED_LIMIT_SECONDS = 150;
/** PayPal's window, spliced in from its own recording: the filled card form, held, then the pay click. */
const PAYPAL_CLIP_SECONDS = 9;
const SIZE = { width: 1280, height: 800 };
const WEAK_ANSWER = "Honing sharpens the knife. Her brother is right, she should hone it for longer every Sunday.";
const email = (name: string) => `${name.toLowerCase().replace(/\s+/g, ".")}.${Date.now()}@example.com`;

/** Buys the course on the course page, with the server-side test card on the sandbox. */
async function buyOffCamera(page: Page, name: string, sandbox: boolean) {
  // ?test-card=1 shows the server-side test card button, which only tests and these side learners use.
  await page.goto(sandbox ? "/course?test-card=1" : "/course");
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
  // Not clean: these learners use the judges' prepared answers, and the home page's judge box has the team passcode.
  const context = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [{ origin: new URL(baseURL).origin, localStorage: [{ name: "por_judge", value: "1" }] }] } });
  const page = await context.newPage();
  await page.goto("/");
  const passcode = (await page.getByTestId("team-passcode-shown").innerText()).trim();
  const trick = await buyOffCamera(page, "Sam Ortiz", sandbox);
  await submitPrepared(page, "inject", 1);
  await expect(page.getByTestId("flagged")).toBeVisible();
  const pass = await buyOffCamera(page, "Riley Chen", sandbox);
  await submitPrepared(page, "pass", 1);
  await expect(page.getByTestId("certificate")).toBeVisible();
  await context.close();
  return { trick, pass, passcode };
}

/** Signs the recorded browser in as the course team, off screen. */
async function unlockTeam(page: Page, passcode: string) {
  expect((await page.request.post("/api/team/session", { data: { passcode } })).ok()).toBe(true);
}

/** Types an answer into the final check, as a learner would. */
async function typeAnswer(page: Page, question: string, text: string, delay = 0) {
  const box = page.getByTestId(`answer-${question}`);
  await box.fill("");
  if (delay) await box.pressSequentially(text, { delay });
  else await box.fill(text);
}

test("demo", async ({ page, request, browser, baseURL }) => {
  test.setTimeout(600_000);
  // The main video starts with the page, so the cut's clock starts here too; nothing is kept until the story starts.
  const cuts = new DemoCuts({ paused: true });
  const status = await (await request.get("/api/kit/status")).json();
  const sandbox = status.paypal.mode === "sandbox";
  const side = await sideLearners(browser, baseURL!, sandbox);

  const clock = new DemoClock(420);
  const beat = (label: string) => {
    clock.check(label);
    console.log(`[demo]   edited cut at ${cuts.editedSeconds}s`);
  };
  let popup: Page | undefined;
  /** The captions are the voiceover: each line, at its time in the edited cut. */
  const script: { at: number; text: string }[] = [];
  const say = (on: Page, text: string, opts: { ms?: number; wait?: boolean } = {}) => {
    script.push({ at: cuts.editedSeconds, text });
    return caption(on, text, opts);
  };

  // 1. The creator's case, 8-10 s
  await page.goto("/");
  const headline = page.getByTestId("story-headline");
  await headline.waitFor();
  await unlockTeam(page, side.passcode);
  cuts.resume(); // The side learners above are off camera, and the cut opens on the loaded home page.
  script.push({ at: 0, text: "Pass or Refund. For online course creators who want a refund guarantee their buyers can actually check." });
  await titleCard(page, "Pass or Refund", "For online course creators: a refund guarantee your buyers can check", 3400);
  await highlight(page, headline, 2600);
  await say(page, "Buyers have learned not to trust course guarantees. The terms move, and refunds stall.", { ms: 3400 });
  await highlight(page, page.getByTestId("hero-title"), 2000);
  await say(page, "So here the guarantee is code: fail the graded final check twice, and PayPal refunds you.", { ms: 3600 });
  const numbers = page.getByTestId("creator-numbers");
  await centre(numbers);
  await highlight(page, numbers, 3000);
  await say(page, "The creator sees what it costs per sale, and how accurate the grader was on attempts it had never seen.", { ms: 4200 });
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
      onOpen: async (p) => {
        openedAt = Date.now();
        cuts.pause(0.3); // While PayPal's window is open, its own recording plays instead.
        await p.setViewportSize(SIZE); // fills the frame, like the main video
      },
      onFilled: async (p) => {
        // The window is shown from here: the card form already filled, never PayPal's loading frames.
        await p.locator("#cardNumber").scrollIntoViewIfNeeded().catch(() => undefined);
        marks.push(since());
        await say(p, "Jordan pays in PayPal's own window, with the sandbox test card.", { wait: false, ms: 20_000 });
        await sleep((PAYPAL_CLIP_SECONDS - 0.5) * 1000); // held, zooming slowly toward the pay button
      },
    }).catch(async (e) => {
      console.log(`[demo] PayPal window failed, paying with the server-side test card: ${(e as Error).message.split("\n")[0]}`);
      paypalWindow = false;
      cuts.resume(); // No window to splice in: the fallback purchase stays on camera.
      for (const p of page.context().pages()) if (p !== page) await p.close().catch(() => undefined);
      await page.goto("/course?test-card=1");
      await page.getByTestId("learner-name").filter({ visible: true }).fill("Jordan Lee");
      await page.getByTestId("learner-email").filter({ visible: true }).fill(email("Jordan Lee"));
      await page.getByTestId("sandbox-test-card").click();
      return undefined;
    });
    if (paypalWindow && marks.length === 1) {
      // The main video already stopped when the window opened, so only the filled form and the pay click go in.
      cuts.clips("popup", [{ from: marks[0], to: marks[0] + PAYPAL_CLIP_SECONDS }], { to: 1.35, ax: 0.5, ay: 1 });
    } else {
      paypalWindow = false;
    }
  } else {
    await page.getByTestId("simulate-paypal-approval").click();
    await page.getByTestId("mock-approve").click();
  }
  await page.waitForURL(/\/learn\/en_/, { timeout: 90_000 });
  await page.getByTestId("submit-attempt").waitFor();
  cuts.resume(); // after PayPal's window; a no-op when the main video never stopped
  await say(page, "PayPal captures the $49. The rubric Jordan is graded on is locked to this purchase.", { ms: 3400 });
  beat("bought");

  // 3. A weak answer in Jordan's own words, graded with its quote
  cuts.pause(0.2); // the later answers go in off camera; the first one is typed on camera
  for (const q of ["q2", "q3", "q4"]) await typeAnswer(page, q, samples.fail1[q]);
  const answer = page.getByTestId("answer-q1");
  await centre(answer);
  cuts.resume();
  await say(page, "Jordan takes the final check, in their own words.", { wait: false, ms: 5000 });
  await typeAnswer(page, "q1", WEAK_ANSWER, 18);
  await page.getByTestId("submit-attempt").click();
  await sleep(400);
  cuts.pause(0.8);
  await page.getByTestId("attempt-1").waitFor({ timeout: 150_000 });
  cuts.resume();
  const question = page.getByTestId("question-1-q1");
  await centre(question);
  await highlight(page, question, 1200);
  // One graded line, zoomed in far enough to read its quote.
  const quote = question.locator("blockquote").first();
  await quote.waitFor();
  cuts.zoom(await zoomOn(page, quote, 1.6));
  await say(page, "Claude marks every rubric line, and backs each mark with a quote from Jordan's own answer.", { ms: 4200 });
  cuts.unzoom();
  const score = page.getByTestId("score-1");
  await centre(score);
  await highlight(page, score, 1800);
  const firstScore = (await score.innerText()).split("/")[0].trim();
  await say(page, `Code, not the model, adds up the points: ${firstScore} out of 100, against a pass mark of 70.`, { ms: 3400 });
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
  await say(page, "Another learner tries telling the grader to give full marks. That's flagged, and their guarantee is void.", { ms: 4200 });
  beat("trick flagged");

  // 5. The second fail
  cuts.pause(0.2);
  await page.goto(jordan);
  await page.getByTestId("submit-attempt").waitFor();
  cuts.resume();
  cuts.pause(0.2); // typed off camera
  for (const q of Object.keys(samples.fail2)) await typeAnswer(page, q, samples.fail2[q]);
  await centre(page.getByTestId("submit-attempt"));
  cuts.resume();
  await say(page, "Back to Jordan. A day later, a second honest try.", { wait: false, ms: 3000 });
  await sleep(1200);
  await page.getByTestId("submit-attempt").click();
  await sleep(400);
  cuts.pause(0.6);
  const waiting = page.getByTestId("refund-waiting");
  await waiting.waitFor({ timeout: 150_000 });
  await waiting.getByTestId("refund-note").waitFor({ timeout: 90_000 });
  cuts.resume();
  const secondScore = (await page.getByTestId("score-2").innerText()).split("/")[0].trim();
  await centre(waiting);
  await highlight(page, waiting, 2600);
  await say(page, `${secondScore}, short again. The refund is due, and the refund agent writes Jordan a note on the lines that held them back.`, { ms: 4200 });
  beat("second fail");

  // 6. The course team approves
  await waiting.getByRole("link").click();
  const approve = page.getByTestId("approve-button").first();
  cuts.pause(0.6);
  await approve.waitFor({ timeout: 90_000 });
  cuts.resume();
  // Held 6-8 s: the agent's summary, then its reasons and the approve button.
  const summary = page.getByTestId("agent-summary").first();
  await centre(summary);
  await highlight(page, summary, 3000);
  await say(page, "The refund agent's summary for the team: the scores, and the lines Jordan missed.", { ms: 2900 });
  await highlight(page, page.getByTestId("approval-reasons").first(), 2600);
  await say(page, "Code checked the policy and the amount. Only a person can approve.", { ms: 2500 });
  await highlight(page, approve, 500);
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
  await expect(page.getByTestId("refund-debug-id")).toBeVisible();
  // Held 4-5 s: the refund id, COMPLETED, the debug_id and the webhook line, all in frame.
  await centre(issued);
  await highlight(page, issued, 2400);
  await say(page, `Refund issued: ${amount} back to Jordan. PayPal's refund id, status COMPLETED, and its debug_id for the call.`, { ms: 3400 });
  await say(page, webhookShown ? "Read back from PayPal, and confirmed by PayPal's webhook." : "Read back from PayPal itself.", { ms: 2200 });
  beat("refunded");

  // 8. A learner who passes gets a certificate
  cuts.pause(0.2);
  await page.goto(`/learn/${side.pass}`);
  const certificate = page.getByTestId("certificate");
  await certificate.waitFor();
  await centre(certificate);
  cuts.resume();
  await highlight(page, certificate, 2600);
  await say(page, "A learner who passes gets a certificate, with the same locked rubric on it.", { ms: 3200 });
  beat("certificate");

  // 9. The close: what the creator should fix first
  cuts.pause(0.2);
  await page.goto("/cohort");
  const fixFirst = page.getByTestId("cohort-fix-first");
  await fixFirst.waitFor();
  await centre(fixFirst);
  cuts.resume();
  await highlight(page, fixFirst, 3200);
  await say(page, "And the creator learns which lesson to fix first. Pass or Refund: a guarantee that pays out.", { ms: 4400 });
  beat("end");

  // A cut without PayPal's window (mock PayPal) still has to leave room for it.
  const edited = cuts.editedSeconds + (paypalWindow ? 0 : PAYPAL_CLIP_SECONDS);
  console.log(`[demo] edited cut about ${edited}s (limit ${EDITED_LIMIT_SECONDS}s), PayPal window ${paypalWindow ? "spliced in" : "not in this cut, its time counted"}`);
  expect(edited).toBeLessThan(EDITED_LIMIT_SECONDS);
  fs.mkdirSync("videos", { recursive: true });
  const at = (t: number) => `${Math.floor(t / 60)}:${String(Math.round(t % 60)).padStart(2, "0")}`;
  fs.writeFileSync("videos/demo-voiceover.txt", script.map((line) => `${at(line.at)}  ${line.text}`).join("\n") + "\n");
  const parts = cuts.finish();
  const video = page.video();
  await page.close();
  await video?.saveAs("videos/demo-pass-or-refund.webm");
  if (popup && paypalWindow) await popup.video()?.saveAs("videos/demo-paypal-window.webm");
  fs.writeFileSync("videos/demo-edit.json", JSON.stringify({ size: `${SIZE.width}x${SIZE.height}`, videos: { main: "videos/demo-pass-or-refund.webm", popup: "videos/demo-paypal-window.webm" }, parts }, null, 2));
});
