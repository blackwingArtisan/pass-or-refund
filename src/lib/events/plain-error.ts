/**
 * The one line a failed step shows on the timeline. Raw error text (a ZodError's JSON, a stack of
 * issues) goes under Details; the line on top is always plain words. Safe in the browser.
 */
import { plainMessage } from "../plain-message";

export const INPUT_DIDNT_FIT = "The agent's input didn't fit this tool, so nothing ran. The agent was told why.";
const GENERIC = "This step didn't go through.";

/** True when the text is machine output a person shouldn't have to read: JSON, or a validation dump. */
export function looksRaw(text: string): boolean {
  const t = text.trim();
  return /^[[{]/.test(t) || /"(code|path|expected|origin)"\s*:/.test(t) || /\bZodError\b|\btoo_big\b|\btoo_small\b|\binvalid_type\b/.test(t);
}

export function plainStepError(error: { name?: string; message?: string; issue?: string } | undefined): string {
  if (!error) return GENERIC;
  const message = error.message ?? "";
  if (error.name === "ZodError" || looksRaw(message)) return INPUT_DIDNT_FIT;
  const plain = plainMessage(message);
  const firstLine = plain.split("\n")[0].trim();
  if (!firstLine || plain === "Something went wrong. Please try again.") return GENERIC;
  return firstLine.length > 220 ? `${firstLine.slice(0, 219).replace(/\s+\S*$/, "")}…` : firstLine;
}
