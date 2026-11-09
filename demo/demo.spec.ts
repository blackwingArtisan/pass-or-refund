/**
 * DEMO VIDEO (npm run demo:record, then npm run demo:edit). Cut 8: one money spine, about six ideas,
 * 90 to 120 s edited.
 *   1. who it's for and the promise, 3 to 5 s, over the product from the first frame: "For course
 *      creators and learners: pass, or get your money back." on the course page
 *   3. the course page: the guarantee is code, its terms beside the pay button
 *   4. PayPal's own window: its cart held on the item line with the rubric fingerprint (the first time
 *      the fingerprint is shown), then the sandbox test card and the pay click
 *   5. paid: PayPal captured it, the rubric locked to the order
 *   6. try 1: one answer typed, zoomed, then a short caption for the grading, the wait cut
 *   7. graded: one rubric line, its verdict beside Jordan's quoted words, and the score code added
 *   7b. Jordan contests one line, once; on /team the second reader quotes both sides and recommends,
 *      and a person rules (about 10 s)
 *   8. off camera: the study list and the skipped 24-hour wait (the try-two caption says so)
 *  10. try 2: short again, so the refund is due, and the refund agent's note to Jordan
 *  11. the course team: only a person approves. The click is held on camera until PayPal reports
 *      the refund COMPLETED
 *  12. Jordan's refund card: the amount back, and PayPal's own note on the refund quoting both scores
 *  12c. /verify: the order read back from PayPal carries the same fingerprint (the second time), then
 *      one word of a copy of the rubric changed, and it no longer matches
 *  14. the close: the creator's earnings card on /cohort, every figure read from PayPal.
 *      Off camera, before the story, a second learner (Sam) buys in the sandbox and passes, so the card
 *      shows a sale the creator keeps beside Jordan's refund, not a $0 net.
 *  15. an end card, held for its line: the address, and what runs where
 * The five money beats (PayPal's cart, the score, the approval, the refund note, /verify) are zoomed
 * so scores, amounts and PayPal's ids read at 1080p; every zoom is the deepest that keeps its target
 * and the whole caption in frame (the take fails if a caption would be cropped).
 * Every beat also checks the screen never says the refund ran without a person's approval.
 * Left out on purpose: the gaming rules, the injection flag, /rubric's ticks, /creator and the debug_id
 * drawer. They are all still in the app.
 *
 * The voiceover is separate from the captions: videos/voiceover.json is [{ shot, at, text }] with
 * `at` in seconds of the edited video (after demo-edit.json's parts are joined), for
 * round4/scripts/narrate.mjs. It starts at 0 s. Every number in it is read from the screen, each line
 * fits before the next one at 15 characters (and 2.6 words) a second, and every narrated beat is on
 * screen 4 s or more (the take fails otherwise: trim the line, not the shot).
 * videos/demo-voiceover.txt lists the captions at their times. The take is 1280x800, scaled to 1920x1200 by the edit before a zoom crops it, and shows only
 * the learner and creator screens: DEMO_CLEAN (on unless DEMO_CLEAN=0) hides the For judges menu.
 *
 * Modes: the script reads /api/kit/status and words its captions and voiceover to match, so a
 * replayed grade is never credited to Claude. DEMO_REQUIRE_LIVE=1 fails the run if any recorded
 * screen says "mock" or "simulated". The submission take is the hosted app with live AI:
 * DEMO_BASE_URL=https://… DEMO_REQUIRE_LIVE=1 (nothing is started locally). A local take (mock AI,
 * mock or sandbox PayPal) is for checking the story. A local sandbox gets no PayPal webhooks; the
 * hosted take must show the webhook line on Jordan's refund card, and the run checks it.
 */
import fs from "node:fs";
import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";
import { payInPayPalWindow } from "../tests/e2e/paypal-popup";
import { samples } from "../src/lib/course/samples";
import { BAND_PX, caption, captionWidth, centre, DemoClock, DemoCuts, highlight, titleCard, type Zoom } from "./captions";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** The edited cut's target, and the hard limit. */
const EDITED_MIN_SECONDS = 90;
const EDITED_MAX_SECONDS = 120;
const EDITED_LIMIT_SECONDS = 150;
/** The opener: who it's for and the promise, over the product, 3 to 5 s. */
const OPENER_MIN_SECONDS = 3;
const OPENER_MAX_SECONDS = 5.2;
const AUDIENCE = "For course creators and learners: pass, or get your money back.";
/** PayPal's window, spliced in from its own recording: its cart open on the item line, held... */
const CART_SECONDS = 4;
/** ...then the filled card form and the pay click. */
const FORM_SECONDS = 2.5;
const PAYPAL_CLIP_SECONDS = CART_SECONDS + FORM_SECONDS;
/** The end card. */
const END_CARD_SECONDS = 4.2;
/** How fast the narrator reads: a voiceover line must fit before the next one at this pace. */
const WORDS_PER_SECOND = 2.6;
const CHARS_PER_SECOND = 15;
/** Every narrated beat stays on screen at least this long. */
const MIN_BEAT_SECONDS = 4;
const SIZE = { width: 1280, height: 800 };
/** The edit's working size: the 1280x800 take is scaled up to it before a zoom crops it, and the cut is delivered at it (YouTube's 1080p class). */
const VIDEO_SIZE = { width: 1920, height: 1200 };
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

