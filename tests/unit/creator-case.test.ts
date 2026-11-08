import { describe, expect, it } from "vitest";
import { COURSE_PRICE_CENTS } from "@/lib/course/content";
import { creatorCase, GRADE_COST_USD } from "@/lib/course/creator-case";
import { isCourseEvent, isCourseStep } from "@/lib/course/scope";

describe("the creator's numbers", () => {
  it("come from the sample cohort and the price, worked out by code", () => {
    const c = creatorCase();
    expect(c.learners).toBe(36);
    expect(c.refundRate).toBeCloseTo(c.refunds / c.learners);
    expect(c.priceCents).toBe(COURSE_PRICE_CENTS);
    expect(c.gradeCostUsd).toBe(GRADE_COST_USD);
    // Refunds take a share of the price, and grading costs a few cents on top.
    const afterRefunds = COURSE_PRICE_CENTS * (1 - c.refundRate);
    expect(c.keptPerSaleCents).toBeLessThan(afterRefunds);
    expect(c.keptPerSaleCents).toBeGreaterThan(afterRefunds - 10);
  });

  it("are the same on every build", () => {
    expect(creatorCase()).toEqual(creatorCase());
  });
});

describe("what counts as the course's own on a shared PayPal account", () => {
  it("keeps orders, captures and refunds, and drops the kit's other demos", () => {
    for (const type of ["CHECKOUT.ORDER.APPROVED", "CHECKOUT.ORDER.COMPLETED", "PAYMENT.CAPTURE.COMPLETED", "PAYMENT.CAPTURE.REFUNDED"]) expect(isCourseEvent(type)).toBe(true);
    for (const type of ["PAYMENT.AUTHORIZATION.CREATED", "INVOICING.INVOICE.CREATED", "PAYMENT.PAYOUTSBATCH.SUCCESS", "CUSTOMER.DISPUTE.CREATED"]) expect(isCourseEvent(type)).toBe(false);
  });

  it("shows this tab's own steps and course webhooks on a timeline", () => {
    expect(isCourseStep({ channel: "tab-1", kind: "paypal", title: "orders.create" })).toBe(true);
    expect(isCourseStep({ channel: "global", kind: "paypal", title: "orders.create" })).toBe(false);
    expect(isCourseStep({ channel: "global", kind: "webhook", title: "PAYMENT.CAPTURE.REFUNDED" })).toBe(true);
    expect(isCourseStep({ channel: "global", kind: "webhook", title: "INVOICING.INVOICE.CREATED" })).toBe(false);
  });
});
