import { requireEnrollment } from "@/lib/course/enrollments";
import { gradeReceipt } from "@/lib/course/grade-receipt";
import { requireLearnerOrTeam } from "@/lib/course/learner-access";
import { SAMPLE_PASS_ID } from "@/lib/course/sample-ids";
import { ensureSamplePass } from "@/lib/course/sample-pass";
import { route } from "@/lib/http";

/** The learner's grade receipt, for their own browser and the course team. ?download=1 saves it as a file. */
export const GET = route<RouteContext<"/api/enrollments/[id]/receipt">>(async (req, ctx) => {
  const { id } = await ctx.params;
  const enrollment = id === SAMPLE_PASS_ID ? ensureSamplePass() : requireEnrollment(id);
  // It carries the learner's name and the grader's quotes from their answers.
  requireLearnerOrTeam(req, enrollment);
  const receipt = gradeReceipt(enrollment);
  const disposition = req.nextUrl.searchParams.get("download") ? "attachment" : "inline";
  return new Response(JSON.stringify(receipt, null, 2), {
    headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `${disposition}; filename="grade-receipt-${receipt.enrollmentId}.json"`, "cache-control": "no-store" },
  });
});
