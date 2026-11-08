/** The guarantee's terms can't move after purchase, and a learner can contest one line once. */
import { describe, expect, it } from "vitest";
import { getAuditLog } from "@/lib/agent/audit";
import { submitAttempt } from "@/lib/course/attempts";
import { rubric } from "@/lib/course/content";
import { contestLine, ruleOnContest } from "@/lib/course/contest";
import { requireEnrollment, saveEnrollment } from "@/lib/course/enrollments";
import { shortfallItems } from "@/lib/course/policy";
import { completePurchase, startPurchase } from "@/lib/course/purchase";
import { rubricFingerprint, rubricOnSale } from "@/lib/course/rubric-lock";
import { samples } from "@/lib/course/samples";
import type { GradeRun } from "@/lib/course/types";
import { scoreItems, type Rubric, type Verdict } from "@/lib/grading/frozen/score-items";
import type { GradeOnce } from "@/lib/grading/grade";
import { getMockPayPal } from "@/lib/paypal";
import { readyForNextAttempt } from "./course-helpers";

let learners = 0;
async function buy() {
  const email = `rubric${++learners}.${Date.now()}@example.com`;
  const { enrollment, orderId } = await startPurchase("Rhea Rubric", email);
  getMockPayPal()!.simulateBuyerApproval(orderId, { email: `paypal.${email}` });
  return completePurchase(enrollment.id, orderId, "test");
}

/** A grade with these lines missed and everything else met, added up by the sealed scoring code. */
function gradeMissing(missed: string[], seen: Rubric[] = []): GradeOnce {
  return async (answers, _run, _label, used = rubric) => {
    seen.push(used);
    const items = used.questions.flatMap((q) => q.items.map((item) => ({ id: item.id, verdict: (missed.includes(item.id) ? "not_met" : "met") as Verdict, quote: missed.includes(item.id) ? "" : (answers[q.id] ?? "").slice(0, 20) })));
    const caps = used.questions.flatMap((q) => q.caps.map((cap) => ({ id: cap.id, triggered: false, quote: "" })));
    const scored = scoreItems(used, answers, items, caps);
    return { total: scored.total, totalQuoteChecked: scored.totalQuoteChecked, perQuestion: scored.perQuestion, items: scored.items, caps, injectionAttempted: false, injectionQuote: "", mocked: true, costUsd: 0 } satisfies GradeRun;
  };
}

/** Lines to miss so the attempt fails at 59-65, with q1c (11 points) among them: upholding q1c passes it. */
function nearPass(): string[] {
  const all = rubric.questions.flatMap((q) => q.items);
  const missed = ["q1c"];
  let total = 100 - 11;
  for (const item of all) {
    if (total <= 65) break;
    if (item.id === "q1c" || total - item.points < 59) continue;
    missed.push(item.id);
    total -= item.points;
  }
  expect(total).toBeLessThanOrEqual(65);
  expect(total + 11).toBeGreaterThanOrEqual(rubric.passMark);
  return missed;
}

describe("the rubric locked at purchase", () => {
  it("is on the enrollment from the moment the learner buys, with the fingerprint of the text", async () => {
    const enrollment = await buy();
    expect(enrollment.rubric).toMatchObject({ version: "1", fingerprint: rubricFingerprint(rubric) });
    expect(enrollment.rubric!.fingerprint).toMatch(/^[0-9a-f]{12}$/);
    expect(rubricOnSale()).toEqual({ version: "1", fingerprint: enrollment.rubric!.fingerprint });
    // One changed word changes the fingerprint.
    const edited = structuredClone(rubric);
    edited.questions[0].items[0].text += " firmly";
    expect(rubricFingerprint(edited)).not.toBe(enrollment.rubric!.fingerprint);
  });

  it("is what grading uses, and grading stops rather than use a rubric that no longer matches", async () => {
    const enrollment = await buy();
    const seen: Rubric[] = [];
    await submitAttempt(enrollment.id, samples.fail1, "test", gradeMissing(["q1a"], seen));
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((r) => rubricFingerprint(r) === enrollment.rubric!.fingerprint)).toBe(true);

    const other = await buy();
    saveEnrollment({ ...other, rubric: { ...other.rubric!, fingerprint: "000000000000" } });
    await expect(submitAttempt(other.id, samples.fail1, "test", gradeMissing([]))).rejects.toThrow(/no longer matches/);
    expect(requireEnrollment(other.id).attempts).toHaveLength(0);
  });
});

