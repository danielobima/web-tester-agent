import { generateObject } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { SerializedTest } from "./recorder";

export async function optimizeTest(
  test: SerializedTest,
): Promise<SerializedTest> {
  console.log(`[Optimizer] Optimizing test steps (${test.steps.length} total)`);

  if (test.steps.length === 0) {
    return test;
  }

  const stepsSummaries = test.steps.map((step, idx) => ({
    index: idx,
    id: step.id,
    action: step.action,
    intent: step.actionIntent,
    result: step.actionResult,
  }));

  try {
    const result = await generateObject({
      model: google("gemini-2.5-flash"),
      schema: z.object({
        keptStepIndices: z
          .array(z.number())
          .describe(
            "The 0-based indices of the steps that should be kept to form the minimized successful test.",
          ),
        reasoning: z
          .string()
          .describe("Explanation for which steps were removed and why."),
      }),
      system: `You are an expert QA automation engineer. Your goal is to review a sequence of recorded test steps and remove any mistakes, temporary corrections, or redundant actions to produce the shortest possible clean test script.
For example:
- If the agent types in the wrong field, clears it, and types in the correct field, ONLY keep the final correct typing action.
- If the agent navigates, then immediately navigates somewhere else, ONLY keep the final navigation.
- If the agent clicks something by mistake and has to correct it, REMOVE the mistake click.
- If an element was not found and the agent had to retry, remove the failed attempts.
- ALWAYS keep the final 'screenshot' action with name 'success' at the end.
Return an array of the 0-based indices of the steps you want to keep. Keep the steps in their original relative order.`,
      prompt: `Here are the recorded steps for the goal: "${test.name}"\n\n${JSON.stringify(stepsSummaries, null, 2)}`,
    });

    const { keptStepIndices, reasoning } = result.object;
    console.log(`[Optimizer] LLM Reasoning:\n${reasoning}`);

    const optimizedSteps = keptStepIndices
      .map((idx) => test.steps[idx])
      .filter(Boolean);

    console.log(
      `[Optimizer] Reduced steps from ${test.steps.length} to ${optimizedSteps.length}`,
    );

    return {
      ...test,
      steps: optimizedSteps,
    };
  } catch (e: any) {
    console.error(`[Optimizer] Optimization failed: ${e.message}`);
    return test; // Fallback to raw test if optimization fails
  }
}
