import { generateObject } from "ai";
import { google } from "@ai-sdk/google";
import { BrowserManager } from "./browser";
import { ActionSchema } from "./actions";
import { TestSerializer } from "./recorder";
import * as fs from "fs/promises";
import * as path from "path";
import { z } from "zod";

export async function runAgent(
  requirement: string,
  browser: BrowserManager,
  serializer?: TestSerializer,
  artifactsDir?: string,
) {
  const history: any[] = [];
  let stepCounter = 1;

  if (artifactsDir) {
    await fs.mkdir(artifactsDir, { recursive: true });
    console.log(`[Agent] Saving artifacts to ${artifactsDir}`);
  }

  console.log(`[Agent] Starting goal: "${requirement}"`);

  let previousSnapshot = "";

  while (true) {
    // 1. Observe
    const { text: snapshot, axTree, refs } = await browser.getSnapshotForLLM();
    console.log(`[Agent] Acquired snapshot (${snapshot.length} chars)`);

    if (artifactsDir) {
      await fs.writeFile(
        path.join(artifactsDir, `step-${stepCounter}-snapshot.txt`),
        snapshot,
        "utf-8",
      );
      if (axTree) {
        await fs.writeFile(
          path.join(artifactsDir, `step-${stepCounter}-axtree.json`),
          JSON.stringify(axTree, null, 2),
          "utf-8",
        );
      }
      await fs.writeFile(
        path.join(artifactsDir, `step-${stepCounter}-refs.json`),
        JSON.stringify(refs, null, 2),
        "utf-8",
      );

      // Save screenshot
      if (browser.page) {
        await browser.page.screenshot({
          path: path.join(artifactsDir, `step-${stepCounter}-screenshot.png`),
          fullPage: false,
        });
      }
    }

    // 2. Decide (Call LLM)
    console.log(`[Agent] Thinking...`);
    let action;
    let stateDescription: string | undefined;
    let actionIntent: string | undefined;
    let actionResult: string | undefined;

    let retries = 0;
    const maxRetries = 3;

    while (retries < maxRetries) {
      try {
        const result = await generateObject({
          model: google("gemini-2.5-flash"),
          schema: z.object({
            currentStateDescription: z
              .string()
              .describe(
                "A short sentence describing the current state of the page",
              ),
            intendedActionDescription: z
              .string()
              .describe(
                "A short sentence describing the action you will attempt next",
              ),
            previousActionResult: z
              .string()
              .optional()
              .describe(
                "A short sentence describing the result of the PREVIOUS action based on the current state. Leave empty on the first step.",
              ),
            action: ActionSchema,
          }),
          system: `You are an autonomous QA tester. Your goal is to fulfill the user's test requirement. You have access to a browser. Analyze the simplified HTML and choose the next best action.
          
  If the goal is achieved, output action 'screenshot' with name 'success'.
  For clicking, prefer using the 'click' action with the 'ref' ID if the element is available in the snapshot.
  WARNING: Do not interact with structural parent nodes like 'cell', 'row', or 'main' if a more specific interactive child element (like a link or button) exists.
  For navigating to a URL provided in the requirement, use 'navigate'.
  Only use 'click_selector' or 'evaluate' as a fallback if the element cannot be targeted by its ref.

  CRITICAL: You MUST output a valid JSON object matching the provided schema exactly. 
  The discriminator field tells which action to take. Ensure you output 'kind': 'action_name' and NOT 'action': 'action_name'.
  Do not output anything else.`,
          messages: [
            ...history,
            {
              role: "user",
              content: `Goal: ${requirement}\n\nCurrent State:\n${snapshot}${
                snapshot === previousSnapshot
                  ? "\n\nWARNING: The page state has NOT changed since your last action! Stop repeating the exact same action and try a different approach."
                  : ""
              }`,
            },
          ],
        });
        const response = result.object;
        action = response.action;
        stateDescription = response.currentStateDescription;
        actionIntent = response.intendedActionDescription;
        actionResult = response.previousActionResult;
        break; // Success, exit retry loop
      } catch (e: any) {
        retries++;
        console.warn(
          `[Agent] Schema validation failed (Attempt ${retries}/${maxRetries}): ${e.message}`,
        );
        if (e.text) {
          console.warn(`[Agent] Raw text: ${e.text}`);
        }

        if (retries >= maxRetries) {
          console.error(
            `[Agent] Failed to generate valid object after ${maxRetries} attempts.`,
          );
          throw e; // Give up
        }

        // Feed the failure back into the history so the LLM learns to correct it
        history.push({
          role: "assistant",
          content: e.text || JSON.stringify({ error: e.message }),
        });
        history.push({
          role: "user",
          content: `Your previous response failed schema validation with error: ${e.message}. Please correct your output to match the schema exactly.`,
        });
      }
    }

    if (!action) {
      throw new Error(
        `[Agent] Failed to generate a valid action after ${maxRetries} attempts.`,
      );
    }

    console.log(`[Agent] Action elected:`, action);

    if (artifactsDir) {
      await fs.writeFile(
        path.join(artifactsDir, `step-${stepCounter}-action.json`),
        JSON.stringify(action, null, 2),
        "utf-8",
      );
    }

    // 3. Act & Serialize
    try {
      if (serializer && actionResult) {
        serializer.updatePreviousResult(actionResult);
      }
      await browser.execute(action);
      if (serializer) {
        serializer.logAction(action, {
          stateDescription,
          actionIntent,
        });
      }
      history.push({
        role: "assistant",
        content: `I chose to execute action: ${JSON.stringify(action)}`,
      });
      history.push({ role: "user", content: `Action executed successfully.` });
    } catch (e: any) {
      console.error(`[Agent] Action execution failed: ${e.message}`);
      history.push({
        role: "assistant",
        content: `I chose to execute action: ${JSON.stringify(action)}`,
      });
      history.push({
        role: "user",
        content: `Action failed with error: ${e.message}`,
      });
    }

    // 5. Check Termination condition
    if (action.kind === "screenshot" && action.name === "success") {
      console.log(`[Agent] Success condition met. Goal achieved.`);
      break;
    }

    previousSnapshot = snapshot;
    stepCounter++;
  }
}
