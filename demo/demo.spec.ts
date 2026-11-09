/**
 * DEMO VIDEO (npm run demo:record, then npm run demo:edit). The story, in order:
 *   0. the payoff first: a refund card, with the problem in one line, inside the first 5 s
 *   1. the home page, 8 s or less
 *   2. paying in PayPal's own window with the sandbox test card, 5 s or less
 *   3. a weak answer in Jordan's own words, graded, with one quote zoomed in to read
 *   4. another learner trying to trick the grader, flagged
 *   5. "Skip the wait (demo)" on screen, then the second attempt graded
 *   6. the course team's approval card, held 6-8 s on the agent's summary and reasons, then approved
 *   7. "Refund issued", then the What PayPal did drawer with the refund call's debug_id
 *   8. a passing learner's certificate
 *   9. /cohort and its "Fix first" line, as the close
 * The edited cut, PayPal's window included, stays under 2:30. The captions are the voiceover script:
 * videos/demo-voiceover.txt lists each line at its time in the edited cut. The three side learners
 * (0, 4 and 8) are set up first, off camera. The video is 1280x800 and shows only the learner and
 * creator screens: DEMO_CLEAN (on unless DEMO_CLEAN=0) hides the For judges menu, so Jordan types every answer.
 *
 * Modes: the script reads /api/kit/status and words its captions to match, so a replayed grade is
 * never captioned as Claude's. DEMO_REQUIRE_LIVE=1 fails the run if any recorded screen says "mock"
 * or "simulated". The submission take is the hosted app with live AI:
 * DEMO_BASE_URL=https://… DEMO_REQUIRE_LIVE=1 (nothing is started locally). A local take (mock AI,
 * mock or sandbox PayPal) is for checking the story. A local sandbox gets no PayPal webhooks, so
 * beat 7's webhook line only shows on the hosted app or with mock PayPal; the run logs which.
 */
import fs from "node:fs";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { payInPayPalWindow } from "../tests/e2e/paypal-popup";
import { samples } from "../src/lib/course/samples";
import { caption, centre, DemoClock, DemoCuts, highlight, zoomOn } from "./captions";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const EDITED_LIMIT_SECONDS = 150;
/** The home page's limit in the edited cut. */
const LANDING_LIMIT_SECONDS = 8;
/** PayPal's window, spliced in from its own recording: the filled card form, held, then the pay click. */
const PAYPAL_CLIP_SECONDS = 4.5;
const SIZE = { width: 1280, height: 800 };
const REQUIRE_LIVE = process.env.DEMO_REQUIRE_LIVE === "1";
/** Words that mark a stand-in screen. The submission take must show none of them. */
const NOT_LIVE = /\bmock\b|simulated/i;
const WEAK_ANSWER = "Honing sharpens the knife. Her brother is right, she should hone it for longer every Sunday.";
const email = (name: string) => `${name.toLowerCase().replace(/\s+/g, ".")}.${Date.now()}@example.com`;

/** With DEMO_REQUIRE_LIVE=1, a recorded screen that says mock or simulated stops the take. */
async function requireLive(on: Page, where: string) {
  if (!REQUIRE_LIVE) return;
  const text = await on.locator("body").innerText();
  const hit = NOT_LIVE.exec(text);
  const around = hit ? text.slice(Math.max(0, hit.index - 50), hit.index + 50).replace(/\s+/g, " ") : "";
  expect(hit, `DEMO_REQUIRE_LIVE: "${hit?.[0]}" on screen at ${where}: …${around}…`).toBeNull();
}

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

/** Ticks the study list, so the next attempt counts. */
async function study(page: Page) {
  for (const item of await page.locator('[data-testid^="study-item-"]').all()) await item.click();
  if (await page.getByTestId("mark-reviewed").isVisible()) await page.getByTestId("mark-reviewed").click();
}

/**
 * The learners beside Jordan, set up off camera: one already refunded (the opening shot), one who
 * tries to trick the grader, one who passes.
 */
