/**
 * DEMO VIDEO (npm run demo:record, then npm run demo:edit). The shot list (round4/r5-fable/V.md, 3.1,
 * re-cut for the round 5 judges):
 *   1. the opener, narrated from the first frame: the name, the audience and the problem over the
 *      landing, then a flash-forward to Jordan's refund card from shot 12, zoomed, placed by the edit
 *   3. the course page: the guarantee beside the pay button, the rubric's fingerprint
 *   4. PayPal's own window: its cart held on the item line with the rubric fingerprint, then the
 *      sandbox test card, about 6.5 s
 *   5. paid: PayPal captured it, and Jordan's page opens on "Your guarantee"
 *   6. one answer typed, zoomed, then a short caption for the grading (live Claude and PayPal's
 *      sandbox when they are), the wait cut
 *   7. graded: one rubric line zoomed, the verdict beside Jordan's quoted words, then the score
 *   7b. Jordan contests one line; on /team the second reader recommends, quoting both sides, and the
 *      person rules. The recommendation never changes a grade.
 *   9b. "why not fail on purpose?": the home page's rules, read from the policy text
 *   9. another learner trying to trick the grader, flagged
 *   8. "Skip the wait (demo)" on screen
 *  10. the second attempt graded, and the refund agent's note
 *  11. the course team's approval card: the agent's summary and reasons, then the Approve click,
 *      kept on camera, and the card turning to "Refund issued", PayPal reporting it COMPLETED
 *  12. "Refund issued" held 6 s or more, zoomed, then the What PayPal did drawer's debug_id
 *  12b. the receipt terms: /rubric's three columns, Receipt | Rubric on sale | PayPal, each ticked
 *  12c. /verify: the order read back from PayPal alone, beside the public rubric, then one line of
 *      a copy of the rubric changed, and it no longer matches PayPal's record
 *  13. /creator: any creator's rubric gets its fingerprint and link
 *  14. /cohort and its "Fix first" line, as the close
 * The edited cut, PayPal's window included, stays under 2:30. Captions are short; the voiceover is
 * separate: videos/voiceover.json is [{ shot, at, text }] with `at` in seconds of the edited video
 * (after demo-edit.json's parts are joined), for round4/scripts/narrate.mjs. Every number in it is
 * read from the screen, and each line fits before the next one at 15 characters (and 2.6 words) a
 * second, with every narrated beat on screen 4 s or more (the take fails otherwise). videos/demo-voiceover.txt lists the captions at their times. The side
 * learner (9) is set up first, off camera. The video is 1280x800 and shows only the
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
import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";
import { payInPayPalWindow } from "../tests/e2e/paypal-popup";
import { samples } from "../src/lib/course/samples";
import { caption, centre, DemoClock, DemoCuts, highlight, zoomOn, type Zoom } from "./captions";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const NUMBER_WORDS: Record<number, string> = { 3: "Three", 4: "Four", 5: "Five", 6: "Six", 7: "Seven", 8: "Eight" };
const EDITED_LIMIT_SECONDS = 150;
/** The home page's limit in the edited cut. */
const LANDING_LIMIT_SECONDS = 8;
/** PayPal's window, spliced in from its own recording: its cart open on the item line, held... */
const CART_SECONDS = 4;
/** ...then the filled card form and the pay click. */
const FORM_SECONDS = 2.5;
const PAYPAL_CLIP_SECONDS = CART_SECONDS + FORM_SECONDS;
/** The flash-forward: shot 12's refund card, recorded there and placed after the landing by the edit. */
const FLASH_SECONDS = 5.5;
/** How fast the narrator reads: a voiceover line must fit before the next one at this pace. */
const WORDS_PER_SECOND = 2.6;
const CHARS_PER_SECOND = 15;
/** Every narrated beat stays on screen at least this long. */
const MIN_BEAT_SECONDS = 4;
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

