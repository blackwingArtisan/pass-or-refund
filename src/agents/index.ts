/**
 * APP-OWNED: the agents this app exposes at POST /api/agent/runs { agentId }.
 * This app has none. Grading is one structured call, and its money steps run as guarded tools from
 * code that policy triggers, so no model can decide to move money.
 */
import type { AgentDefinition } from "@/lib/agent/define";

export const AGENTS: Record<string, AgentDefinition> = {};
