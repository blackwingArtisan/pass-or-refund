/**
 * DEMO VIDEO (npm run demo:record, then npm run demo:edit). The shot list (round4/r5-fable/V.md, 3.1):
 *   1. flash-forward: Jordan's refund card from shot 12, moved to the front by the edit, slow zoom
 *   2. the home page hero, 8 s or less
 *   3. the course page: the guarantee beside the pay button, the rubric's fingerprint
 *   4. PayPal's own window with the sandbox test card, 5 s
 *   5. paid: PayPal captured it and the rubric is locked
 *   6. Jordan types the final check in their own words
 *   7. graded: one quote zoomed in to read, then the score code added up
 *   8. "Skip the wait (demo)" on screen
 *   9. another learner trying to trick the grader, flagged
 *  10. the second attempt graded, and the refund agent's note
 *  11. the course team's approval card: the agent's summary and reasons, then approved
 *  12. "Refund issued" held 6 s or more, zoomed, then the What PayPal did drawer's debug_id
 *  12b. the receipt terms: /rubric reads PayPal's order back and shows the three-way match
 *  13. a passing learner's certificate
 *  14. /cohort and its "Fix first" line, as the close
 * The edited cut, PayPal's window included, stays under 2:30. Captions are short; the voiceover is
 * separate: videos/voiceover.json is [{ shot, at, text }] with `at` in seconds of the edited video
 * (after demo-edit.json's parts are joined), for round4/scripts/narrate.mjs. Every number in it is
 * read from the screen, and each line fits before the next one at 2.6 words a second (the take
 * fails otherwise). videos/demo-voiceover.txt lists the captions at their times. The two side
 * learners (9 and 13) are set up first, off camera. The video is 1280x800 and shows only the
 * learner and creator screens: DEMO_CLEAN (on unless DEMO_CLEAN=0) hides the For judges menu.
 *
 * Modes: the script reads /api/kit/status and words its captions and voiceover to match, so a
 * replayed grade is never credited to Claude. DEMO_REQUIRE_LIVE=1 fails the run if any recorded
 * screen says "mock" or "simulated". The submission take is the hosted app with live AI:
 * DEMO_BASE_URL=https://… DEMO_REQUIRE_LIVE=1 (nothing is started locally). A local take (mock AI,
 * mock or sandbox PayPal) is for checking the story. A local sandbox gets no PayPal webhooks, so
 * shot 12's webhook line only shows on the hosted app or with mock PayPal; the run logs which.
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
const PAYPAL_CLIP_SECONDS = 5;
/** The flash-forward: shot 12's refund card, recorded there and placed first by the edit. */
const OPEN_SECONDS = 11;
/** How fast the narrator reads: a voiceover line must fit before the next one at this pace. */
const WORDS_PER_SECOND = 2.6;
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
  // The hosted site renders and saves ticks more slowly than a local build, so wait for each step.
  const reviewed = page.getByTestId("mark-reviewed");
  await reviewed.or(page.getByTestId("study-list-reviewed")).first().waitFor({ timeout: 60_000 });
  if (!(await reviewed.isVisible())) return;
  for (const item of await page.locator('[data-testid^="study-item-"]').all()) {
    if (!(await item.isChecked())) await item.click();
    await expect(item).toBeChecked({ timeout: 30_000 });
  }
  await reviewed.click();
  await page.getByTestId("study-list-reviewed").waitFor({ timeout: 30_000 });
}

/** The learners beside Jordan, set up off camera: one who tries to trick the grader, one who passes. */
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

/** Waits until the refund card on this page is settled with PayPal: read back, COMPLETED. */
async function refundSettled(page: Page) {
  const issued = page.getByTestId("refund-issued");
  await issued.waitFor({ timeout: 60_000 });
  await expect(page.getByTestId("refund-status")).toHaveText(/COMPLETED|PENDING/, { timeout: 60_000 });
  await expect(issued).toContainText("Read back from PayPal", { timeout: 30_000 });
  await expect(page.getByTestId("refund-status"), "a PENDING refund fails the demo: see the README on seller balance").toHaveText("COMPLETED");
  return issued;
}

/** Seconds a narrator needs for a line, at WORDS_PER_SECOND, rounded up to a tenth. */
const readSeconds = (text: string) => Math.ceil((text.trim().split(/\s+/).length / WORDS_PER_SECOND) * 10) / 10;