/** The learner beside Jordan, set up off camera: one who tries to trick the grader. */
async function sideLearners(browser: Browser, baseURL: string, sandbox: boolean) {
  // Not clean: these learners use the judges' prepared answers, and the home page's judge box has the team passcode.
  const context = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [{ origin: new URL(baseURL).origin, localStorage: [{ name: "por_judge", value: "1" }] }] } });
  const page = await context.newPage();
  await page.goto("/");
  const passcode = (await page.getByTestId("team-passcode-shown").innerText()).trim();
  const trick = await buyOffCamera(page, "Sam Ortiz", sandbox);
  await submitPrepared(page, "inject", 1);
  await expect(page.getByTestId("flagged")).toBeVisible();
  await context.close();
  return { trick, passcode };
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

/**
 * A zoom that keeps the caption band in frame: `target` is scrolled to sit just above the band, and
 * the zoom crops only the top of the frame, and the sides evenly when the target fits, so a short
 * caption (55 characters or so) stays whole.
 */
async function zoomAbove(page: Page, target: Locator, to: number): Promise<Zoom> {
  const view = page.viewportSize() ?? SIZE;
  const firstRow = view.height - view.height / to;
  await target.evaluate((el, top) => window.scrollBy(0, el.getBoundingClientRect().top - top - 12), firstRow);
  const box = await target.boundingBox();
  const side = (view.width - view.width / to) / 2;
  const fits = box && box.x >= side && box.x + box.width <= view.width - side;
  return { ...(await zoomOn(page, target, to)), ay: 1, ...(fits ? { ax: 0.5 } : {}) };
}

