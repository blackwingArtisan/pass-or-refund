import { rubricText, rubricVersion } from "@/lib/course/rubric-lock";
import { HttpError, route } from "@/lib/http";

/**
 * The public rubric, byte for byte what its fingerprint is taken from. The first 12 hex characters
 * of `shasum -a 256` on this download are the fingerprint on every receipt for this version.
 */
export const GET = route<RouteContext<"/api/rubric/[version]">>(async (_req, { params }) => {
  const { version } = await params;
  const found = rubricVersion(version.replace(/\.json$/, "").replace(/^v/, ""));
  if (!found) throw new HttpError(404, "There's no rubric with that version.", "not_found");
  return new Response(rubricText(found.rubric), { headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `inline; filename="rubric-v${found.version}.json"` } });
});
