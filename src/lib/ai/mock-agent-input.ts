/**
 * Mock AI only: lets the browser suite make the mock refund agent write what a live model once did,
 * once. "long-notes" overruns every note's length limit (the hosted take's ZodError); "bad-input"
 * sends an input no shortening can fix, so the step fails and the timeline shows how. Only
 * POST /api/dev/mock/agent-input sets it, and that route answers on mock PayPal alone.
 */
import { singleton } from "../singleton";

export type MockAgentInput = "long-notes" | "bad-input" | null;

const state = () => singleton("ai:mock-agent-input", () => ({ mode: null as MockAgentInput }));

export function setMockAgentInput(mode: MockAgentInput) {
  state().mode = mode;
}

/** The mode for the next refund agent run, then back to normal. */
export function takeMockAgentInput(): MockAgentInput {
  const { mode } = state();
  state().mode = null;
  return mode;
}
