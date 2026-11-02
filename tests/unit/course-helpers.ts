import { markStudyListReviewed, skipAttemptGap, tickStudyItem } from "@/lib/course/attempts";
import { requireEnrollment } from "@/lib/course/enrollments";
import { missedItems } from "@/lib/course/policy";

/** Ticks off every item on the study list, then marks it reviewed. */
export function reviewStudyList(id: string) {
  const latest = requireEnrollment(id).attempts.at(-1)!;
  for (const item of missedItems(latest)) tickStudyItem(id, item.id);
  return markStudyListReviewed(id);
}

/** What a judge does between attempts: work through the list and skip the wait. */
export function readyForNextAttempt(id: string) {
  reviewStudyList(id);
  return skipAttemptGap(id);
}