/** A screen that says the refund ran without a person's approval: never true here, so it stops the take. */
const DENIES_APPROVAL = /without (pausing|a person's approval|approval|human approval)|skipped (the )?approval/i;

async function noApprovalDenied(on: Page, where: string) {
  const text = await on.locator("body").innerText();
  const hit = DENIES_APPROVAL.exec(text);
  const around = hit ? text.slice(Math.max(0, hit.index - 60), hit.index + 60).replace(/\s+/g, " ") : "";
  expect(hit, `on screen at ${where}, contradicting the approval: …${around}…`).toBeNull();
}

/** A Failed tool step on screen (the hosted take's ZodError) makes a bad take: fail it, so it's re-recorded. */
async function noFailedToolStep(on: Page, where: string) {
  const failed = on.locator('[data-testid="timeline-step"][data-kind="tool"][data-status="failed"]');
  const count = await failed.count();
  const what = count ? `${await failed.first().getByTestId("step-title").innerText()}: ${await failed.first().getByTestId("step-error-line").innerText().catch(() => "")}` : "";
  expect(count, `a Failed tool step on screen at ${where}: ${what}`).toBe(0);
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

/**
 * Set up off camera, in a separate, non-clean browser: the course team's passcode, read off the home
 * page's judge box, and a second learner who buys the course in PayPal's sandbox and passes the final
 * check, so the closing earnings card shows a sale the creator keeps beside Jordan's refund. Both
 * sales are real orders, read back from PayPal on the card.
 */
async function offCamera(browser: Browser, baseURL: string, sandbox: boolean) {
  // Not clean: the judge box has the passcode, and the prepared answers sit behind the judges' switch.
  const context = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [{ origin: new URL(baseURL).origin, localStorage: [{ name: "por_judge", value: "1" }] }] } });
  const page = await context.newPage();
  await page.goto("/");
  const passcode = (await page.getByTestId("team-passcode-shown").innerText()).trim();
  // ?test-card=1 shows the server-side test card button, which only tests and this side learner use.
  await page.goto(sandbox ? "/course?test-card=1" : "/course");
  await page.getByTestId("learner-name").filter({ visible: true }).fill("Sam Ortiz");
  await page.getByTestId("learner-email").filter({ visible: true }).fill(email("Sam Ortiz"));
  if (sandbox) await page.getByTestId("sandbox-test-card").click();
  else {
    await page.getByTestId("simulate-paypal-approval").click();
    await page.getByTestId("mock-approve").click();
  }
  await page.waitForURL(/\/learn\/en_/, { timeout: 90_000 });
  const passer = page.url().split("/learn/")[1];
  await page.getByTestId("sample-pass").click();
  await page.getByTestId("submit-attempt").click();
  await page.getByTestId("attempt-1").waitFor({ timeout: 150_000 });
  await expect(page.getByTestId("certificate"), "the second learner passes the final check and keeps the course").toBeVisible({ timeout: 30_000 });
  const { payment } = (await (await page.request.get(`/api/enrollments/${passer}`)).json()) as { payment: { orderId: string } };
  await context.close();
  return { passcode, passerOrder: payment.orderId };
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

/** Seconds a narrator needs for a line, at WORDS_PER_SECOND or CHARS_PER_SECOND, whichever is slower, rounded up to a tenth. */
const readSeconds = (text: string) => Math.ceil(Math.max(text.trim().split(/\s+/).length / WORDS_PER_SECOND, text.trim().length / CHARS_PER_SECOND) * 10) / 10;

type Box = { x: number; y: number; width: number; height: number };
type View = { width: number; height: number };

/** The part of the frame a zoom shows, in page pixels. */
const shown = (view: View, z: Zoom) => {
  const w = view.width / z.to;
  const h = view.height / z.to;
  return { left: z.ax * (view.width - w), top: z.ay * (view.height - h), w, h };
};

/** True when the caption band (at the bottom, or the top) and its centred text, `capW` wide, are whole inside the zoom. */
function captionKept(view: View, z: Zoom, capW: number, top = false): boolean {
  const s = shown(view, z);
  const capLeft = (view.width - capW) / 2;
  const bandIn = top ? s.top <= 0.5 : s.top + s.h >= view.height - 0.5;
  return bandIn && capLeft >= s.left - 1 && capLeft + capW <= s.left + s.w + 1;
}

/**
 * The deepest zoom from `to` down to 1.15 that keeps `box` whole, clear of the caption band, and the
 * caption whole; undefined if none does. The money beats use it, so scores, amounts and PayPal's ids
 * read at YouTube size while the caption stays readable.
 */
