import { z } from "zod";
import { setMockOutage } from "@/lib/ai/mock-outage";
import { readJson, route } from "@/lib/http";

/** Mock mode only: pretend the model is down or the AI credit has run out. `null` puts it back. */
export const POST = route(
  async (req) => {
    const { mode } = await readJson(req, z.object({ mode: z.enum(["down", "credit"]).nullable() }));
    setMockOutage(mode);
    return { mode };
  },
  { mockOnly: true },
);