async function sideLearners(browser: Browser, baseURL: string, sandbox: boolean) {
  // Not clean: these learners use the judges' prepared answers, and the home page's judge box has the team passcode.
  const context = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [{ origin: new URL(baseURL).origin, localStorage: [{ name: "por_judge", value: "1" }] }] } });
  const page = await context.newPage();
  await page.goto("/");
  const passcode = (await page.getByTestId("team-passcode-shown").innerText()).trim();
  expect((await page.request.post("/api/team/session", { data: { passcode } })).ok()).toBe(true);

  const refunded = await buyOffCamera(page, "Casey Morgan", sandbox);
  await submitPrepared(page, "fail1", 1);
  await study(page);
  await page.getByTestId("skip-wait").click();
  await page.getByTestId("submit-attempt").waitFor();
  await submitPrepared(page, "fail2", 2);
  await page.getByTestId("refund-waiting").getByTestId("refund-note").waitFor({ timeout: 90_000 });
  await page.goto("/team");
  const card = page.getByTestId(`enrollment-${refunded}`);
  await card.getByTestId("approve-button").click({ timeout: 90_000 });
  await expect(card.getByText("Refunded", { exact: true })).toBeVisible({ timeout: 90_000 });

  const trick = await buyOffCamera(page, "Sam Ortiz", sandbox);
  await submitPrepared(page, "inject", 1);
  await expect(page.getByTestId("flagged")).toBeVisible();
  const pass = await buyOffCamera(page, "Riley Chen", sandbox);
  await submitPrepared(page, "pass", 1);
  await expect(page.getByTestId("certificate")).toBeVisible();
  await context.close();
  return { refunded, trick, pass, passcode };
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

/** Waits until the refund card on this page is settled with PayPal: read back, COMPLETED. */
async function refundSettled(page: Page) {
  const issued = page.getByTestId("refund-issued");
  await issued.waitFor({ timeout: 60_000 });
  await expect(page.getByTestId("refund-status")).toHaveText(/COMPLETED|PENDING/, { timeout: 60_000 });
  await expect(issued).toContainText("Read back from PayPal", { timeout: 30_000 });
  await expect(page.getByTestId("refund-status"), "a PENDING refund fails the demo: see the README on seller balance").toHaveText("COMPLETED");
  return issued;
}