describe("contesting one rubric line", () => {
  it("upheld: the line counts as met, code adds it up again, and a pass gets the certificate", async () => {
    const enrollment = await buy();
    const missed = nearPass();
    await submitAttempt(enrollment.id, samples.fail1, "test", gradeMissing(missed));
    const before = requireEnrollment(enrollment.id).attempts[0];
    expect(before.outcome).toBe("fail");

    const met = rubric.questions.flatMap((q) => q.items).find((item) => !missed.includes(item.id))!.id;
    await expect(async () => contestLine(enrollment.id, met, "It was met")).rejects.toThrow(/lost points/);
    const contested = contestLine(enrollment.id, "q1c", "I wrote that the edge is worn and needs the stone.");
    expect(contested.contest).toMatchObject({ attempt: 1, itemId: "q1c" });
    await expect(async () => contestLine(enrollment.id, "q1c", "again")).rejects.toThrow(/already contested/);

    const ruled = ruleOnContest(enrollment.id, { upheld: true, note: "Your second sentence says exactly that.", by: "course team" });
    expect(ruled.contest!.ruling).toMatchObject({ upheld: true, scoreBefore: before.score, scoreAfter: before.score + 11 });
    expect(ruled.attempts[0]).toMatchObject({ score: before.score + 11, outcome: "pass" });
    expect(ruled.attempts[0].runs[ruled.attempts[0].shownRun].items.find((i) => i.id === "q1c")!.verdict).toBe("met");
    expect(ruled.status).toBe("passed");
    expect(getAuditLog().list({ limit: 5 }).some((e) => e.action === "contest.ruled" && e.reason?.includes("Upheld"))).toBe(true);
    await expect(async () => ruleOnContest(enrollment.id, { upheld: false, note: "x", by: "course team" })).rejects.toThrow(/no contest waiting/);
  });

  it("not upheld: the grade stands and the learner reads why", async () => {
    const enrollment = await buy();
    await submitAttempt(enrollment.id, samples.fail1, "test", gradeMissing(["q1a", "q1b", "q1c", "q2a", "q2b"]));
    const score = requireEnrollment(enrollment.id).attempts[0].score;
    const line = shortfallItems(requireEnrollment(enrollment.id).attempts[0])[0].id;
    contestLine(enrollment.id, line, "I think I covered it.");
    const ruled = ruleOnContest(enrollment.id, { upheld: false, note: "The answer doesn't say why.", by: "course team" });
    expect(ruled.contest!.ruling).toMatchObject({ upheld: false, scoreBefore: score, scoreAfter: score, note: "The answer doesn't say why." });
    expect(ruled.attempts[0].score).toBe(score);
    expect(ruled.status).toBe("active");
  });

  it("is withdrawn by taking the retake first, and can't be made on a second attempt", async () => {
    const enrollment = await buy();
    await submitAttempt(enrollment.id, samples.fail1, "test", gradeMissing(["q1a", "q1b", "q1c", "q2a", "q2b"]));
    contestLine(enrollment.id, "q1a", "I said it pushes the edge back.");
    readyForNextAttempt(enrollment.id);
    await submitAttempt(enrollment.id, samples.fail2, "test", gradeMissing(["q1a", "q1b", "q1c", "q2a", "q2b"]));
    const after = requireEnrollment(enrollment.id);
    expect(after.contest!.withdrawnAt).toBeTruthy();
    expect(() => ruleOnContest(enrollment.id, { upheld: true, note: "x", by: "course team" })).toThrow(/no contest waiting/);
  });
});
