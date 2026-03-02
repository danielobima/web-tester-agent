import { generateObject } from "ai";
import { google } from "@ai-sdk/google";
import { BrowserManager } from "./browser";
import { ActionSchema, Action } from "./actions";
import { TestSerializer, TestStep } from "./recorder";
import * as path from "path";

// Extract to heal step
async function heal(
  step: TestStep,
  browser: BrowserManager,
  errorMsg: string,
  testGoal: string,
): Promise<Action> {
  console.log(
    `[Healer] Attempting to heal step: ${JSON.stringify(step.action)}`,
  );

  const { text: snapshot } = await browser.getSnapshotForLLM();

  const { object: action } = await generateObject({
    model: google("gemini-2.5-flash"),
    schema: ActionSchema,
    system: `You are a self-healing QA agent. A deterministic test runner encountered an error while trying to execute an action.
    
Original Goal: ${testGoal}
Broken Action: ${JSON.stringify(step.action)}
Error Encountered: ${errorMsg}

Analyze the current HTML snapshot. The UI might have changed, causing the previous action to fail.
Propose the CORRECT next action to keep the test moving forward.
Use 'click', 'type', 'extract_text', or fallbacks if needed.`,
    messages: [
      {
        role: "user",
        content: `Current State:\n${snapshot}`,
      },
    ],
  });

  console.log(`[Healer] Proposed new action: ${JSON.stringify(action)}`);
  return action;
}

export async function replayTest(
  filePath: string,
  browser: BrowserManager,
  artifactsDir?: string,
) {
  const serializer = new TestSerializer();
  const test = await serializer.loadTest(filePath);

  console.log(`[Replay] Starting test: ${test.name} (Goal: ${test.startUrl})`);

  // Implicitly navigate to start URL if it exists
  if (test.startUrl) {
    await browser.execute({ kind: "navigate", url: test.startUrl });
  }

  if (artifactsDir) {
    await import("fs/promises").then((fs) =>
      fs.mkdir(artifactsDir, { recursive: true }),
    );
    console.log(`[Replay] Saving artifacts to ${artifactsDir}`);
  }

  for (let i = 0; i < test.steps.length; i++) {
    const step = test.steps[i];
    console.log(`[Replay] Executing Step ${i + 1}: ${step.action.kind}`);

    try {
      await browser.getSnapshotForLLM();
      await browser.execute(step.action);

      if (artifactsDir && browser.page) {
        await browser.page.screenshot({
          path: path.join(artifactsDir, `step-${i + 1}-screenshot.png`),
          fullPage: false,
        });
      }
    } catch (e: any) {
      console.error(`[Replay] ❌ Step ${i + 1} Failed: ${e.message}`);

      // Attempt Healing
      const newAction = await heal(step, browser, e.message, test.name);

      try {
        console.log(`[Replay] 🛠️ Executing healed action...`);
        await browser.execute(newAction);

        // Update the trace
        if (!step.healingHistory) step.healingHistory = [];
        step.healingHistory.push({
          date: new Date().toISOString(),
          originalSelector: JSON.stringify(step.action),
          newSelector: JSON.stringify(newAction),
          reason: e.message,
        });
        step.action = newAction; // Replace broken action

        console.log(`[Replay] ✅ Healed successfully. Trace updated.`);
        if (artifactsDir && browser.page) {
          await browser.page.screenshot({
            path: path.join(artifactsDir, `step-${i + 1}-screenshot.png`),
            fullPage: false,
          });
        }
      } catch (e2: any) {
        console.error(
          `[Replay] ❌ Healed action also failed: ${e2.message}. Test aborting.`,
        );
        break;
      }
    }
  }

  console.log(`[Replay] Saving updated test spec to ${filePath}`);
  await serializer.saveTest(filePath); // Save any healing changes
}
