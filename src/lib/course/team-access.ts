/**
 * The course team's pages and APIs sit behind a passcode. It is printed for judges on the landing
 * page, so it keeps crawlers and passers-by out rather than guarding a secret. Server only.
 *
 *   requireTeam(req)   // throws 401 unless the browser entered the passcode
 */
import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { HttpError } from "@/lib/http";

export const TEAM_COOKIE = "por_team";
/** Timeline channels only the course team may follow ("team" carries every learner's PayPal webhooks). */
export const TEAM_ONLY_CHANNELS = ["team"];
/** Set by the browser test suites on the app's own origin, so their learners stay off judges' screens. */
export const TEST_RUN_COOKIE = "por_test_run";

export function teamPasscode(): string {
  return process.env.TEAM_PASSCODE?.trim() || "lena-49";
}

const token = (passcode: string) => createHash("sha256").update(`pass-or-refund team:${passcode}`).digest("hex").slice(0, 32);

export function passcodeMatches(attempt: string): boolean {
  return attempt.trim().toLowerCase() === teamPasscode().toLowerCase();
}

export function teamCookie(secure: boolean) {
  return `${TEAM_COOKIE}=${token(teamPasscode())}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 7}${secure ? "; Secure" : ""}`;
}

export const clearTeamCookie = () => `${TEAM_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;

export function isTeam(req: NextRequest): boolean {
  return req.cookies.get(TEAM_COOKIE)?.value === token(teamPasscode());
}

export function requireTeam(req: NextRequest): void {
  if (!isTeam(req)) throw new HttpError(401, "Enter the course team passcode first. It's in the For judges box on the home page.", "team_only");
}

export function isTestRun(req: NextRequest): boolean {
  return req.cookies.get(TEST_RUN_COOKIE)?.value === "1";
}
