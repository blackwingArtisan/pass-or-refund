import { z } from "zod";
import { creatorCourse } from "@/lib/course/creator-store";
import { restoreIfExample } from "@/lib/course/example-creator-course";
import { learnerCookie, withOwnerKey } from "@/lib/course/learner-access";
import { resumePurchase, startPurchase } from "@/lib/course/purchase";
import { getContext } from "@/lib/events/bus";
import { isTestRun } from "@/lib/course/team-access";
import { readJson, route } from "@/lib/http";

/** A name is shown as typed, so markup like <i>…</i> is taken out rather than shown as text. */
const plainName = z
  .string()
  .max(80)
  .transform((s) => s.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim())
  .pipe(z.string().min(1));

const Body = z.object({ learnerName: plainName, learnerEmail: z.email().max(200), courseId: z.string().regex(/^cc_[0-9a-f]{12}$/).optional() });

/** Opens an enrollment and its PayPal order, unless this learner has already paid. The price comes from the course (the sample, or a creator's courseId), not this request. */
export const POST = route(async (req) => {
  const { learnerName, learnerEmail, courseId } = await readJson(req, Body);
  // A creator's course must exist, with its rubric still matching its link, before anyone pays for it.
  restoreIfExample(courseId);
  if (courseId) creatorCourse(courseId);
  // The browser that starts the purchase holds its owner key, so it alone (and the course team) reads the learner's name and answers.
  const owned = (enrollment: { id: string; ownerKey?: string }, body: object) => {
    const cookie = learnerCookie(req, enrollment);
    return Response.json(body, cookie ? { headers: { "Set-Cookie": cookie } } : undefined);
  };
  const resumed = await resumePurchase(learnerEmail, getContext().channel, courseId);
  if (resumed) {
    const paid = withOwnerKey(resumed);
    return owned(paid, { enrollmentId: paid.id, alreadyPaid: true });
  }
  const { enrollment, orderId } = await startPurchase(learnerName, learnerEmail, { testRun: isTestRun(req), courseId });
  return owned(enrollment, { enrollmentId: enrollment.id, orderId });
});