test("demo", async ({ page, request, browser, baseURL }) => {
  test.setTimeout(900_000);
  // The main video starts with the page, so the cut's clock starts here too; nothing is kept until the story starts.
  const cuts = new DemoCuts({ paused: true });
  const status = await (await request.get("/api/kit/status")).json();
  const sandbox = status.paypal.mode === "sandbox";
  const aiLive = status.ai.mode === "live";
  console.log(`[demo] PayPal ${status.paypal.mode}, AI ${status.ai.mode}${REQUIRE_LIVE ? ", DEMO_REQUIRE_LIVE on" : ""}`);
  // The grading is only captioned as Claude's when Claude did it.
  const grader = aiLive ? "Claude" : "The grader";
  // Likewise PayPal: with mock PayPal no money moves, and the captions don't say it did.
  const paypal = sandbox ? "PayPal" : "the payment stand-in";
  const side = await sideLearners(browser, baseURL!, sandbox);
  await unlockTeam(page, side.passcode);

  const clock = new DemoClock(420);
  const beat = async (label: string) => {
    clock.check(label);
    console.log(`[demo]   edited cut at ${cuts.editedSeconds}s`);
    await requireLive(page, label);
  };
  let popup: Page | undefined;
  /** The captions are the voiceover: each line, at its time in the edited cut. */
  const script: { at: number; text: string }[] = [];
  const say = (on: Page, text: string, opts: { ms?: number; wait?: boolean } = {}) => {
    script.push({ at: cuts.editedSeconds, text });
    return caption(on, text, opts);
  };

  // 0. The payoff first: a refund card, and the problem in one line, inside 5 s
  await page.goto(`/learn/${side.refunded}`);
  const opener = await refundSettled(page);
  await centre(opener);
  await requireLive(page, "opening refund card");
  cuts.resume(); // The side learners above are off camera; the cut opens on this refund card.
  await say(page, `Course refund guarantees rarely pay out. This one did: $49 back through ${paypal}, after two honest fails.`, { ms: 4600 });
  await beat("opening refund");

  // 1. The home page, 8 s or less
  cuts.pause(0.1);
  await page.goto("/");
  await page.getByTestId("hero-title").waitFor();
  const landingFrom = cuts.editedSeconds;
  cuts.resume();
  await highlight(page, page.getByTestId("hero-title"), 400);
  await say(page, "Pass or Refund: the guarantee is code. Fail the graded final check twice, and you get your money back.", { ms: 3300 });
  await centre(page.getByTestId("creator-numbers"));
  await say(page, "The creator sees the cost per sale, and how accurate the grader was on attempts it had never seen.", { ms: 3000 });
  const landingSeconds = cuts.editedSeconds - landingFrom;
  await beat("home page");

  // 2. PayPal's own window with the sandbox test card, 5 s or less of it
  cuts.pause(0.1);
  await page.goto("/course");
  await page.getByTestId("guarantee").waitFor();
  await page.getByTestId("learner-name").filter({ visible: true }).fill("Jordan Lee");
  await page.getByTestId("learner-email").filter({ visible: true }).fill(email("Jordan Lee"));
  const guarantee = page.getByTestId("guarantee").filter({ visible: true });
  await centre(guarantee);
  cuts.resume();
  await highlight(page, guarantee, 600);
  await say(page, "Jordan reads the four-line guarantee and buys the $49 course.", { ms: 2400 });
  await requireLive(page, "course page");
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
        await sleep((PAYPAL_CLIP_SECONDS - 0.4) * 1000);
      },
    }).catch(async (e) => {
      console.log(`[demo] PayPal window failed, paying with the server-side test card: ${(e as Error).message.split("\n")[0]}`);
      paypalWindow = false;
      for (const p of page.context().pages()) if (p !== page) await p.close().catch(() => undefined);
      await page.goto("/course?test-card=1");
      await page.getByTestId("learner-name").filter({ visible: true }).fill("Jordan Lee");
      await page.getByTestId("learner-email").filter({ visible: true }).fill(email("Jordan Lee"));
      cuts.resume(); // No window to splice in: the fallback purchase stays on camera.
      await page.getByTestId("sandbox-test-card").click();
      return undefined;
    });
    if (paypalWindow && marks.length === 1) {
      // The main video already stopped when the window opened, so only the filled form and the pay click go in.
      cuts.clips("popup", [{ from: marks[0], to: marks[0] + PAYPAL_CLIP_SECONDS }], { to: 1.25, ax: 0.5, ay: 1 });
    } else {
      paypalWindow = false;
    }
  } else {
    cuts.pause(0.3);
    await page.getByTestId("simulate-paypal-approval").click();
    await page.getByTestId("mock-approve").click();
  }
  await page.waitForURL(/\/learn\/en_/, { timeout: 90_000 });
  await page.getByTestId("submit-attempt").waitFor();
  const jordan = page.url();

  // 3. A weak answer in Jordan's own words, graded with its quote
  for (const q of ["q2", "q3", "q4"]) await typeAnswer(page, q, samples.fail1[q]);
  await centre(page.getByTestId("answer-q1"));
  cuts.resume(); // after PayPal's window
  await say(page, `${sandbox ? "PayPal captured the $49" : "Paid"}, and the rubric is locked to the purchase. Jordan answers in their own words.`, { wait: false, ms: 5000 });
  await typeAnswer(page, "q1", WEAK_ANSWER, 18);
  await beat("bought");
  await page.getByTestId("submit-attempt").click();
  await sleep(400);
  cuts.pause(0.8);
  await page.getByTestId("attempt-1").waitFor({ timeout: 150_000 });
  const question = page.getByTestId("question-1-q1");
  await centre(question);
  cuts.resume();
  const quote = question.locator("blockquote").first();
  await quote.waitFor();
  cuts.zoom(await zoomOn(page, quote, 1.6));
  await say(page, `${grader} marks every rubric line, and backs each mark with a quote from Jordan's own answer.`, { ms: 4000 });
  cuts.unzoom();
  const score = page.getByTestId("score-1");
  await centre(score);
  await highlight(page, score, 900);
  const firstScore = (await score.innerText()).split("/")[0].trim();
  await say(page, `Code, not the model, adds up the points: ${firstScore} out of 100. The pass mark is 70.`, { ms: 3200 });
  await beat("first grade");

  // 4. Another learner tries to trick the grader
  cuts.pause(0.2);
  await page.goto(`/learn/${side.trick}`);
  const flagged = page.getByTestId("flagged");
  await flagged.waitFor();
  await centre(flagged);
  cuts.resume();
  await highlight(page, flagged, 800);
  await say(page, "Another learner tells the grader to give full marks. That's flagged, and their guarantee is void.", { ms: 3800 });
  await beat("trick flagged");

  // 5. "Skip the wait (demo)", then the second attempt graded
  cuts.pause(0.2);
  await page.goto(jordan);
  await study(page);
  const skip = page.getByTestId("skip-wait");
  await centre(page.getByTestId("attempt-gap"));
  cuts.resume();
  await highlight(page, skip, 900);
  await say(page, "Attempts are 24 hours apart, to study the missed lines. For this demo, we skip the wait.", { ms: 3400 });
  await skip.click();
  await page.getByTestId("submit-attempt").waitFor();
  cuts.pause(0.2); // typed off camera
  for (const q of Object.keys(samples.fail2)) await typeAnswer(page, q, samples.fail2[q]);
  await page.getByTestId("submit-attempt").click();
  await page.getByTestId("attempt-2").waitFor({ timeout: 150_000 });
  const waiting = page.getByTestId("refund-waiting");
  await waiting.waitFor({ timeout: 150_000 });
  await waiting.getByTestId("refund-note").waitFor({ timeout: 90_000 });
  const secondScore = (await page.getByTestId("score-2").innerText()).split("/")[0].trim();
  const second = page.getByTestId("attempt-2");
  await centre(second);
  cuts.resume();
  await highlight(page, second, 1200);
  await say(page, `The second attempt, graded the same way: ${secondScore}. Short again, so the refund is due.`, { ms: 3200 });
  await centre(waiting);
  await highlight(page, waiting, 900);
  await say(page, "The refund agent writes Jordan a note on the lines that held them back.", { ms: 3000 });
  await beat("second fail");

  // 6. The course team approves
  cuts.pause(0.3);
  await waiting.getByRole("link").click();
  const approve = page.getByTestId("approve-button").first();
  await approve.waitFor({ timeout: 90_000 });
  // Held 6-8 s: the agent's summary, then its reasons and the approve button.
  const summary = page.getByTestId("agent-summary").first();
  await centre(summary);
  cuts.resume();
  await requireLive(page, "approval card");
  await highlight(page, summary, 1400);
  await say(page, "The refund agent's summary for the course team: the scores, and the lines Jordan missed.", { ms: 3000 });
  await highlight(page, page.getByTestId("approval-reasons").first(), 1200);
  await say(page, "Code checked the policy and the amount. Only a person can approve.", { ms: 2600 });
  await highlight(page, approve, 400);
  await approve.click();
  cuts.pause(0.8);
  await expect(page.getByText("Refunded", { exact: true }).first()).toBeVisible({ timeout: 90_000 });
  await beat("approved");

  // 7. "Refund issued", and the What PayPal did drawer with the refund call's debug_id
  await page.getByTestId("learner-link").first().click();
  const issued = await refundSettled(page);
  const webhookShown = await page
    .getByTestId("refund-webhook")
    .waitFor({ timeout: sandbox ? 45_000 : 20_000 })
    .then(
      () => true,
      () => false,
    );
  console.log(`[demo] webhook line ${webhookShown ? "shown" : "not shown (a local sandbox gets no PayPal webhooks)"}`);
  const amount = await page.getByTestId("refund-amount").innerText();
  await centre(issued);
  cuts.resume();
  await highlight(page, issued, 1200);
  await say(page, webhookShown ? `Refund issued: ${amount} back to Jordan, read back from PayPal and confirmed by its webhook.` : `Refund issued: ${amount} back to Jordan, status COMPLETED, read back from ${paypal}.`, { ms: 3400 });
  await page.getByTestId("paypal-drawer").filter({ visible: true }).locator("summary").click();
  const debugId = page.getByTestId("refund-debug-id");
  await expect(debugId).toBeVisible();
  await centre(debugId);
  await highlight(page, debugId, 600);
  await say(page, `Every ${sandbox ? "PayPal" : "payment"} call is one click away, down to the refund call's debug_id.`, { ms: 2800 });
  await beat("refunded");

  // 7b. Jordan's grade receipt, checked on the public rubric page
  cuts.pause(0.2);
  const learnerUrl = page.url();
  const enrollmentId = learnerUrl.match(/\/learn\/([^/?#]+)/)![1];
  await page.goto(`/learn/${enrollmentId}/receipt`);
  const receiptCard = page.getByTestId("receipt-refund-id");
  await receiptCard.waitFor();
  cuts.resume();
  await highlight(page, receiptCard, 800);
  await say(page, "Jordan can download a grade receipt: the locked fingerprint, every line's verdict, a hash of each attempt and the refund id.", { ms: 3400 });
  cuts.pause(0.2);
  const receiptJson = await (await page.request.get(`/api/enrollments/${enrollmentId}/receipt`)).text();
  await page.goto("/rubric#receipt-check");
  await page.getByTestId("receipt-text").fill(receiptJson);
  await page.getByTestId("receipt-check-submit").click();
  const receiptCheck = page.getByTestId("receipt-check");
  await expect(receiptCheck).toHaveAttribute("data-status", "matches");
  await centre(receiptCheck);
  cuts.resume();
  await highlight(page, receiptCheck, 800);
  await say(page, "Anyone can check it on the public rubric page. Edit one verdict and it says changed.", { ms: 2800 });
  await beat("receipt checked");

  // 8. A learner who passes gets a certificate
  cuts.pause(0.2);
  await page.goto(`/learn/${side.pass}`);
  const certificate = page.getByTestId("certificate");
  await certificate.waitFor();
  await centre(certificate);
  cuts.resume();
  await highlight(page, certificate, 800);
  await say(page, "A learner who passes gets a certificate, with the same locked rubric on it.", { ms: 3000 });
  await beat("certificate");

  // 9. The close: what the creator should fix first
  cuts.pause(0.2);
  await page.goto("/cohort");
  const fixFirst = page.getByTestId("cohort-fix-first");
  await fixFirst.waitFor();
  await centre(fixFirst);
  cuts.resume();
  await highlight(page, fixFirst, 1000);
  await say(page, "And the creator learns which lesson to fix first. Pass or Refund: a guarantee that pays out.", { ms: 4200 });
  await beat("end");

  // A cut without PayPal's window (mock PayPal) still has to leave room for it.
  const edited = cuts.editedSeconds + (paypalWindow ? 0 : PAYPAL_CLIP_SECONDS);
  console.log(`[demo] edited cut about ${edited}s (limit ${EDITED_LIMIT_SECONDS}s); home page ${landingSeconds}s (limit ${LANDING_LIMIT_SECONDS}s); PayPal window ${paypalWindow ? `spliced in, ${PAYPAL_CLIP_SECONDS}s` : "not in this cut, its time counted"}`);
  expect(edited).toBeLessThan(EDITED_LIMIT_SECONDS);
  expect(landingSeconds).toBeLessThanOrEqual(LANDING_LIMIT_SECONDS);
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