function zoomKeeping(view: View, box: Box, capW: number, to: number, top = false): Zoom | undefined {
  for (let z = to; z >= 1.15 - 1e-9; z -= 0.05) {
    const w = view.width / z;
    const h = view.height / z;
    const ay = top ? 0 : 1;
    const y0 = ay * (view.height - h);
    const clearTop = top ? BAND_PX : y0;
    const clearBottom = top ? h : view.height - BAND_PX;
    if (box.y < clearTop + 4 || box.y + box.height > clearBottom - 4) continue;
    const capLeft = (view.width - capW) / 2;
    const lo = Math.max(0, Math.max(box.x + box.width, capLeft + capW) + 8 - w);
    const hi = Math.min(view.width - w, Math.min(box.x, capLeft) - 8);
    if (lo > hi) continue;
    const left = Math.min(hi, Math.max(lo, box.x + box.width / 2 - w / 2));
    return { to: Math.round(z * 100) / 100, ax: view.width > w ? left / (view.width - w) : 0.5, ay };
  }
  return undefined;
}

/**
 * A zoom on `target` with `captionText` under it: the target is scrolled to sit just above the
 * caption band, and the zoom is as deep as `to` allows with both whole. Logged when none fits.
 */
async function zoomAbove(page: Page, target: Locator, to: number, captionText: string): Promise<Zoom | undefined> {
  const view = page.viewportSize() ?? SIZE;
  const firstRow = view.height - view.height / to;
  await target.evaluate((el, top) => window.scrollBy(0, el.getBoundingClientRect().top - top - 12), firstRow);
  const box = await target.boundingBox();
  const zoom = box ? zoomKeeping(view, box, await captionWidth(page, captionText), to) : undefined;
  if (!zoom) console.log(`[demo] no zoom keeps both the target and "${captionText}"`);
  return zoom;
}