test("demo", async ({ page, request, browser, baseURL }) => {
  test.setTimeout(900_000);
  // The recording's time zero is the page's first painted frame, not the page's creation: paint one
  // now, so the cut's clock and the video start together. Without it the setup below (about 10 s,
  // nothing painted) shifts every cut that far. Nothing is kept until the story starts.
  await page.setContent("<body style='margin:0;background:#18181b'></body>");
  const cuts = new DemoCuts({ paused: true });
  const status = await (await request.get("/api/kit/status")).json();
  const sandbox = status.paypal.mode === "sandbox";
  const aiLive = status.ai.mode === "live";
  console.log(`[demo] PayPal ${status.paypal.mode}, AI ${status.ai.mode}${REQUIRE_LIVE ? ", DEMO_REQUIRE_LIVE on" : ""}`);
  // The grading is only credited to Claude when Claude did it.
  const grader = aiLive ? "Claude" : "The grader";
  // Likewise PayPal: with mock PayPal no money moves, and neither the captions nor the voice say it did.
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
  /** The captions, at their times in the edited cut (after the flash-forward is placed first). */
  const script: { at: number; text: string }[] = [];
  /** The voiceover: one or two lines a shot, `at` in edited seconds. */
  const voiceover: { shot: number; at: number; text: string }[] = [];
  const at = () => Math.round((cuts.editedExact + OPEN_SECONDS) * 10) / 10;
  /**
   * One beat: a short caption on screen and a voiceover line, held long enough for the narrator to
   * read the line (and the caption to be read), never less than `ms`.
   */
  const say = (on: Page, shot: number, captionText: string, vo: string, opts: { ms?: number; wait?: boolean } = {}) => {
    script.push({ at: at(), text: captionText });
    voiceover.push({ shot, at: at(), text: vo });
    const ms = Math.max(opts.ms ?? 0, Math.round((readSeconds(vo) + 0.3) * 1000));
    return caption(on, captionText, { ...opts, ms });
  };

  // 2. The home page hero, 8 s or less
  await page.goto("/");
  await page.getByTestId("hero-title").waitFor();
  const landingFrom = cuts.editedExact;
  cuts.resume();
  await highlight(page, page.getByTestId("hero-title"), 2000);
  await say(page, 2, "Here the guarantee is code: fail the graded final check twice, and PayPal refunds you.", "Pass or Refund makes the guarantee code: fail the final check twice, and get refunded.");
  const landingSeconds = cuts.editedExact - landingFrom;
  await beat("home page");

  // 3. The course page: the guarantee beside the pay button, with the rubric's fingerprint
  cuts.pause(0.1);
  await page.goto("/course");
  await page.getByTestId("guarantee").waitFor();
  await page.getByTestId("learner-name").filter({ visible: true }).fill("Jordan Lee");
  await page.getByTestId("learner-email").filter({ visible: true }).fill(email("Jordan Lee"));
  const guarantee = page.getByTestId("guarantee").filter({ visible: true });
  await centre(guarantee);
  cuts.resume();
  await highlight(page, guarantee, 900);
  await say(page, 3, "The terms sit beside the pay button, with the rubric's version and fingerprint.", "Jordan buys the course. The terms sit beside the pay button, with the rubric's fingerprint.");
  await requireLive(page, "course page");

  // 4. PayPal's own window with the sandbox test card, 5 s
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
        await say(p, 4, "PayPal's own window, sandbox test card.", "Jordan pays in PayPal's own window, with the sandbox test card.", { wait: false, ms: 20_000 });
        await sleep((PAYPAL_CLIP_SECONDS - 0.5) * 1000);
      },
    }).catch(async (e) => {
      console.log(`[demo] PayPal window failed, paying with the server-side test card: ${(e as Error).message.split("\n")[0]}`);
      paypalWindow = false;
      for (const p of page.context().pages()) if (p !== page) await p.close().catch(() => undefined);
      // Shot 4's line was for PayPal's window, which isn't in this cut.
      while (voiceover.at(-1)?.shot === 4) voiceover.pop();
      await page.goto("/course?test-card=1");
      await page.getByTestId("learner-name").filter({ visible: true }).fill("Jordan Lee");
      await page.getByTestId("learner-email").filter({ visible: true }).fill(email("Jordan Lee"));
      cuts.resume(); // No window to splice in: the fallback purchase stays on camera.
      await page.getByTestId("sandbox-test-card").click();
      return undefined;
    });
    if (paypalWindow && marks.length === 1) {
      // The main video already stopped when the window opened, so only the filled form and the pay click go in.
      cuts.clips("popup", [{ from: marks[0], to: marks[0] + PAYPAL_CLIP_SECONDS }], { to: 1.35, ax: 0.5, ay: 1 });
    } else {
      paypalWindow = false;
      while (voiceover.at(-1)?.shot === 4) voiceover.pop();
    }
  } else {
    cuts.pause(0.3);
    await page.getByTestId("simulate-paypal-approval").click();
    await page.getByTestId("mock-approve").click();
  }
  await page.waitForURL(/\/learn\/en_/, { timeout: 90_000 });
  await page.getByTestId("submit-attempt").waitFor();
  const jordan = page.url();
  const enrollmentId = jordan.match(/\/learn\/([^/?#]+)/)![1];

  // 5. Paid: the capture and the rubric lock, at the top of Jordan's page
  const receipt = page.getByTestId("receipt");
  await receipt.waitFor();
  const paid = /\$[\d,]+(\.\d\d)?/.exec(await receipt.innerText())?.[0] ?? "the price";
  await page.evaluate(() => window.scrollTo(0, 0));
  cuts.resume(); // after PayPal's window
  await highlight(page, receipt, 1200);
  await say(page, 5, `${sandbox ? "PayPal captures" : "Paid:"} ${paid}. The rubric Jordan is graded on is locked to this purchase.`, `${sandbox ? "PayPal captures" : "The stand-in takes"} ${paid}, and the rubric is locked to this purchase.`);
  await beat("bought");

  // 6. Jordan types the final check
  for (const q of ["q2", "q3", "q4"]) await typeAnswer(page, q, samples.fail1[q]);
  await centre(page.getByTestId("answer-q1"));
  const typedFrom = Date.now();
  const typing = "Jordan answers the final check in their own words.";
  await say(page, 6, "Jordan takes the final check, in their own words.", typing, { wait: false });
  await typeAnswer(page, "q1", WEAK_ANSWER, 18);
  await sleep(Math.max(0, (readSeconds(typing) + 0.3) * 1000 - (Date.now() - typedFrom)));
  await page.getByTestId("submit-attempt").click();
  await sleep(300);
  cuts.pause(0.6);
  await page.getByTestId("attempt-1").waitFor({ timeout: 150_000 });

  // 7. Graded: one quote zoomed in, then the score
  // Live grading may quote nothing on a weak first answer, so show the first question that has a quote.
  const question = page.locator('[data-testid^="question-1-"]').filter({ has: page.locator("blockquote") }).first();
  await question.waitFor({ timeout: 30_000 });
  await centre(question);
  cuts.resume();
  const quote = question.locator("blockquote").first();
  await quote.waitFor({ timeout: 30_000 });
  cuts.zoom(await zoomOn(page, quote, 1.6));
  await say(page, 7, `${grader === "Claude" ? "Claude Sonnet 5.5" : "The grader"} marks each rubric line and quotes Jordan's own words.`, `${grader} marks every rubric line and quotes Jordan's own words.`);
  cuts.unzoom();
  const score = page.getByTestId("score-1");
  await centre(score);
  await highlight(page, score, 900);
  const firstScore = (await score.innerText()).split("/")[0].trim();
  await say(page, 7, `Code adds the points: ${firstScore} of 100, pass mark 70.`, `Code, not the model, adds the points: ${firstScore} out of a hundred, pass mark seventy.`);
  await beat("first grade");

  // 8. "Skip the wait (demo)"
  cuts.pause(0.2);
  await study(page);
  const skip = page.getByTestId("skip-wait");
  await centre(page.getByTestId("attempt-gap"));
  cuts.resume();
  await highlight(page, skip, 900);
  await say(page, 8, "The retake opens 24 hours later, after the study list. Skip the wait (demo) jumps ahead.", "Retakes open a day later, after the study list. For the demo, we skip the wait.");
  await skip.click();
  await page.getByTestId("submit-attempt").waitFor();

  // 9. Another learner tries to trick the grader
  cuts.pause(0.2);
  await page.goto(`/learn/${side.trick}`);
  const flagged = page.getByTestId("flagged");
  await flagged.waitFor();
  await centre(flagged);
  cuts.resume();
  await highlight(page, flagged, 900);
  await say(page, 9, "Another learner tells the grader to give full marks. Flagged. Their guarantee is void.", "Another learner tells the grader to give full marks: flagged, and the guarantee is void.");
  await beat("trick flagged");

  // 10. Back to Jordan: the second attempt, typed off camera, graded on camera
  cuts.pause(0.2);
  await page.goto(jordan);
  await page.getByTestId("submit-attempt").waitFor();
  for (const q of Object.keys(samples.fail2)) await typeAnswer(page, q, samples.fail2[q]);
  await centre(page.getByTestId("submit-attempt"));
  cuts.resume();
  await highlight(page, page.getByTestId("submit-attempt"), 500);
  await page.getByTestId("submit-attempt").click();
  await sleep(300);
  cuts.pause(0.4); // the grading wait
  await page.getByTestId("attempt-2").waitFor({ timeout: 150_000 });
  const waiting = page.getByTestId("refund-waiting");
  await waiting.waitFor({ timeout: 150_000 });
  await waiting.getByTestId("refund-note").waitFor({ timeout: 90_000 });
  const secondScore = (await page.getByTestId("score-2").innerText()).split("/")[0].trim();
  const second = page.getByTestId("attempt-2");
  await centre(second);
  cuts.resume();
  await highlight(page, second, 1200);
  await say(page, 10, `Second honest try, graded ${aiLive ? "live" : "the same way"}: ${secondScore}. Short again.`, `A second honest try: ${secondScore}. Short again, so the refund is due.`);
  await centre(waiting);
  await highlight(page, waiting.getByTestId("refund-note"), 1200);
  await say(page, 10, "The refund agent writes Jordan a note on the lines they missed.", "The refund agent writes Jordan a note on what held them back.");
  await beat("second fail");

  // 11. The course team approves
  cuts.pause(0.3);
  await waiting.getByRole("link").click();
  const approve = page.getByTestId("approve-button").first();
  await approve.waitFor({ timeout: 90_000 });
  const summary = page.getByTestId("agent-summary").first();
  await centre(summary);
  cuts.resume();
  await requireLive(page, "approval card");
  await highlight(page, summary, 1400);
  await say(page, 11, "The course team sees the agent's summary and reasons.", "On the team page, the agent's summary: scores and missed lines.");
  await highlight(page, page.getByTestId("approval-reasons").first(), 1200);
  await say(page, 11, "Code checked the policy and the amount. Only a person can approve.", "Code checked the policy and the amount. Only a person can approve.");
  await highlight(page, approve, 400);
  await approve.click();
  cuts.pause(0.8);
  await expect(page.getByText("Refunded", { exact: true }).first()).toBeVisible({ timeout: 90_000 });
  await beat("approved");

  // 12. "Refund issued", held and zoomed. Its first 11 s are the flash-forward that opens the cut.
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
  if (process.env.DEMO_BASE_URL) expect(webhookShown, "the hosted app receives PayPal's webhooks, and shot 12 says so").toBe(true);
  const amount = await page.getByTestId("refund-amount").innerText();
  await centre(issued);
  const issuedZoom = await zoomOn(page, issued, 1.3);
  // 1. The flash-forward: recorded here, kept out of this spot, and placed first by the edit.
  const openFrom = cuts.clock;
  const opener = `${amount} back to a learner, paid by ${paypal}. Buyers have learned not to trust course guarantees: the terms move and refunds stall.`;
  expect(readSeconds(opener), "shot 1's line fits the flash-forward").toBeLessThanOrEqual(OPEN_SECONDS);
  await caption(page, "For online course creators whose buyers don't trust guarantees.", { ms: OPEN_SECONDS * 1000 + 200 });
  const openTo = openFrom + OPEN_SECONDS;
  cuts.resume();
  cuts.zoom(issuedZoom);
  await highlight(page, page.getByTestId("refund-id"), 1200);
  const noted = await page.getByTestId("refund-paypal-note").isVisible();
  await say(
    page,
    12,
    `Refund issued: ${amount} back to Jordan. PayPal's refund id, status COMPLETED.`,
    `Refund issued: ${amount} back to Jordan. ${sandbox ? "PayPal's" : "The"} refund id, status completed${noted ? ", and PayPal's own note quoting both scores" : ""}.`,
    { ms: 6500 },
  );
  cuts.unzoom();
  await page.getByTestId("paypal-drawer").filter({ visible: true }).locator("summary").click();
  const debugId = page.getByTestId("refund-debug-id");
  await expect(debugId).toBeVisible();
  await centre(debugId);
  await highlight(page, debugId, 600);
  await say(page, 12, `Every ${sandbox ? "PayPal" : "payment"} call is one click away, down to the debug_id.`, webhookShown ? "PayPal's webhook confirmed it. Every call is one click away, down to the debug id." : `Every ${sandbox ? "PayPal" : "payment"} call is one click away, down to the debug id.`);
  await beat("refunded");

  // 12b. The receipt terms: /rubric reads Jordan's PayPal order back and checks all three
  cuts.pause(0.2);
  await page.goto(jordan);
  await page.getByTestId("receipt").getByTestId("check-fingerprint").click();
  await page.waitForURL(/\/rubric\?/);
  const check = page.getByTestId("fingerprint-check");
  await expect(page.getByTestId("paypal-order-terms")).toHaveAttribute("data-status", "matches", { timeout: 30_000 });
  await expect(page.getByTestId("fingerprint-verdict")).toHaveText("Matches");
  expect(await page.getByTestId("paypal-invoice-id").innerText()).toContain(enrollmentId);
  await centre(check);
  cuts.resume();
  await highlight(page, page.getByTestId("paypal-order-terms"), 1400);
  await say(page, 12, `The rubric's fingerprint is on ${sandbox ? "PayPal's" : "the"} order too. Receipt, rubric and ${sandbox ? "PayPal" : "order"}: all match.`, `${sandbox ? "PayPal's order" : "The order"} carries the rubric fingerprint too. Receipt, rubric and ${sandbox ? "PayPal" : "order"} all match.`);
  await beat("receipt terms");

  // 13. A learner who passes gets a certificate
  cuts.pause(0.2);
  await page.goto(`/learn/${side.pass}`);
  const certificate = page.getByTestId("certificate");
  await certificate.waitFor();
  await centre(certificate);
  cuts.resume();
  await highlight(page, certificate, 900);
  await say(page, 13, "A learner who passes gets a certificate with the same locked rubric.", "A learner who passes gets a certificate with the same locked rubric.");
  await beat("certificate");

  // 14. The close: what the creator should fix first
  cuts.pause(0.2);
  await page.goto("/cohort");
  const fixFirst = page.getByTestId("cohort-fix-first");
  await fixFirst.waitFor();
  await centre(fixFirst);
  cuts.resume();
  await highlight(page, fixFirst, 1200);
  await say(page, 14, "And the creator learns which lesson to fix first. Pass or Refund: a guarantee that pays out.", "The creator sees which lesson to fix first. Pass or Refund: a guarantee that pays out.");
  await sleep(400);
  await beat("end");

  // The cut: the flash-forward first, then the story. A cut without PayPal's window (mock PayPal) still leaves room for it.
  const parts = cuts.finish();
  parts.unshift({ src: "main", from: openFrom, to: openTo, zoom: { to: 1.3, ax: issuedZoom.ax, ay: issuedZoom.ay } });
  const total = cuts.editedExact; // the flash-forward is in the parts now
  const edited = Math.round(total + (paypalWindow ? 0 : PAYPAL_CLIP_SECONDS));
  console.log(`[demo] edited cut about ${edited}s (limit ${EDITED_LIMIT_SECONDS}s); home page ${landingSeconds.toFixed(1)}s (limit ${LANDING_LIMIT_SECONDS}s); PayPal window ${paypalWindow ? `spliced in, ${PAYPAL_CLIP_SECONDS}s` : "not in this cut, its time counted"}`);
  expect(edited).toBeLessThan(EDITED_LIMIT_SECONDS);
  expect(landingSeconds).toBeLessThanOrEqual(LANDING_LIMIT_SECONDS);

  // The voiceover: shot 1 at 0, then every line where its shot starts. Each must fit before the next.
  const lines = [{ shot: 1, at: 0, text: opener }, ...voiceover];
  const tight = lines.flatMap((line, i) => {
    const room = (lines[i + 1]?.at ?? total) - line.at;
    return readSeconds(line.text) > room ? [`shot ${line.shot} at ${line.at}s needs ${readSeconds(line.text)}s, has ${room.toFixed(1)}s: "${line.text}"`] : [];
  });
  fs.mkdirSync("videos", { recursive: true });
  fs.writeFileSync("videos/voiceover.json", JSON.stringify(lines, null, 2) + "\n");
  const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.round(t % 60)).padStart(2, "0")}`;
  fs.writeFileSync("videos/demo-voiceover.txt", [{ at: 0, text: "For online course creators whose buyers don't trust guarantees." }, ...script].map((line) => `${mmss(line.at)}  ${line.text}`).join("\n") + "\n");
  expect(tight, "voiceover lines that run into the next one: trim the line, not the shot").toEqual([]);
  const video = page.video();
  await page.close();
  await video?.saveAs("videos/demo-pass-or-refund.webm");
  if (popup && paypalWindow) await popup.video()?.saveAs("videos/demo-paypal-window.webm");
  fs.writeFileSync("videos/demo-edit.json", JSON.stringify({ size: `${SIZE.width}x${SIZE.height}`, videos: { main: "videos/demo-pass-or-refund.webm", popup: "videos/demo-paypal-window.webm" }, parts }, null, 2));
});
