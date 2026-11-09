/** A learner's name and answers reach only their own browser and the course team; anyone else with the id gets status and scores. */
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { createEnrollment, saveEnrollment, viewEnrollment } from "@/lib/course/enrollments";
import { LEARNER_COOKIE, canSeeLearner, learnerCookie, limitedView, ownsEnrollment, viewFor, withOwnerKey } from "@/lib/course/learner-access";
import { SAMPLE_PASS_ID } from "@/lib/course/sample-ids";
import { teamCookie } from "@/lib/course/team-access";
import type { Attempt } from "@/lib/course/types";

const req = (cookie = "") => new NextRequest("http://localhost/api/enrollments/x", { headers: cookie ? { cookie } : {} });
/** "name=value" from a Set-Cookie line. */
const pair = (setCookie: string) => setCookie.split(";")[0];

function learnerWithAnswers(name: string) {
  const e = createEnrollment(name, `${name.replace(" ", ".").toLowerCase()}.${Date.now()}@example.com`);
  const attempt = { number: 1, submittedAt: new Date().toISOString(), answers: { q1: "My secret words about the burr" }, reviewedStudyList: false, outcome: "fail", score: 45, runs: [], shownRun: 0, flagged: false, injectionQuote: "", costUsd: 0 } as unknown as Attempt;
  return saveEnrollment({ ...e, status: "active", attempts: [attempt] });
}

describe("who reads a learner's record", () => {
  it("every purchase gets an owner key, and no view ever carries it", () => {
    const e = learnerWithAnswers("Kim Key");
    expect(e.ownerKey).toMatch(/^[0-9a-f]{32}$/);
    expect(JSON.stringify(viewEnrollment(e))).not.toContain(e.ownerKey!);
  });

  it("the browser holding the purchase's cookie reads it in full", () => {
    const e = learnerWithAnswers("Olu Owner");
    const cookie = pair(learnerCookie(req(), e)!);
    expect(cookie.startsWith(`${LEARNER_COOKIE}=`)).toBe(true);
    expect(ownsEnrollment(req(cookie), e)).toBe(true);
    const view = viewFor(req(cookie), e);
    expect(view).toMatchObject({ learnerName: "Olu Owner" });
    expect(JSON.stringify(view)).toContain("My secret words");
  });

  it("anyone else with the id gets status and scores only: no name, no answers", () => {
    const e = learnerWithAnswers("Sia Stranger");
    const other = learnerWithAnswers("Other Buyer");
    for (const cookie of ["", pair(learnerCookie(req(), other)!), `${LEARNER_COOKIE}=${e.id}.${"0".repeat(32)}`]) {
      const view = viewFor(req(cookie), e);
      expect(view).toEqual({ id: e.id, limited: true, status: "active", courseId: undefined, attempts: [{ number: 1, score: 45, outcome: "fail", flagged: false }] });
      expect(JSON.stringify(view)).not.toMatch(/Sia|Stranger|secret|example\.com/);
    }
  });

  it("the course team reads it in full, and the made-up sample learner is public", () => {
    const e = learnerWithAnswers("Tom Team");
    expect(viewFor(req(pair(teamCookie(false))), e)).toMatchObject({ learnerName: "Tom Team" });
    expect(canSeeLearner(req(), { id: SAMPLE_PASS_ID })).toBe(true);
  });

  it("one browser keeps all its purchases, newest first, up to 20", () => {
    let cookie = "";
    const bought = Array.from({ length: 22 }, (_, i) => learnerWithAnswers(`Buyer ${i}`));
    for (const e of bought) cookie = pair(learnerCookie(req(cookie), e)!);
    expect(ownsEnrollment(req(cookie), bought.at(-1)!)).toBe(true);
    expect(ownsEnrollment(req(cookie), bought[2])).toBe(true);
    expect(ownsEnrollment(req(cookie), bought[0])).toBe(false);
    // Buying the same one again doesn't add it twice.
    const again = pair(learnerCookie(req(cookie), bought[5])!);
    expect(again.split(bought[5].id).length - 1).toBe(1);
  });

  it("a purchase from before owner keys gets one when its buyer carries on with it", () => {
    const e = learnerWithAnswers("Old Purchase");
    const legacy = saveEnrollment({ ...e, ownerKey: undefined });
    expect(learnerCookie(req(), legacy)).toBeNull();
    expect(viewFor(req(), legacy)).toMatchObject({ limited: true });
    const keyed = withOwnerKey(legacy);
    expect(keyed.ownerKey).toMatch(/^[0-9a-f]{32}$/);
    expect(viewFor(req(pair(learnerCookie(req(), keyed)!)), keyed)).toMatchObject({ learnerName: "Old Purchase" });
  });

  it("the limited view is built from the scores alone", () => {
    expect(limitedView({ id: "en_x", status: "refunded", courseId: "cc_0123456789ab", attempts: [] })).toEqual({ id: "en_x", limited: true, status: "refunded", courseId: "cc_0123456789ab", attempts: [] });
  });
});

describe("the learner's own actions", () => {
  it("need the learner's browser or the course team", async () => {
    const { requireLearnerAction } = await import("@/lib/course/learner-access");
    const e = learnerWithAnswers("Ada Action");
    expect(() => requireLearnerAction(req(), e.id)).toThrow(/learner's own browser/);
    expect(() => requireLearnerAction(req(pair(learnerCookie(req(), e)!)), e.id)).not.toThrow();
    expect(() => requireLearnerAction(req(pair(teamCookie(false))), e.id)).not.toThrow();
  });
});
