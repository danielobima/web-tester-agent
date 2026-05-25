import { type Checklist } from "../actions";

/**
 * Concrete type for agent conversation history
 */
export type AgentHistoryMessage =
  | {
      role: "user";
      content:
        | string
        | Array<
            | { type: "text"; text: string }
            | { type: "image"; image: Buffer | Uint8Array | string; mimeType?: string }
            | { type: "file"; data: string; mediaType: string }
          >;
    }
  | {
      role: "assistant";
      content: string | Array<{ type: "text"; text: string }>;
    }
  | { role: "system"; content: string };

export type PlanApprovalResult =
  | { action: "accept" }
  | { action: "modify"; checklist: Checklist }
  | { action: "reject" };

export type GoalReachedResult =
  | { action: "validate" }
  | { action: "prompt"; feedback: string }
  | { action: "cancel" };

export type ManualPauseResult =
  | { action: "resume" }
  | { action: "reprompt"; feedback: string }
  | { action: "modify"; checklist: Checklist };

export interface AgentStepUpdate {
  id: string;
  step: string;
  status: "success" | "failed" | "pending";
  duration: string;
  description: string;
  stateDescription?: string;
  error?: string;
  screenshot?: string;
  action?: any;
  issues?: { description: string; severity: string }[];
  url?: string;
}
