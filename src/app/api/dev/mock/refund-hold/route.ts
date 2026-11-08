import { z } from "zod";
import { readJson, route } from "@/lib/http";
import { getMockPayPal } from "@/lib/paypal";

/**
 * Mock mode only: "hold" keeps new refunds PENDING, as PayPal does when it pays from the seller's
 * bank (ECHECK). "release" settles them, and PayPal's REFUNDED webhook goes out. "off" stops holding.
 */
export const POST = route(
  async (req) => {
    const { action } = await readJson(req, z.object({ action: z.enum(["hold", "release", "off"]) }));
    const mock = getMockPayPal()!;
    if (action === "release") return { released: (await mock.releaseHeldRefunds()).map((r) => r.id) };
    mock.holdRefunds(action === "hold");
    return { holding: action === "hold" };
  },
  { mockOnly: true },
);
