import { passcodeMatches, teamCookie } from "@/lib/course/team-access";
import { route } from "@/lib/http";

/**
 * The "Open the course team view" button in the home page's For judges box. A plain form post
 * with the printed passcode: it signs this browser in as the course team and lands on /team, so a
 * judge gets there in one click. A POST, so a crawler following links never signs in. Anyone
 * else still needs the passcode for /api/team, as before.
 */
export const POST = route(async (req) => {
  const form = await req.formData().catch(() => null);
  const passcode = String(form?.get("passcode") ?? "").slice(0, 100);
  if (!passcodeMatches(passcode)) return new Response(null, { status: 303, headers: { Location: "/team" } });
  const secure = req.nextUrl.protocol === "https:" || req.headers.get("x-forwarded-proto") === "https";
  return new Response(null, { status: 303, headers: { Location: "/team", "Set-Cookie": teamCookie(secure) } });
});
