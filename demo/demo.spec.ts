/**
 * DEMO VIDEO (npm run demo:record, then npm run demo:edit). The story: a learner buys with the
 * guarantee in view, pays in PayPal's own window, writes a weak answer, fails twice, a person
 * approves, and PayPal pays them back. Recorded on the sandbox with live grading for the
 * submission (DEMO_PAYPAL_MODE=sandbox DEMO_AI_MODE=live). demo:edit drops the grading waits and
 * splices PayPal's window in; the edited cut stays under 3:00.
 */
import fs from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { payInPayPalWindow } from "../tests/e2e/paypal-popup";
import { caption, centre, DemoClock, DemoCuts, highlight } from "./captions";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const WEAK_ANSWER = "Honing sharpens the knife. Her brother is right, she should hone it for longer every Sunday.";

/** A full-screen card made of plain HTML, for the beats that aren't on this learner's path. */
async function card(page: Page, html: string, ms: number, background = "#f4f4f5") {
  await page.evaluate(
    ({ html, background }) => {
      const el = document.createElement("div");
      el.id = "__demo_card";
      el.innerHTML = html;
      Object.assign(el.style, { position: "fixed", inset: "0", zIndex: "2147483646", display: "flex", alignItems: "center", justifyContent: "center", padding: "48px 48px 160px", background, opacity: "0", transition: "opacity .4s", font: "16px/1.5 ui-sans-serif, system-ui, sans-serif" });
      document.body.appendChild(el);
      requestAnimationFrame(() => (el.style.opacity = "1"));
    },
    { html, background },
  );
  await sleep(ms);
  await page.evaluate(() => {
    const el = document.getElementById("__demo_card");
    if (el) {
      el.style.opacity = "0";
      setTimeout(() => el.remove(), 400);
    }
  });
  await sleep(450);
}

/** What a 69 looks like to both sides. The words are the app's own (learner-screen.tsx, team-screen.tsx). */
const REVIEW_CARD = `
<div style="display:grid;grid-template-columns:1fr 1fr;gap:28px;max-width:1120px;width:100%">
  <div style="grid-column:1/3;text-align:center;font:700 40px/1.2 ui-sans-serif,system-ui;color:#09090b;letter-spacing:-.01em">A score of 69 or 70 goes to a person</div>
  <div style="background:#fff;border:1px solid #e4e4e7;border-radius:18px;padding:24px">
    <div style="font:600 13px ui-sans-serif;text-transform:uppercase;letter-spacing:.06em;color:#4338ca">The learner sees</div>
    <div style="margin-top:12px;background:#f4f4f5;border-radius:12px;padding:16px;color:#3f3f46;font-size:18px"><b style="color:#09090b">Under review, answer within one business day.</b> Your score sits right at the pass mark, so a person will look at it. No refund yet.</div>
  </div>
  <div style="background:#fff;border:1px solid #e4e4e7;border-radius:18px;padding:24px">
    <div style="font:600 13px ui-sans-serif;text-transform:uppercase;letter-spacing:.06em;color:#4338ca">The course team sees</div>
    <div style="margin-top:12px;background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:16px;color:#3f3f46;font-size:18px"><b style="color:#09090b">Attempt 2 landed on 69, too close for the grader to call.</b> Three grades: 68, 69, 71. The middle one counts. Check each item that lost points, then decide.
      <div style="margin-top:10px;font-size:16px">&#9744; Says the burr must run heel to tip<br>&#9744; Says when the stone is ready</div>
    </div>
  </div>
</div>`;

