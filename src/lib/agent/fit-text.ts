/**
 * A model can overrun a length limit it was told about. For prose a person reads (a summary, a
 * note, a reason), running over shouldn't fail the step: code shortens it before the schema checks
 * it, and the schema's hard limit still holds on what is stored. Only fields named here are
 * shortened, never ids or amounts.
 *
 *   defineTool({ ..., schema: z.object({ team_summary: z.string().max(600) }), fit: fitProse({ team_summary: 600 }) })
 */

/** `max` characters or fewer: whole sentences when they keep most of it, else whole words and "…". */
export function fitText(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const room = t.slice(0, max);
  const sentences = room.match(/^[\s\S]*[.!?](?=\s|$)/)?.[0];
  if (sentences && sentences.length >= max * 0.6) return sentences;
  const words = t.slice(0, max - 1).replace(/\s+\S*$/, "").replace(/[\s,;:–—-]+$/, "");
  return `${words || t.slice(0, max - 1)}…`;
}

/** A prose field's limit, or for a list of prose: each item's limit and how many items to keep. */
export type ProseLimit = number | { each: number; items: number };

/** Shortens the named prose fields of a tool input. Everything else, and anything not text, passes through untouched. */
export function fitProse(limits: Record<string, ProseLimit>) {
  return (raw: unknown): unknown => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
    const out: Record<string, unknown> = { ...(raw as Record<string, unknown>) };
    for (const [field, limit] of Object.entries(limits)) {
      const value = out[field];
      if (typeof limit === "number") {
        if (typeof value === "string") out[field] = fitText(value, limit);
      } else if (Array.isArray(value)) {
        out[field] = value.slice(0, limit.items).map((item) => (typeof item === "string" ? fitText(item, limit.each) : item));
      }
    }
    return out;
  };
}
