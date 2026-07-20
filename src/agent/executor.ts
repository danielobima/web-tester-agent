import { type LanguageModel } from "ai";
import { type AgentHistoryMessage } from "./types";
import { ExecutionResponseSchema, type Checklist, type ExecutionResponse } from "../actions";
import { TestSerializer } from "../recorder";
import { prepareImagePart, getProviderOptions, generateObjectWithTimeout } from "../utils";
import { type ZodType } from "zod";

export async function executeTask(params: {
  model: LanguageModel;
  requirement: string;
  currentTask: { description: string };
  checklist: Checklist;
  snapshot: string;
  history: AgentHistoryMessage[];
  executionPromptTemplate: string;
  screenshot?: Buffer;
  supportsVision?: boolean;
  consecutiveSameAction?: number;
  serializer?: TestSerializer;
  abortSignal?: AbortSignal;
  schema?: ZodType<ExecutionResponse>;
}): Promise<ExecutionResponse> {
  const currentIssues =
    params.serializer?.getTest()?.issues || params.checklist.issues || [];
  const issuesSummary = currentIssues
    .map((i) => `${i.id}: ${i.description}`)
    .join("; ");

  const knownIssuesText =
    params.serializer && params.serializer.getTest()?.issues.length
      ? `\n\nPreviously Identified Issues:\n${params.serializer
          .getTest()
          ?.issues.map((i) => `- ${i.id} (${i.severity}): ${i.description}`)
          .join("\n")}`
      : "";

  const executionPrompt =
    params.executionPromptTemplate
      .replace("{taskDescription}", params.currentTask.description)
      .replace("{overallGoal}", params.requirement) + knownIssuesText;

  console.log("[Agent][Executor] Beginning execution prompt");

  const result = await generateObjectWithTimeout({
    model: params.model,
    schema: params.schema || ExecutionResponseSchema,
    system: executionPrompt,
    providerOptions: getProviderOptions(params.model),
    messages: [
      ...params.history,
      {
        role: "user",
        content: [
          {
            type: "text" as const,
            text: `Goal: ${params.requirement}\nTask: ${params.currentTask.description}\n\nIdentified Issues: ${issuesSummary || "None"}\n\nCurrent State:\n${params.snapshot}${params.consecutiveSameAction && params.consecutiveSameAction > 0 ? `\n\nWARNING: You are repeating an action that recently failed. Try a different approach.` : ""}`,
          },
          ...(params.screenshot && params.supportsVision
            ? [prepareImagePart(params.screenshot)]
            : []),
        ],
      },
    ],
    abortSignal: params.abortSignal,
  });
  return result.object;
}
