import { z } from "zod";
import { clearTeamCookie, isTeam, passcodeMatches, teamCookie } from "@/lib/course/team-access";
import { HttpError, readJson, route } from "@/lib/http";

const Body = z.object({ passcode: z.string().max(100) });

/** Is this browser signed in as the course team? */
export const GET = route(async (req) => ({ team: isTeam(req) }));

/** Enter the passcode. A cookie keeps the browser signed in for a week. */
export const POST = route(async (req) => {
  const { passcode } = await readJson(req, Body);
  if (!passcodeMatches(passcode)) throw new HttpError(401, "That passcode isn't right. It's in the For judges box on the home page.", "wrong_passcode");
  return Response.json({ team: true }, { headers: { "Set-Cookie": teamCookie(req.nextUrl.protocol === "https:" || req.headers.get("x-forwarded-proto") === "https") } });
});

export const DELETE = route(async () => Response.json({ team: false }, { headers: { "Set-Cookie": clearTeamCookie() } }));
