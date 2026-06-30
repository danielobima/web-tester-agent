import { type LanguageModel } from "ai";
import { type AgentHistoryMessage } from "./types";
import { ChecklistSchema, type Checklist } from "../actions";
import { prepareImagePart, getProviderOptions, generateObjectWithTimeout } from "../utils";

export async function planTask(params: {
  model: LanguageModel;
  requirement: string;
  checklist: Checklist;
  snapshot: string;
  history: AgentHistoryMessage[];
  planningPrompt: string;
  screenshot?: Buffer;
  supportsVision?: boolean;
  abortSignal?: AbortSignal;
}): Promise<Checklist> {
  console.log(`[Agent][Planner] Planning...`);
  console.log("[Agent][Planner] Vision enabled", params.supportsVision);
  const planningResult = await generateObjectWithTimeout({
    model: params.model,
    schema: ChecklistSchema,
    system: params.planningPrompt,
    providerOptions: getProviderOptions(params.model),
    messages: [
      ...params.history,
      {
        role: "user",
        content: [
          {
            type: "text" as const,
            text: `Goal: ${params.requirement}\n\nChecklist: ${JSON.stringify(params.checklist, null, 2)}\n\nCurrent State:\n${params.snapshot}`,
          },
          ...(params.screenshot && params.supportsVision
            ? [prepareImagePart(params.screenshot)]
            : []),
        ],
      },
    ],
    temperature: 1,
    abortSignal: params.abortSignal,
  });

  return planningResult.object;
}
