/**
 * APP-OWNED: the agents this app exposes at POST /api/agent/runs { agentId }.
 * None. The one agent (refund-agent.ts) is started by lib/course/refund.ts once the policy says a
 * refund is due, bound to that enrollment. Nobody can start it from outside with their own goal.
 */
import type { AgentDefinition } from "@/lib/agent/define";

export const AGENTS: Record<string, AgentDefinition> = {};