test("demo", async ({ page, request }) => {
  test.setTimeout(420_000);
  const cuts = new DemoCuts();
  const clock = new DemoClock(330);
  const status = await (await request.get("/api/kit/status")).json();
  const sandbox = status.paypal.mode === "sandbox";
  let popup: Page | undefined;

  // 1. The guarantee beside the buy button
  // ?test-card=1 keeps the server-side test card as a fallback, if PayPal's window fails to load.
  await page.goto("/course?test-card=1");
  const guarantee = page.getByTestId("guarantee");
  await guarantee.waitFor();
  if (sandbox) await page.getByTestId("paypal-v6-button").locator("paypal-button, button, [role=button]").first().waitFor({ timeout: 60_000 });
  await sleep(600);
  await highlight(page, guarantee, 3000);
  await caption(page, "A $49 course with a guarantee next to the buy button: fail twice, get every cent back.");
  await page.getByTestId("learner-name").pressSequentially("Jordan Lee", { delay: 50 });
  await page.getByTestId("learner-email").fill(`jordan.lee.${Date.now()}@example.com`);
  clock.check("guarantee");

  // 2. Paying in PayPal's own window with the sandbox test card
  let paypalWindow = sandbox;
  if (sandbox) {
    popup = await payInPayPalWindow(page, {
      typeDelayMs: 45,
      onOpen: async () => {
        cuts.insert("popup");
      },
      onForm: async (p) => {
        await caption(p, "PayPal's own checkout window, paying with the sandbox test card.", { wait: false, ms: 9000 });
      },
    }).catch(async (e) => {
      // Reported, not hidden: the run logs it and the cut has no PayPal window.
      console.log(`[demo] PayPal window failed, paying with the server-side test card: ${(e as Error).message.split("\n")[0]}`);
      paypalWindow = false;
      cuts.parts.splice(-1, 1);
      for (const p of page.context().pages()) if (p !== page) await p.close().catch(() => undefined);
      cuts.resume();
      await page.getByTestId("sandbox-test-card").click();
      return undefined;
    });
  } else {
    await page.getByTestId("simulate-paypal-approval").click();
    await page.getByTestId("mock-approve").click();
  }
  await page.waitForURL(/\/learn\/en_/, { timeout: 90_000 });
  await page.getByTestId("submit-attempt").waitFor();
  if (paypalWindow) cuts.resume();
  await caption(page, "Paid. PayPal captured $49.00, and every call shows on the timeline.", { ms: 3200 });
  clock.check("bought");

  // 3. The learner writes a weak answer
  await page.getByTestId("sample-fail1").click();
  const answer = page.getByTestId("answer-q1");
  await centre(answer);
  await caption(page, "Jordan answers the final check in their own words.", { wait: false, ms: 6000 });
  await answer.fill("");
  await answer.pressSequentially(WEAK_ANSWER, { delay: 28 });
  await sleep(600);
  await page.getByTestId("submit-attempt").click();
  await sleep(500);
  cuts.pause(1.0);
  await page.getByTestId("attempt-1").waitFor({ timeout: 150_000 });
  cuts.resume();
  clock.check("first answer");

  // 4. One question graded with its quote, then the score and the study list
  const question = page.getByTestId("question-1-q1");
  await centre(question);
  await highlight(page, question, 2500);
  await caption(page, "Claude Sonnet 5.5 marks each rubric item and quotes Jordan's own words.");
  const score = page.getByTestId("score-1");
  await centre(score);
  await highlight(page, score, 2000);
  const firstScore = (await score.innerText()).split("/")[0].trim();
  await caption(page, `Code adds up the points: ${firstScore} out of 100. The pass mark is 70.`, { ms: 3200 });
  const studyItems = page.locator('[data-testid^="study-item-"]');
  if (await studyItems.count()) {
    await centre(studyItems.first());
    await caption(page, "What Jordan missed becomes a study list, each item linked to its lesson.", { wait: false, ms: 5000 });
    for (const item of await studyItems.all()) {
      await item.click();
      await sleep(250);
    }
    await page.getByTestId("mark-reviewed").click();
    await sleep(1500);
  }
  clock.check("first grade");

  // 5. Skip the wait (demo)
  const skip = page.getByTestId("skip-wait");
  await centre(skip);
  await highlight(page, skip, 2200);
  await caption(page, "Attempts are a day apart. For this demo: Skip the wait.", { ms: 3000 });
  await skip.click();
  clock.check("skip");

  // 6. The second fail, in one beat
  await page.getByTestId("sample-fail2").click();
  await centre(page.getByTestId("submit-attempt"));
  await page.getByTestId("submit-attempt").click();
  await sleep(500);
  cuts.pause(0.8);
  await page.getByTestId("refund-waiting").waitFor({ timeout: 150_000 });
  cuts.resume();
  const secondScore = (await page.getByTestId("score-2").innerText()).split("/")[0].trim();
  await centre(page.getByTestId("refund-waiting"));
  await highlight(page, page.getByTestId("refund-waiting"), 2500);
  await caption(page, `Second honest try: ${secondScore}. The refund is due, and no money moves until a person says yes.`);
  clock.check("second fail");

  // 7. The 69/70 rule, for 5 seconds
  await card(page, REVIEW_CARD, 5000);
  clock.check("review card");

  // 8. The course team approves
  await page.getByTestId("refund-waiting").getByRole("link").click();
  const approve = page.getByTestId("approve-button").first();
  cuts.pause(0.8);
  await approve.waitFor({ timeout: 90_000 });
  cuts.resume();
  await centre(approve);
  await highlight(page, page.getByTestId("approval-reasons").first(), 2500);
  await caption(page, "The refund agent checks the policy and proposes the refund. A person approves it.");
  await approve.click();
  cuts.pause(1.0);
  await expect(page.getByText("Refunded", { exact: true }).first()).toBeVisible({ timeout: 90_000 });
  cuts.resume();
  clock.check("approved");

  // 9. The refund, read back from PayPal
  await page.getByTestId("learner-link").first().click();
  await page.getByTestId("refund-issued").waitFor();
  const refundStatus = page.getByTestId("refund-status");
  cuts.pause(0.5);
  await expect(refundStatus).toHaveText(/COMPLETED|PENDING/, { timeout: 60_000 });
  await expect(page.getByTestId("refund-issued")).toContainText("Read back from PayPal", { timeout: 30_000 });
  cuts.resume();
  await expect(refundStatus, "a PENDING refund fails the demo: see the README on seller balance").toHaveText("COMPLETED");
  const refundId = await page.getByTestId("refund-id").innerText();
  const amount = await page.getByTestId("refund-amount").innerText();
  await centre(page.getByTestId("refund-issued"));
  await highlight(page, refundStatus, 2500);
  await caption(page, `${amount} back to Jordan. PayPal reports the refund COMPLETED.`);
  clock.check("refunded");

  // 10. Close
  await card(
    page,
    `<div style="text-align:center;color:#fff">
      <div style="font:600 18px ui-sans-serif;letter-spacing:.12em;text-transform:uppercase;opacity:.7">Pass or Refund</div>
      <div style="margin-top:22px;font:700 54px/1.15 ui-sans-serif,system-ui;letter-spacing:-.02em">Courses that pay you back<br>if they can&rsquo;t teach you.</div>
      <div style="margin-top:34px;display:flex;gap:16px;justify-content:center;font:500 22px ui-sans-serif">
        <span style="background:rgba(255,255,255,.12);border-radius:999px;padding:10px 20px">Paid ${amount} with PayPal</span>
        <span style="background:rgba(255,255,255,.12);border-radius:999px;padding:10px 20px">Graded by Claude: ${firstScore}, then ${secondScore}</span>
        <span style="background:rgba(255,255,255,.12);border-radius:999px;padding:10px 20px">Refund ${refundId} COMPLETED</span>
      </div>
      <div style="margin-top:30px;font:500 18px ui-sans-serif;opacity:.65">PayPal sandbox &middot; Claude Sonnet 5.5 &middot; built with Claude Code</div>
    </div>`,
    5000,
    "radial-gradient(ellipse at top, #4338ca, #0b1020 70%)",
  );
  clock.check("end");

  fs.mkdirSync("videos", { recursive: true });
  const parts = cuts.finish();
  const video = page.video();
  await page.close();
  await video?.saveAs("videos/demo-pass-or-refund.webm");
  if (popup && paypalWindow) await popup.video()?.saveAs("videos/demo-paypal-window.webm");
  fs.writeFileSync("videos/demo-edit.json", JSON.stringify({ videos: { main: "videos/demo-pass-or-refund.webm", popup: "videos/demo-paypal-window.webm" }, parts }, null, 2));
});
