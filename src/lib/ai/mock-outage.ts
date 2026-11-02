/**
 * Mock AI only: lets the browser suite switch the model off, because mock mode has no real model
 * to lose. Only POST /api/dev/mock/ai-outage sets it, and that route answers on mock PayPal alone.
 */
import { singleton } from "../singleton";
import { AiCreditError } from "./errors";

export type AiOutage = "down" | "credit" | null;

const outage = () => singleton("ai:mock-outage", () => ({ mode: null as AiOutage }));

export function setMockOutage(mode: AiOutage) {
  outage().mode = mode;
}

export function assertNoMockOutage() {
  const { mode } = outage();
  if (mode === "credit") throw new AiCreditError();
  if (mode === "down") throw new Error("529 The model is overloaded.");
}
