import { z } from "zod";
import { setMockAgentInput } from "@/lib/ai/mock-agent-input";
import { readJson, route } from "@/lib/http";

/** Mock mode only: the next mock refund agent run overruns its note limits, or sends input that can't be fixed. `null` puts it back. */
export const POST = route(
  async (req) => {
    const { mode } = await readJson(req, z.object({ mode: z.enum(["long-notes", "bad-input"]).nullable() }));
    setMockAgentInput(mode);
    return { mode };
  },
  { mockOnly: true },
);