test("demo", async ({ page, request, browser, baseURL }) => {
  test.setTimeout(1_200_000);
  // The recording's time zero is the page's first painted frame, not the page's creation: paint one
  // now, so the cut's clock and the video start together. Nothing is kept until the story starts.
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
  const paypals = sandbox ? "PayPal's" : "the stand-in's";
  const side = await offCamera(browser, baseURL!, sandbox);
  await unlockTeam(page, side.passcode);

  const clock = new DemoClock(600);
  const beat = async (label: string) => {
    clock.check(label);
    console.log(`[demo]   edited cut at ${cuts.editedSeconds}s`);
    await requireLive(page, label);
    await noApprovalDenied(page, label);
    await noFailedToolStep(page, label);
  };
  let popup: Page | undefined;
  /** The captions, at their times in the edited cut. */
  const script: { at: number; text: string }[] = [];
  /** The voiceover: one or two lines a shot, `at` in edited seconds. */
  const voiceover: { shot: number; at: number; text: string }[] = [];
  const at = () => Math.round(cuts.editedExact * 10) / 10;
  /** The zoom the edit is in now, so every caption said under it is checked to be whole. */
  let zoomNow: Zoom | undefined;
  const zoomTo = (z: Zoom | undefined) => {
    zoomNow = z;
    cuts.zoom(z);
  };
  const unzoom = () => zoomTo(undefined);
  /**
   * One beat: a short caption on screen and a voiceover line, held long enough for the narrator to
   * read the line (and the caption to be read), never less than `ms` or MIN_BEAT_SECONDS.
   */
  const say = async (on: Page, shot: number, captionText: string, vo: string, opts: { ms?: number; wait?: boolean } = {}) => {
    if (zoomNow && on === page) expect(captionKept(SIZE, zoomNow, await captionWidth(on, captionText)), `the zoom crops the caption "${captionText}"`).toBe(true);
    script.push({ at: at(), text: captionText });
    voiceover.push({ shot, at: at(), text: vo });
    const ms = Math.max(opts.ms ?? 0, Math.round((readSeconds(vo) + 0.3) * 1000), MIN_BEAT_SECONDS * 1000);
    return caption(on, captionText, { ...opts, ms });
  };

  // 1. Who it's for and the promise, over the product from the first frame: the course page and its pay button
  await page.goto("/course");
  await page.getByTestId("guarantee").waitFor();
  await page.getByTestId("learner-name").filter({ visible: true }).fill("Jordan Lee");
  await page.getByTestId("learner-email").filter({ visible: true }).fill(email("Jordan Lee"));
  await page.evaluate(() => window.scrollTo(0, 0));
  const openerFrom = cuts.editedExact;
  cuts.resume();
  await say(page, 1, AUDIENCE, AUDIENCE);
  const openerSeconds = cuts.editedExact - openerFrom;
  await beat("opener");

  // 3. The course page: the guarantee in code, its terms beside the pay button
  const guarantee = page.getByTestId("guarantee").filter({ visible: true });
  await centre(guarantee);
  await highlight(page, guarantee, 900);
  await say(page, 3, "Fail the final check twice, honestly, and get refunded.", "Pass or Refund makes the guarantee code, its terms beside the pay button.");
  await requireLive(page, "course page");

  // 4. PayPal's own window: the cart's item line with the rubric fingerprint, then the test card
  let paypalWindow = sandbox;
  let cartFingerprint: string | undefined;
  let cartZoom: Zoom | undefined;
  if (sandbox) {
    let openedAt = 0;
    const marks: number[] = [];
    const since = () => (Date.now() - openedAt) / 1000;
    popup = await payInPayPalWindow(page, {
      onOpen: async (p) => {
        openedAt = Date.now();
        cuts.pause(0.3); // While PayPal's window is open, its own recording plays instead.
        await p.setViewportSize(SIZE);
      },
      onFilled: async (p) => {
        // Shown from here, never PayPal's loading frames: first its cart, open on the item line that
        // carries the rubric's fingerprint (read off PayPal's own screen)...
        await p.evaluate(() => window.scrollTo(0, 0));
        await p.getByTestId("cart-button").click();
        const item = p.getByText(/rubric v\d+ · [0-9a-f]{12}/).first();
        await item.waitFor({ timeout: 15_000 });
        cartFingerprint = /[0-9a-f]{12}/.exec(await item.innerText())![0];
        // Zoomed so the fingerprint reads at YouTube size: the caption goes above or below, wherever the item line leaves room.
        const cartCaption = `PayPal's cart: rubric fingerprint ${cartFingerprint}.`;
        const itemBox = await item.boundingBox();
        const capW = await captionWidth(p, cartCaption);
        const below = itemBox ? zoomKeeping(SIZE, itemBox, capW, 1.8) : undefined;
        const above = itemBox && !below ? zoomKeeping(SIZE, itemBox, capW, 1.8, true) : undefined;
        cartZoom = below ?? above;
        console.log(`[demo] PayPal's cart item line at y ${Math.round(itemBox?.y ?? -1)}: zoom ${cartZoom ? `${cartZoom.to}x, caption ${above ? "on top" : "below"}` : "none"}`);
        marks.push(since());
        script.push({ at: at(), text: cartCaption });
        voiceover.push({ shot: 4, at: at(), text: "Jordan pays in PayPal's own window. The cart carries the rubric's fingerprint." });
        await caption(p, cartCaption, { wait: false, ms: 20_000, top: !!above });
        await sleep(CART_SECONDS * 1000);
        // ...then the sandbox test card, already filled, and the pay click.
        await p.keyboard.press("Escape");
        await expect(item).toBeHidden();
        await p.locator("#cardNumber").scrollIntoViewIfNeeded().catch(() => undefined);
        marks.push(since());
        await caption(p, "Paid with PayPal's sandbox test card.", { wait: false, ms: 20_000 });
        await sleep((FORM_SECONDS - 0.4) * 1000);
      },
    }).catch(async (e) => {
      console.log(`[demo] PayPal window failed, paying with the server-side test card: ${(e as Error).message.split("\n")[0]}`);
      paypalWindow = false;
      for (const p of page.context().pages()) if (p !== page) await p.close().catch(() => undefined);
      while (voiceover.at(-1)?.shot === 4) voiceover.pop();
      while (script.length && script.at(-1)!.text.startsWith("PayPal's cart")) script.pop();
      await page.goto("/course?test-card=1");
      await page.getByTestId("learner-name").filter({ visible: true }).fill("Jordan Lee");
      await page.getByTestId("learner-email").filter({ visible: true }).fill(email("Jordan Lee"));
      cuts.resume(); // No window to splice in: the fallback purchase stays on camera.
      await page.getByTestId("sandbox-test-card").click();
      return undefined;
    });
    if (paypalWindow && marks.length === 2) {
      // The main video stopped when the window opened, so only the cart, then the filled form and the pay click, go in.
      cuts.clips("popup", [{ from: marks[0], to: marks[0] + CART_SECONDS }], cartZoom);
      cuts.clips("popup", [{ from: marks[1], to: marks[1] + FORM_SECONDS }], { to: 1.35, ax: 0.5, ay: 1 });
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

  // 5. Paid: the capture, and the rubric locked to the order
  const receipt = page.getByTestId("receipt");
  await receipt.waitFor();
  const paid = /\$[\d,]+(\.\d\d)?/.exec(await receipt.innerText())?.[0] ?? "the price";
  await page.evaluate(() => window.scrollTo(0, 0));
  cuts.resume(); // after PayPal's window
  await highlight(page, receipt, 700);
  await say(page, 5, `${sandbox ? "PayPal captured" : "Paid:"} ${paid}. The rubric is locked to the order.`, `${sandbox ? "PayPal captures" : "The stand-in takes"} ${paid}, and that rubric is locked to the order.`, { ms: 5500 });
  await beat("bought");

  // 6. Try 1: Jordan types one answer, zoomed; the other three are typed off camera
  cuts.pause(0.1);
  for (const q of ["q2", "q3", "q4"]) await typeAnswer(page, q, samples.fail1[q]);
  const answerBox = page.getByTestId("answer-q1");
  await centre(answerBox);
  const typingCaption = "Jordan answers the final check in their own words.";
  const typingZoom = await zoomAbove(page, answerBox, 1.4, typingCaption);
  cuts.resume();
  zoomTo(typingZoom);
  const typedFrom = Date.now();
  const typing = `Try one: Jordan answers in their own words, and ${aiLive ? "Claude grades it live" : "it's graded"}.`;
  await say(page, 6, typingCaption, typing, { wait: false });
  await typeAnswer(page, "q1", WEAK_ANSWER, 14);
  // The line runs on over the grading caption (1.5 s) and the 0.2 s kept after it.
  await sleep(Math.max(0, (Math.max(readSeconds(typing), MIN_BEAT_SECONDS) + 0.2 - 1.7) * 1000 - (Date.now() - typedFrom)));
  unzoom();
  await page.getByTestId("submit-attempt").click();
  // The grading, captioned: the one place the video says what runs live.
  const live = aiLive && sandbox ? "Graded live by Claude Sonnet 5.5, on PayPal's sandbox." : aiLive ? "Graded live by Claude Sonnet 5.5." : sandbox ? "Grading, on PayPal's sandbox." : "Grading.";
  await caption(page, `${live} The wait is cut.`, { ms: 1500 });
  cuts.pause(0.2);
  await page.getByTestId("attempt-1").waitFor({ timeout: 150_000 });

  // 7. Graded: one rubric line zoomed in, its verdict beside Jordan's quoted words, then the score
  // A missed line with a quote if there is one; live grading may quote nothing on a weak answer, so any quoted line will do.
  const quotedLines = page.locator('[data-testid^="question-1-"] li[data-testid^="item-"]').filter({ has: page.getByTestId("deciding-quote") });
  await quotedLines.first().waitFor({ timeout: 30_000 });
  const missedQuoted = page.locator('[data-testid^="question-1-"] li[data-testid^="item-"][data-verdict="not_met"]').filter({ has: page.getByTestId("deciding-quote") });
  const gradedLine = (await missedQuoted.count()) > 0 ? missedQuoted.first() : quotedLines.first();
  await centre(gradedLine);
  const lineCaption = `${grader} marks each line, quoting Jordan's words.`;
  const lineZoom = await zoomAbove(page, gradedLine, 1.5, lineCaption);
  cuts.resume();
  zoomTo(lineZoom);
  await say(page, 7, lineCaption, `${grader} marks every rubric line and quotes Jordan's own words.`);
  // The score, zoomed so it reads at YouTube size: the summary line and the big number under it.
  const headline = page.getByTestId("attempt-summary-headline");
  const firstScore = (await page.getByTestId("score-1").innerText()).split("/")[0].trim();
  const passMark = /pass mark (\d+)/.exec(await headline.innerText())?.[1];
  expect(passMark, "the summary line states the pass mark").toBeTruthy();
  const scoreCaption = `Code adds the points: ${firstScore} of 100, pass mark ${passMark}.`;
  cuts.pause(0.1);
  const scoreZoom = await zoomAbove(page, page.getByRole("main").getByTestId("attempt-summary").first(), 1.8, scoreCaption);
  cuts.resume();
  zoomTo(scoreZoom);
  await highlight(page, headline, 600);
  await say(page, 7, scoreCaption, `Code, not the model, adds the points: ${firstScore}. The pass mark is ${passMark}.`);
  unzoom();
  await beat("first grade");

  // 7b. Jordan contests one line, once; the second reader quotes both sides and recommends; a person rules
  cuts.pause(0.2);
  const firstAttempt = ((await (await page.request.get(`/api/enrollments/${enrollmentId}`)).json()) as { attempts: { answers: Record<string, string>; shownRun: number; runs: { items: { id: string; verdict: string }[]; caps: { id: string; triggered: boolean }[] }[] }[] }).attempts[0];
  const firstRun = firstAttempt.runs[firstAttempt.shownRun];
  const capped = new Set(firstRun.caps.filter((c) => c.triggered).map((c) => c.id.split("-")[0]));
  // A line from a question no cap held down, where Jordan's answer has words to quote.
  const contested = firstRun.items.find((item) => item.verdict !== "met" && !capped.has(item.id.replace(/[a-z]$/, "")) && firstAttempt.answers[item.id.replace(/[a-z]$/, "")]?.trim()) ?? firstRun.items.find((item) => item.verdict !== "met")!;
  const ownWords = (firstAttempt.answers[contested.id.replace(/[a-z]$/, "")] ?? "").split(/[.,]/)[0].trim();
  const contestBox = page.getByTestId("contest-line");
  await contestBox.locator("summary").click();
  await contestBox.getByTestId("contest-item").selectOption(contested.id);
  await contestBox.getByTestId("contest-note").fill(`My answer says "${ownWords}", so it does what the line asks.`);
  // The caption sits over the contest form itself, filled in with Jordan's note, before it's sent.
  const contestCaption = "Jordan contests one line, quoting their own answer.";
  const contestLine = "Jordan thinks one line was marked wrong, and contests it, once.";
  const contestZoom = await zoomAbove(page, contestBox, 1.4, contestCaption);
  cuts.resume();
  zoomTo(contestZoom);
  const contestFrom = Date.now();
  await highlight(page, contestBox.getByTestId("contest-note"), 1400);
  await say(page, 7, contestCaption, contestLine, { wait: false });
  await sleep(2400);
  await highlight(page, contestBox.getByTestId("contest-send"), 500);
  await contestBox.getByTestId("contest-send").click();
  await page.getByTestId("contest-status").waitFor({ timeout: 30_000 });
  await sleep(Math.max(0, (Math.max(readSeconds(contestLine), MIN_BEAT_SECONDS) + 0.3) * 1000 - (Date.now() - contestFrom)));
  unzoom();
  cuts.pause(0.2);
  await page.goto("/team");
  const jordanCard = page.getByTestId(`enrollment-${enrollmentId}`);
  const reader = jordanCard.getByTestId("second-reader");
  await reader.waitFor({ timeout: 120_000 });
  const recommends = (await reader.getAttribute("data-recommendation")) === "uphold";
  await jordanCard.getByTestId("contest-ruling-note").fill(recommends ? "Agreed: the answer says it." : "The answer doesn't say what the line asks.");
  await centre(jordanCard.getByTestId("team-contest"));
  const secondReader = aiLive ? "Claude" : "The second reader";
  const readerCaption = `${secondReader} recommends: ${recommends ? "uphold" : "let it stand"}. A person rules.`;
  const readerZoom = await zoomAbove(page, reader, 1.3, readerCaption);
  cuts.resume();
  zoomTo(readerZoom);
  await highlight(page, reader, 900);
  const ruleFrom = Date.now();
  const readerLine = `${secondReader} recommends. A person rules; only an upheld line changes the grade.`;
  await say(page, 7, readerCaption, readerLine, { wait: false });
  await sleep(2600);
  await highlight(page, jordanCard.getByTestId(recommends ? "contest-uphold" : "contest-reject"), 500);
  await jordanCard.getByTestId(recommends ? "contest-uphold" : "contest-reject").click();
  await jordanCard.getByTestId("team-contest-done").waitFor({ timeout: 30_000 });
  await sleep(Math.max(0, (readSeconds(readerLine) + 0.3) * 1000 - (Date.now() - ruleFrom)));
  unzoom();
  await beat("contest");
  cuts.pause(0.2);
  await page.goto(jordan);
  // An upheld line adds its points to attempt 1, so the score PayPal's note quotes is read again here.
  const firstNow = (await page.getByTestId("score-1").innerText()).split("/")[0].trim();

  // 8. Off camera: the study list, then the 24-hour wait skipped (the try-two caption says so)
  cuts.pause(0.2);
  await study(page);
  await page.getByTestId("skip-wait").click();
  await page.getByTestId("submit-attempt").waitFor();

  // 10. Try 2, typed off camera, graded on camera
  for (const q of Object.keys(samples.fail2)) await typeAnswer(page, q, samples.fail2[q]);
  await page.getByTestId("submit-attempt").click();
  await page.getByTestId("attempt-2").waitFor({ timeout: 150_000 });
  // The refund goes straight to the course team for approval (refund-waiting), or to a person first (refund-in-review).
  const waiting = page.getByTestId("refund-waiting").or(page.getByTestId("refund-in-review"));
  await waiting.waitFor({ timeout: 150_000 });
  const secondScore = (await page.getByTestId("score-2").innerText()).split("/")[0].trim();
  // The agent's note is written before the camera rolls: a live model takes a few seconds, never uncaptioned on screen.
  const refundNote = waiting.getByTestId("refund-note");
  await refundNote.waitFor({ timeout: 90_000 });
  // Read once the agent has written its note: by then it has either proposed the refund or sent the case to a person.
  const reviewFirst = await page.getByTestId("refund-in-review").getByTestId("refund-note").isVisible();
  const secondCaption = `Try two, a day later (wait skipped): ${secondScore}. Short again.`;
  const secondZoom = await zoomAbove(page, page.getByRole("main").getByTestId("attempt-summary").first(), 1.6, secondCaption);
  cuts.resume();
  zoomTo(secondZoom);
  await say(page, 10, secondCaption, `A day later, after a study list, try two: ${secondScore}. Short again, so the refund is due.`);
  unzoom();
  await centre(waiting);
  await highlight(page, refundNote, 700);
  await say(page, 10, reviewFirst ? "The refund agent sends this case to a person first, and tells Jordan why." : "The refund agent writes Jordan a note on the lines they missed.", reviewFirst ? "A person looks at this case first. The agent tells Jordan why." : "The refund agent writes Jordan a note on what held them back.");
  await beat("second fail");

  // 11. The course team: only a person approves, and the click is held until PayPal reports the refund COMPLETED
  cuts.pause(0.3);
  await page.goto("/team");
  if (reviewFirst) {
    // The person who looked sends it on (off camera); the agent then proposes the refund for approval.
    const review = jordanCard.getByTestId("refund-review");
    await review.getByTestId("review-note").fill("Two honest tries, both short: the refund is due.");
    await review.getByTestId("review-propose").click();
  }
  const approve = jordanCard.getByTestId("approve-button");
  await approve.waitFor({ timeout: 90_000 });
  await noFailedToolStep(page, "approval card");
  // Zoomed on the approval: the amount and the Approve button, clear of the caption band.
  const approveCaption = "Code checked the policy and amount. Only a person approves.";
  const approveZoom = (await zoomAbove(page, approve.locator("xpath=ancestor::*[.//*[@data-testid='approval-reasons']][1]"), 1.5, approveCaption)) ?? (await zoomAbove(page, approve, 1.5, approveCaption));
  cuts.resume();
  zoomTo(approveZoom);
  await requireLive(page, "approval card");
  await highlight(page, approve, 900);
  await say(page, 11, approveCaption, "Code checked the policy and the amount. Only a person can approve.", { ms: 5000 });
  // From the click to PayPal's answer, nothing is cut.
  await approve.click();
  const done = jordanCard.getByTestId("team-refund-done");
  await expect(done).toContainText("COMPLETED", { timeout: 90_000 });
  const reported = /PayPal reports it ([A-Z]+)/.exec(await done.innerText())?.[1] ?? "COMPLETED";
  const doneCaption = `Approved. ${sandbox ? "PayPal" : "The stand-in"} reports the refund ${reported}.`;
  cuts.pause(0.4);
  unzoom();
  const doneZoom = await zoomAbove(page, done, 1.6, doneCaption);
  cuts.resume();
  zoomTo(doneZoom);
  await highlight(page, done, 700);
  await say(page, 11, doneCaption, `One click, and ${paypal} reports the refund ${reported.toLowerCase()}.`);
  unzoom();
  await beat("approved");

  // 12. Jordan's refund card: the amount back, and PayPal's own note quoting both scores
  cuts.pause(0.2);
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
  if (process.env.DEMO_BASE_URL) expect(webhookShown, "the hosted app receives PayPal's webhooks, and Jordan's refund card says so").toBe(true);
  const amount = await page.getByTestId("refund-amount").innerText();
  const note = page.getByTestId("refund-paypal-note");
  const noteText = (await note.isVisible()) ? await note.innerText() : "";
  const quotesBoth = noteText.includes(firstNow) && noteText.includes(secondScore);
  if (sandbox) expect(quotesBoth, `PayPal's note_to_payer quotes both scores: "${noteText}"`).toBe(true);
  // Zoomed on PayPal's own note: the amount back, and both scores in PayPal's words.
  const issuedCaption = quotesBoth ? `${amount} back. ${paypals} note: ${firstNow} and ${secondScore}, pass mark ${passMark}.` : `Refund issued: ${amount} back to Jordan.`;
  const issuedZoom = await zoomAbove(page, quotesBoth ? note : issued, 1.7, issuedCaption);
  cuts.resume();
  zoomTo(issuedZoom);
  await highlight(page, quotesBoth ? note : page.getByTestId("refund-id"), 1400);
  await say(page, 12, issuedCaption, quotesBoth ? `Jordan gets ${amount} back. ${paypals} own note on the refund quotes both scores.` : `Jordan gets ${amount} back, with ${paypals} refund id.`);
  unzoom();
  await beat("refunded");

  // 12c. /verify: the order read back from PayPal carries the same fingerprint; then one word changed, and no match
  cuts.pause(0.2);
  await page.goto(jordan);
  await page.getByTestId("receipt").getByTestId("verify-on-paypal").click();
  await page.waitForURL(/\/verify\?q=/);
  const main = page.getByRole("main");
  const verified = main.getByTestId("verify-result");
  await expect(verified).toHaveAttribute("data-status", "match", { timeout: 30_000 });
  const fromPayPal = main.getByTestId("verify-paypal-rubric");
  const verifiedFingerprint = (await fromPayPal.innerText()).replace(/\s+/g, "").match(/[0-9a-f]{12}/)?.[0];
  if (cartFingerprint) expect(verifiedFingerprint, "the fingerprint on PayPal's cart and the one read back from PayPal's order").toBe(cartFingerprint);
  await centre(fromPayPal);
  const verifyCaption = `From ${paypals} order: fingerprint ${verifiedFingerprint}.`;
  const verifyZoom = await zoomAbove(page, fromPayPal, 1.6, verifyCaption);
  cuts.resume();
  zoomTo(verifyZoom);
  await highlight(page, fromPayPal, 1200);
  await say(page, 12, verifyCaption, `Anyone can check on /verify: ${paypals} order gives back the same fingerprint.`, { ms: 4500 });
  unzoom();
  // The lock catches a change: one line of a copy of the rubric, edited in the browser
  cuts.pause(0.1);
  const change = main.getByTestId("change-one-line");
  await change.getByTestId("change-line-select").selectOption({ index: 2 });
  const lineText = change.getByTestId("change-line-text");
  const wording = await lineText.inputValue();
  const changedTo = wording.replace(/^\S+/, "Never");
  await centre(change.getByTestId("change-form"));
  cuts.resume();
  await highlight(page, lineText, 800);
  await lineText.fill(changedTo);
  await change.getByTestId("change-line-check").click();
  const changeResult = change.getByTestId("change-result");
  await expect(changeResult).toHaveAttribute("data-status", "no-match");
  const changedLabel = /You changed (Question \d+, line \d+)/.exec(await change.getByTestId("change-named-line").innerText())?.[1] ?? "one line";
  const changeCaption = `${changedLabel}, one word changed: no match.`;
  cuts.pause(0.3);
  const changeZoom = await zoomAbove(page, changeResult, 1.7, changeCaption);
  cuts.resume();
  zoomTo(changeZoom);
  await highlight(page, changeResult, 900);
  await say(page, 12, changeCaption, `Change one word of the rubric, and it no longer matches ${paypals} record.`, { ms: 5000 });
  unzoom();
  await beat("catches a change");

  // 14. The close: the creator's earnings card, every figure read back from PayPal
  cuts.pause(0.2);
  await page.goto("/cohort");
  const earnings = page.getByRole("main").getByTestId("earnings-card");
  await earnings.getByTestId("earnings-sold").waitFor({ timeout: 90_000 });
  const [sold, refunded, net] = await Promise.all(["earnings-sold", "earnings-refunded", "earnings-net"].map((id) => earnings.getByTestId(id).innerText()));
  // "2 sales" and "1 refund", the hints under Sold and Refunded.
  const [sales, refunds] = await Promise.all(["earnings-sold", "earnings-refunded"].map(async (id) => (await earnings.getByTestId(id).locator("xpath=following-sibling::p").innerText()).trim()));
  // The passing learner's order is one the card read back, and the creator keeps money: not a $0 close.
  const read = (await (await page.request.get("/api/creator/courses/sample/earnings")).json()) as { netCents: number; orders: { orderId: string }[] };
  expect(read.orders.map((o) => o.orderId), "the passing learner's order is on the card").toContain(side.passerOrder);
  expect(read.netCents, "the close shows money the creator keeps").toBeGreaterThan(0);
  await centre(earnings);
  cuts.resume();
  await highlight(page, earnings, 1200);
  await say(page, 14, `What the course earned, read from ${paypal}: ${sold} sold, ${refunded} refunded, ${net} net.`, `And the creator's earnings, read from ${paypal}: ${sales}, ${refunds}, ${net} net.`);
  await beat("earnings");

  // 15. The end card: what runs where, and the address to try it
  const stack = ["PayPal Orders v2", "Payments v2", "Webhooks", "Server SDK", ...(aiLive ? ["Claude Sonnet and Haiku"] : []), "sandbox only"].join(" · ");
  const host = new URL(baseURL!).host;
  script.push({ at: at(), text: `Pass or Refund · ${host}` });
  const endLine = "Pass or Refund: the terms on PayPal, the refund from a person.";
  voiceover.push({ shot: 15, at: at(), text: endLine });
  // Held for the line, so the last words aren't cut off.
  await titleCard(page, "Pass or Refund", `${host}<br>${stack}`, Math.max(END_CARD_SECONDS, readSeconds(endLine) + 0.3) * 1000);
  await beat("end");

  // The cut. A cut without PayPal's window (mock PayPal) still leaves room for it.
  const parts = cuts.finish();
  const total = cuts.editedExact;
  const edited = Math.round(total + (paypalWindow ? 0 : PAYPAL_CLIP_SECONDS));
  console.log(`[demo] edited cut about ${edited}s (target ${EDITED_MIN_SECONDS}-${EDITED_MAX_SECONDS}s, limit ${EDITED_LIMIT_SECONDS}s); opener ${openerSeconds.toFixed(1)}s (${OPENER_MIN_SECONDS}-${OPENER_MAX_SECONDS}s); PayPal window ${paypalWindow ? `spliced in, ${PAYPAL_CLIP_SECONDS}s` : "not in this cut, its time counted"}`);

  // The voiceover: from the first frame, every line where its shot starts. Each must fit before the
  // next, and each narrated beat stays on screen MIN_BEAT_SECONDS or more.
  const tight = voiceover.flatMap((line, i) => {
    const room = (voiceover[i + 1]?.at ?? total) - line.at;
    const needs = Math.max(readSeconds(line.text), MIN_BEAT_SECONDS);
    return needs > room + 0.05 ? [`shot ${line.shot} at ${line.at}s needs ${needs}s, has ${room.toFixed(1)}s: "${line.text}"`] : [];
  });
  console.log(`[demo] voiceover: ${voiceover.length} lines, first at ${voiceover[0].at}s`);
  fs.mkdirSync("videos", { recursive: true });
  fs.writeFileSync("videos/voiceover.json", JSON.stringify(voiceover, null, 2) + "\n");
  const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.round(t % 60)).padStart(2, "0")}`;
  fs.writeFileSync("videos/demo-voiceover.txt", script.map((line) => `${mmss(line.at)}  ${line.text}`).join("\n") + "\n");
  const video = page.video();
  await page.close();
  await video?.saveAs("videos/demo-pass-or-refund.webm");
  if (popup && paypalWindow) await popup.video()?.saveAs("videos/demo-paypal-window.webm");
  fs.writeFileSync("videos/demo-edit.json", JSON.stringify({ size: `${VIDEO_SIZE.width}x${VIDEO_SIZE.height}`, videos: { main: "videos/demo-pass-or-refund.webm", popup: "videos/demo-paypal-window.webm" }, parts }, null, 2));
  expect(voiceover[0].at, "the narration starts with the first frame").toBe(0);
  expect(tight, "voiceover lines that run into the next one: trim the line, not the shot").toEqual([]);
  expect(openerSeconds, "the opener: who it's for and the promise").toBeGreaterThanOrEqual(OPENER_MIN_SECONDS);
  expect(openerSeconds, "the opener: who it's for and the promise").toBeLessThanOrEqual(OPENER_MAX_SECONDS);
  expect(edited, "the edited cut's length").toBeGreaterThanOrEqual(EDITED_MIN_SECONDS);
  expect(edited, "the edited cut's length").toBeLessThanOrEqual(EDITED_MAX_SECONDS);
});