test("demo", async ({ page, request, browser, baseURL }) => {
  test.setTimeout(1_200_000);
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

  const clock = new DemoClock(780);
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
  /** The flash-forward goes in after the landing, so every line after the landing moves on by its length. */
  let flashOffset = 0;
  const at = () => Math.round((cuts.editedExact + flashOffset) * 10) / 10;
  /**
   * One beat: a short caption on screen and a voiceover line, held long enough for the narrator to
   * read the line (and the caption to be read), never less than `ms`.
   */
  const say = (on: Page, shot: number, captionText: string, vo: string, opts: { ms?: number; wait?: boolean } = {}) => {
    script.push({ at: at(), text: captionText });
    voiceover.push({ shot, at: at(), text: vo });
    const ms = Math.max(opts.ms ?? 0, Math.round((readSeconds(vo) + 0.3) * 1000), MIN_BEAT_SECONDS * 1000);
    return caption(on, captionText, { ...opts, ms });
  };

  // 1. The opener, narrated from the first frame: the name, the audience and the problem over the landing
  await page.goto("/");
  const hero = page.getByTestId("hero-title");
  await hero.waitFor();
  const landingFrom = cuts.editedExact;
  cuts.resume();
  cuts.zoom(await zoomAbove(page, hero, 1.15)); // a slow push in, the caption kept in frame
  // The narration starts with the first frame; the highlight pulses under it.
  const pulse = highlight(page, hero, 2400);
  await say(page, 1, "Pass or Refund: a course guarantee that pays, for online course creators.", "Pass or Refund. Course buyers stopped trusting guarantees: terms move, refunds stall.");
  await pulse;
  cuts.pause(0.1);
  cuts.unzoom();
  const landingSeconds = cuts.editedExact - landingFrom;
  /** Where the flash-forward goes: after the landing, before the course page. */
  const flashAt = { part: cuts.parts.length, edited: cuts.editedExact, line: voiceover.length, caption: script.length };
  flashOffset = FLASH_SECONDS;
  await beat("landing");

  // 3. The course page: the guarantee beside the pay button, with the rubric's fingerprint
  await page.goto("/course");
  await page.getByTestId("guarantee").waitFor();
  await page.getByTestId("learner-name").filter({ visible: true }).fill("Jordan Lee");
  await page.getByTestId("learner-email").filter({ visible: true }).fill(email("Jordan Lee"));
  const guarantee = page.getByTestId("guarantee").filter({ visible: true });
  await centre(guarantee);
  cuts.resume();
  await highlight(page, guarantee, 900);
  await say(page, 3, "Fail the final check twice and get refunded. The terms sit beside the pay button.", "The guarantee is code, its terms beside the pay button.");
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
        // The window is shown from here, never PayPal's loading frames: first its cart, open on the
        // item line that carries the rubric's fingerprint (read off PayPal's own screen)...
        await p.evaluate(() => window.scrollTo(0, 0));
        await p.getByTestId("cart-button").click();
        const item = p.getByText(/rubric v\d+ · [0-9a-f]{12}/).first();
        await item.waitFor({ timeout: 15_000 });
        const fingerprint = /[0-9a-f]{12}/.exec(await item.innerText())![0];
        marks.push(since());
        await say(p, 4, `PayPal's own window: the item line carries the rubric fingerprint, ${fingerprint}.`, "Jordan pays in PayPal's own window. Its item line carries the rubric's fingerprint.", { wait: false, ms: 20_000 });
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
      // Shot 4's line was for PayPal's window, which isn't in this cut.
      while (voiceover.at(-1)?.shot === 4) voiceover.pop();
      await page.goto("/course?test-card=1");
      await page.getByTestId("learner-name").filter({ visible: true }).fill("Jordan Lee");
      await page.getByTestId("learner-email").filter({ visible: true }).fill(email("Jordan Lee"));
      cuts.resume(); // No window to splice in: the fallback purchase stays on camera.
      await page.getByTestId("sandbox-test-card").click();
      return undefined;
    });
    if (paypalWindow && marks.length === 2) {
      // The main video already stopped when the window opened, so only the cart, then the filled form and the pay click, go in.
      cuts.clips("popup", [{ from: marks[0], to: marks[0] + CART_SECONDS }]); // no zoom: it would crop the caption
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

  // 5. Paid: the capture and the rubric lock, at the top of Jordan's page
  const receipt = page.getByTestId("receipt");
  await receipt.waitFor();
  const paid = /\$[\d,]+(\.\d\d)?/.exec(await receipt.innerText())?.[0] ?? "the price";
  await page.evaluate(() => window.scrollTo(0, 0));
  cuts.resume(); // after PayPal's window
  await highlight(page, receipt, 700);
  await say(page, 5, `${sandbox ? "PayPal captures" : "Paid:"} ${paid}. Jordan's guarantee opens the page: rubric locked, on the PayPal order, a person approves.`, `${sandbox ? "PayPal captures" : "The stand-in takes"} ${paid}. Jordan's page opens on the guarantee, in plain words.`);
  await beat("bought");

  // 6. Jordan types one answer, zoomed; the other three are typed off camera
  cuts.pause(0.1);
  for (const q of ["q2", "q3", "q4"]) await typeAnswer(page, q, samples.fail1[q]);
  const answerBox = page.getByTestId("answer-q1");
  await centre(answerBox);
  const typingZoom = await zoomAbove(page, answerBox, 1.4);
  cuts.resume();
  cuts.zoom(typingZoom);
  const typedFrom = Date.now();
  const typing = `Jordan answers in their own words, and ${aiLive ? "Claude grades it live" : "it's graded"}.`;
  await say(page, 6, "Jordan answers the final check in their own words.", typing, { wait: false });
  await typeAnswer(page, "q1", WEAK_ANSWER, 14);
  // The line runs on over the grading caption (1.5 s) and the 0.2 s kept after it.
  await sleep(Math.max(0, (Math.max(readSeconds(typing), MIN_BEAT_SECONDS) + 0.2 - 1.7) * 1000 - (Date.now() - typedFrom)));
  cuts.unzoom();
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
  const lineZoom = await zoomAbove(page, gradedLine, 1.35);
  cuts.resume();
  cuts.zoom(lineZoom);
  await say(page, 7, `${grader === "Claude" ? "Claude" : "The grader"} marks each line, quoting Jordan's words.`, `${grader} marks every rubric line and quotes Jordan's own words.`);
  cuts.unzoom();
  const score = page.getByTestId("score-1");
  await centre(score);
  await highlight(page, score, 500);
  const firstScore = (await score.innerText()).split("/")[0].trim();
  await say(page, 7, `Code adds the points: ${firstScore} of 100, pass mark 70.`, `Code, not the model, adds the points: ${firstScore} of a hundred.`);
  await beat("first grade");

  // 7b. Jordan contests one line once, before the retake; the second reader recommends, a person rules
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
  await centre(contestBox);
  cuts.resume();
  await highlight(page, contestBox, 600);
  await contestBox.getByTestId("contest-send").click();
  const contestStatus = page.getByTestId("contest-status");
  await contestStatus.waitFor({ timeout: 30_000 });
  await centre(contestStatus);
  await highlight(page, contestStatus, 700);
  await say(page, 7, "Jordan contests one line, once, quoting their own answer.", "Jordan contests one line, once.");
  cuts.pause(0.2);
  await page.goto("/team");
  const jordanCard = page.getByTestId(`enrollment-${enrollmentId}`);
  const reader = jordanCard.getByTestId("second-reader");
  await reader.waitFor({ timeout: 120_000 });
  const recommends = (await reader.getAttribute("data-recommendation")) === "uphold";
  const contestCard = jordanCard.getByTestId("team-contest");
  await centre(contestCard);
  const readerZoom = await zoomAbove(page, reader, 1.3);
  cuts.resume();
  cuts.zoom(readerZoom);
  await highlight(page, reader, 800);
  const secondReader = aiLive ? "Claude" : "The second reader";
  await say(page, 7, `${secondReader} quotes both sides. Recommends: ${recommends ? "uphold" : "let it stand"}.`, `${secondReader} quotes both sides and recommends.`);
  // The person rules, here with the recommendation; the ruling is theirs, and code applies it.
  await jordanCard.getByTestId("contest-ruling-note").fill(recommends ? "Agreed: the answer says it." : "The answer doesn't say what the line asks.");
  await highlight(page, jordanCard.getByTestId(recommends ? "contest-uphold" : "contest-reject"), 500);
  await jordanCard.getByTestId(recommends ? "contest-uphold" : "contest-reject").click();
  const ruled = jordanCard.getByTestId("team-contest-done");
  await ruled.waitFor({ timeout: 30_000 });
  cuts.unzoom();
  await centre(ruled);
  await highlight(page, ruled, 600);
  await say(page, 7, `A person rules: ${recommends ? "upheld" : "not upheld"}. The recommendation never changes a grade.`, "A person rules. The recommendation never changes a grade.");
  await beat("contest");

  // 9b. "Why not fail on purpose?": the home page's rules, all in code, read off the page, before the shortcut
  cuts.pause(0.2);
  await page.goto("/#gaming");
  const gaming = page.getByTestId("gaming-details");
  await gaming.locator("summary").click();
  const rules = page.getByTestId("anti-gaming");
  await rules.waitFor();
  const ruleCount = await rules.locator("li").count();
  const minPoints = /at least (\d+) points/.exec(await rules.locator("li").first().innerText())?.[1];
  expect(minPoints, "the first rule states the minimum points").toBeTruthy();
  await gaming.evaluate((el) => el.scrollIntoView({ block: "start", behavior: "instant" }));
  cuts.resume();
  await highlight(page, rules.locator("li").first(), 800);
  await say(page, 9, `Why not fail on purpose? ${NUMBER_WORDS[ruleCount] ?? ruleCount} rules, all in code: a refund has to be earned by trying.`, `Why not fail on purpose? Each try needs every answer and ${minPoints} points or more.`);
  await beat("gaming rules");

  // 9. Another learner tries to trick the grader
  cuts.pause(0.2);
  await page.goto(`/learn/${side.trick}`);
  const flagged = page.getByTestId("flagged");
  await flagged.waitFor();
  await centre(flagged);
  cuts.resume();
  await highlight(page, flagged, 900);
  await say(page, 9, "Another learner tells the grader to give full marks. Flagged. Their guarantee is void.", "Another learner orders full marks: flagged, guarantee void.");
  await beat("trick flagged");

  // 8. "Skip the wait (demo)"
  cuts.pause(0.2);
  await page.goto(jordan);
  await study(page);
  const skip = page.getByTestId("skip-wait");
  await centre(page.getByTestId("attempt-gap"));
  cuts.resume();
  await highlight(page, skip, 500);
  await say(page, 8, "The retake opens 24 hours later, after the study list. Skip the wait (demo) jumps ahead.", "Retakes open a day later. For the demo, we skip the wait.");
  await skip.click();
  cuts.pause(0.6);
  await page.getByTestId("submit-attempt").waitFor();
  await beat("skip the wait");

  // 10. Back to Jordan: the second attempt, typed off camera, graded on camera
  for (const q of Object.keys(samples.fail2)) await typeAnswer(page, q, samples.fail2[q]);
  await page.getByTestId("submit-attempt").click();
  await page.getByTestId("attempt-2").waitFor({ timeout: 150_000 });
  // A contested case may go to a person first (refund-in-review); otherwise straight to approval (refund-waiting).
  const waiting = page.getByTestId("refund-waiting").or(page.getByTestId("refund-in-review"));
  await waiting.waitFor({ timeout: 150_000 });
  await waiting.getByTestId("refund-note").waitFor({ timeout: 90_000 });
  const secondScore = (await page.getByTestId("score-2").innerText()).split("/")[0].trim();
  const second = page.getByTestId("attempt-2");
  await centre(second);
  cuts.resume();
  await highlight(page, second, 700);
  await say(page, 10, `Second honest try, after the study list: ${secondScore}. Short again.`, `Jordan's second honest try: ${secondScore}. Short again, so the refund is due.`);
  await centre(waiting);
  await highlight(page, waiting.getByTestId("refund-note"), 700);
  const reviewFirst = await page.getByTestId("refund-in-review").isVisible();
  await say(page, 10, reviewFirst ? "The refund agent sends a contested case to a person first, and tells Jordan why." : "The refund agent writes Jordan a note on the lines they missed.", reviewFirst ? "A contested case goes to a person first. The agent tells Jordan." : "The refund agent writes Jordan a note on what held them back.");
  await beat("second fail");

  // 11. The course team approves
  cuts.pause(0.3);
  await page.goto("/team");
  if (reviewFirst) {
    // The person who looked sends it on (off camera); the agent then proposes the refund for approval.
    const review = jordanCard.getByTestId("refund-review");
    await review.getByTestId("review-note").fill("The ruling stands, and the refund is due.");
    await review.getByTestId("review-propose").click();
  }
  const approve = jordanCard.getByTestId("approve-button");
  await approve.waitFor({ timeout: 90_000 });
  const summary = jordanCard.getByTestId("agent-summary");
  await centre(summary);
  cuts.resume();
  await requireLive(page, "approval card");
  await highlight(page, summary, 800);
  await say(page, 11, "The course team sees the agent's summary. Code checked the policy and amount; only a person approves.", "The team sees the agent's summary. Only a person can approve.");
  // The Approve click on camera: the button in the top half, clear of the caption band, and no caption fading over it.
  await approve.evaluate((el) => {
    el.scrollIntoView({ block: "center", behavior: "instant" });
    window.scrollBy(0, 170);
  });
  await sleep(500);
  await highlight(page, approve, 700);
  await approve.click();
  await sleep(1200); // the button working
  cuts.pause(0.2);
  const done = jordanCard.getByTestId("team-refund-done");
  await expect(done).toContainText("COMPLETED", { timeout: 90_000 });
  await centre(done);
  cuts.resume();
  await highlight(page, done, 700);
  const reported = /PayPal reports it ([A-Z]+)/.exec(await done.innerText())?.[1] ?? "COMPLETED";
  await say(page, 11, `Approved. Refund issued: PayPal reports it ${reported}.`, "One click from a person, and PayPal reports the refund completed.");
  await beat("approved");

  // 12. "Refund issued", held and zoomed. Its first FLASH_SECONDS are the flash-forward after the landing.
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
  if (process.env.DEMO_BASE_URL) expect(webhookShown, "the hosted app receives PayPal's webhooks, and shot 12 says so").toBe(true);
  const amount = await page.getByTestId("refund-amount").innerText();
  await centre(issued);
  const issuedZoom = await zoomOn(page, issued, 1.3);
  // 1b. The flash-forward: recorded here, kept out of this spot, and placed after the landing by the edit.
  const openFrom = cuts.clock;
  const flashLine = `Here, a learner who tried twice gets ${amount} back, paid by ${paypal}.`;
  const flashCaption = `${amount} back to a learner who tried twice and failed, paid by ${paypal}.`;
  expect(readSeconds(flashLine), "the flash-forward's line fits it").toBeLessThanOrEqual(FLASH_SECONDS);
  await caption(page, flashCaption, { ms: FLASH_SECONDS * 1000 + 200 });
  const openTo = openFrom + FLASH_SECONDS;
  cuts.resume();
  cuts.zoom(issuedZoom);
  await highlight(page, page.getByTestId("refund-id"), 1200);
  const noted = await page.getByTestId("refund-paypal-note").isVisible();
  await say(
    page,
    12,
    `Refund issued: ${amount} back to Jordan. PayPal's refund id, status COMPLETED.`,
    `On Jordan's side: ${amount} back, ${sandbox ? "PayPal's" : "the"} refund id${noted ? ", and PayPal's own note quoting both scores" : ", status completed"}.`,
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
  expect(await page.getByTestId("paypal-invoice-id").textContent()).toContain(enrollmentId);
  const ticks = page.getByRole("main").getByTestId("three-way-tick");
  for (const column of ["receipt", "on-sale", "paypal"]) await expect(ticks.getByTestId(`tick-${column}`)).toHaveAttribute("data-status", "tick");
  await centre(check);
  cuts.resume();
  await highlight(page, ticks, 700);
  await say(page, 12, `Receipt, rubric on sale and ${sandbox ? "PayPal's" : "the"} order: three reads, one fingerprint.`, `Receipt, rubric on sale, ${sandbox ? "PayPal's" : "the"} order: one fingerprint.`);
  await beat("receipt terms");

  // 12c. /verify: the same order read back from PayPal alone, beside the public rubric
  cuts.pause(0.2);
  await page.goto(jordan);
  await page.getByTestId("receipt").getByTestId("verify-on-paypal").click();
  await page.waitForURL(/\/verify\?q=/);
  const verified = page.getByRole("main").getByTestId("verify-result");
  await expect(verified).toHaveAttribute("data-status", "match", { timeout: 30_000 });
  // 12d. On the same page, the lock catches a change: one line of a copy of the rubric, edited in the browser
  const change = page.getByRole("main").getByTestId("change-one-line");
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
  cuts.zoom(await zoomAbove(page, changeResult, 1.25));
  await highlight(page, changeResult, 900);
  await say(page, 12, `${changedLabel}, one word changed: no match.`, `Anyone can check ${sandbox ? "PayPal's" : "the"} order on /verify. Change one word, and it won't match.`);
  cuts.unzoom();
  await beat("catches a change");

  // 13. Any creator: a rubric in, a fingerprint and a link out. Typed off camera, published on camera.
  cuts.pause(0.2);
  await page.goto("/creator");
  await page.getByTestId("creator-title").fill("Bread at Home");
  await page.getByTestId("creator-q1-text").fill("How do you know bread dough has proved enough?");
  await page.getByTestId("creator-q1-lines").fill("30 Says it has doubled in size\n20 Says a poked dent springs back slowly");
  await page.getByTestId("creator-add-question").click();
  await page.getByTestId("creator-q2-text").fill("Why let a loaf cool before slicing it?");
  await page.getByTestId("creator-q2-lines").fill("50 Says the crumb is still setting from the steam inside");
  const publish = page.getByTestId("creator-publish");
  await centre(publish);
  cuts.resume();
  await highlight(page, publish, 500);
  await publish.click();
  const creatorFingerprint = page.getByTestId("creator-fingerprint");
  await creatorFingerprint.waitFor({ timeout: 30_000 });
  await centre(creatorFingerprint);
  await highlight(page, page.getByTestId("creator-link"), 700);
  await say(page, 13, "Any creator: write a rubric, get its fingerprint and a link to sell the course from.", "Any creator can do the same: write a rubric, get its fingerprint and a link.");
  await beat("creator");

  // 14. The close: what the creator should fix first
  cuts.pause(0.2);
  await page.goto("/cohort");
  const fixFirst = page.getByTestId("cohort-fix-first");
  await fixFirst.waitFor();
  await centre(fixFirst);
  cuts.resume();
  await highlight(page, fixFirst, 700);
  await say(page, 14, "And the creator learns which lesson to fix first. Pass or Refund: a guarantee that pays out.", "And the creator sees which lesson to fix first. Pass or Refund.");
  await sleep(400);
  await beat("end");

  // The cut: the landing, the flash-forward, then the story. A cut without PayPal's window (mock PayPal) still leaves room for it.
  const parts = cuts.finish();
  parts.splice(flashAt.part, 0, { src: "main", from: openFrom, to: openTo, zoom: { to: 1.3, ax: issuedZoom.ax, ay: issuedZoom.ay } });
  const total = cuts.editedExact; // the flash-forward is in the parts now
  const edited = Math.round(total + (paypalWindow ? 0 : PAYPAL_CLIP_SECONDS));
  console.log(`[demo] edited cut about ${edited}s (limit ${EDITED_LIMIT_SECONDS}s); home page ${landingSeconds.toFixed(1)}s (limit ${LANDING_LIMIT_SECONDS}s); PayPal window ${paypalWindow ? `spliced in, ${PAYPAL_CLIP_SECONDS}s` : "not in this cut, its time counted"}`);
  expect(edited).toBeLessThan(EDITED_LIMIT_SECONDS);
  expect(landingSeconds).toBeLessThanOrEqual(LANDING_LIMIT_SECONDS);

  // The voiceover: from the first frame, every line where its shot starts, the flash-forward's after the landing.
  // Each must fit before the next, and each narrated beat stays on screen MIN_BEAT_SECONDS or more.
  const flashEdited = Math.round(flashAt.edited * 10) / 10;
  const lines = [...voiceover.slice(0, flashAt.line), { shot: 1, at: flashEdited, text: flashLine }, ...voiceover.slice(flashAt.line)];
  script.splice(flashAt.caption, 0, { at: flashEdited, text: flashCaption });
  const tight = lines.flatMap((line, i) => {
    const room = (lines[i + 1]?.at ?? total) - line.at;
    const needs = Math.max(readSeconds(line.text), MIN_BEAT_SECONDS);
    return needs > room + 0.05 ? [`shot ${line.shot} at ${line.at}s needs ${needs}s, has ${room.toFixed(1)}s: "${line.text}"`] : [];
  });
  console.log(`[demo] voiceover: ${lines.length} lines, first at ${lines[0].at}s`);
  fs.mkdirSync("videos", { recursive: true });
  fs.writeFileSync("videos/voiceover.json", JSON.stringify(lines, null, 2) + "\n");
  const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.round(t % 60)).padStart(2, "0")}`;
  fs.writeFileSync("videos/demo-voiceover.txt", script.map((line) => `${mmss(line.at)}  ${line.text}`).join("\n") + "\n");
  expect(tight, "voiceover lines that run into the next one: trim the line, not the shot").toEqual([]);
  const video = page.video();
  await page.close();
  await video?.saveAs("videos/demo-pass-or-refund.webm");
  if (popup && paypalWindow) await popup.video()?.saveAs("videos/demo-paypal-window.webm");
  fs.writeFileSync("videos/demo-edit.json", JSON.stringify({ size: `${SIZE.width}x${SIZE.height}`, videos: { main: "videos/demo-pass-or-refund.webm", popup: "videos/demo-paypal-window.webm" }, parts }, null, 2));
});
