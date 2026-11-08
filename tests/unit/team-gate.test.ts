/** The course team's view: a passcode gate, no emails, and test-suite learners kept off it. */
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { completePurchase, startPurchase } from "@/lib/course/purchase";
import { listEnrollments, viewEnrollment } from "@/lib/course/enrollments";
import { isTeam, isTestRun, passcodeMatches, requireTeam, teamCookie, teamPasscode, TEST_RUN_COOKIE } from "@/lib/course/team-access";
import { actionWords, actorWords, toolWords } from "@/lib/course/words";
import { withoutEmails } from "@/lib/http";
import { getMockPayPal } from "@/lib/paypal";

const request = (cookie = "") => new NextRequest("http://localhost/api/team", { headers: cookie ? { cookie } : {} });
const cookiePart = (setCookie: string) => setCookie.split(";")[0];

let learners = 0;
async function buy(opts: { testRun?: boolean } = {}) {
  const email = `gate${++learners}.${Date.now()}@example.com`;
  const { enrollment, orderId } = await startPurchase("Gita Gate", email, opts);
  getMockPayPal()!.simulateBuyerApproval(orderId, { email: `paypal.${email}` });
  return { enrollment: await completePurchase(enrollment.id, orderId, "test"), email };
}

describe("the team passcode", () => {
  it("lets in only a browser that entered it", () => {
    expect(passcodeMatches(teamPasscode())).toBe(true);
    expect(passcodeMatches(` ${teamPasscode().toUpperCase()} `)).toBe(true);
    expect(passcodeMatches("guess")).toBe(false);
    expect(isTeam(request())).toBe(false);
    expect(isTeam(request("por_team=forged"))).toBe(false);
    expect(isTeam(request(cookiePart(teamCookie(false))))).toBe(true);
    expect(() => requireTeam(request())).toThrow(/passcode/);
    expect(teamCookie(true)).toMatch(/HttpOnly.*SameSite=Lax.*Secure/);
  });
});

describe("what the course team's list shows", () => {
  it("never carries a learner's email", async () => {
    const { enrollment, email } = await buy();
    const view = viewEnrollment(enrollment);
    expect(view).not.toHaveProperty("learnerEmail");
    expect(JSON.stringify(view)).not.toContain(email);
    expect(JSON.stringify(listEnrollments())).not.toMatch(/@example\.com/);
  });

  it("leaves out learners a test suite bought, unless the viewer is a test run", async () => {
    const { enrollment: real } = await buy();
    const { enrollment: test } = await buy({ testRun: true });
    const shown = listEnrollments().map((e) => e.id);
    expect(shown).toContain(real.id);
    expect(shown).not.toContain(test.id);
    expect(listEnrollments({ includeTestRuns: true }).map((e) => e.id)).toContain(test.id);
    expect(isTestRun(request(`${TEST_RUN_COOKIE}=1`))).toBe(true);
    expect(isTestRun(request())).toBe(false);
  });

  it("hides every email address in what goes to a screen", () => {
    expect(withoutEmails({ a: "pay ada.l+x@example.co.uk now", b: [{ email_address: "sb-1@personal.example.com" }], n: 3 })).toEqual({ a: "pay (email hidden) now", b: [{ email_address: "(email hidden)" }], n: 3 });
  });
});

describe("plain words", () => {
  it("names tools, steps and people the way a person would", () => {
    expect(toolWords("refund_course_purchase")).toBe("Refund the course");
    expect(toolWords("capture_course_payment")).toBe("Take the course payment");
    expect(toolWords("some_new_tool")).toBe("some new tool");
    expect(actionWords("tool.requested")).toBe("Asked to");
    expect(actionWords("approval.approved")).toBe("Approved");
    expect(actorWords("agent:refund-agent")).toBe("Refund agent (AI)");
    expect(actorWords("course team")).toBe("Course team");
    expect(actorWords("webhook")).toBe("PayPal");
  });
});
