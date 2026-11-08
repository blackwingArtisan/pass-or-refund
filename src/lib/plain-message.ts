/** Error text a learner can read: no PayPal issue codes, no raw timestamps, no bare status codes. Safe in the browser. */
const FALLBACK = "Something went wrong. Please try again.";
const ISO_TIME = /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?/g;

export function plainMessage(error: unknown, timeZone?: string): string {
  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const text = raw
    .replace(/\s*\[[A-Z0-9_]{3,}\]/g, "")
    .replace(ISO_TIME, (iso) => {
      const at = new Date(iso);
      return Number.isNaN(at.getTime()) ? iso : at.toLocaleString("en-US", { weekday: "long", hour: "numeric", minute: "2-digit", timeZone });
    })
    .trim();
  if (!text || /^Request failed \(\d+\)$/.test(text) || /^(Failed to fetch|NetworkError|Load failed)/i.test(text)) return FALLBACK;
  return text;
}
