/**
 * The longest each piece of the refund agent's writing may be. The tool schemas enforce them, the
 * agent's prompt states them, and fitProse() shortens anything over, so an over-long summary never
 * fails the step.
 */
import { fitProse } from "@/lib/agent/fit-text";

export const NOTE_LIMITS = {
  reasons: { each: 240, items: 5 },
  reason: 300,
  team_summary: 600,
  learner_note: 500,
} as const;

/** What the prompt asks for: comfortably under the hard limit, so shortening is rare. */
export const NOTE_TARGETS = { reasons: 160, reason: 200, team_summary: 400, learner_note: 350 } as const;

export const fitNotes = fitProse(NOTE_LIMITS);
