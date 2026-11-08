import { describe, expect, it } from "vitest";
import { plainMessage } from "@/lib/plain-message";

describe("error text in plain words", () => {
  it("drops PayPal issue codes", () => {
    expect(plainMessage(new Error("The payment didn't go through: The card was declined. [INSTRUMENT_DECLINED]"))).toBe("The payment didn't go through: The card was declined.");
  });

  it("turns a timestamp into a day and time", () => {
    expect(plainMessage("Your next attempt opens at 2026-11-09T17:06:38.711Z.", "America/Chicago")).toBe("Your next attempt opens at Monday 11:06 AM.");
  });

  it("never shows a bare status code or a browser network error", () => {
    expect(plainMessage(new Error("Request failed (500)"))).toBe("Something went wrong. Please try again.");
    expect(plainMessage(new TypeError("Failed to fetch"))).toBe("Something went wrong. Please try again.");
    expect(plainMessage(undefined)).toBe("Something went wrong. Please try again.");
  });

  it("leaves a plain message alone", () => {
    expect(plainMessage(new Error("Answer at least one question first."))).toBe("Answer at least one question first.");
  });
});
