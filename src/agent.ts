import { generateObject, type LanguageModel } from "ai";
import { BrowserManager } from "./browser";
import { ActionSchema, AssertionSchema } from "./actions";
import { TestSerializer } from "./recorder";
import * as fs from "fs/promises";
import * as path from "path";
import { z } from "zod";
import { evaluateAssertions } from "./replay";

export async function runAgent(
  requirement: string,
  browser: BrowserManager,
  model: LanguageModel,
  serializer?: TestSerializer,
  artifactsDir?: string,
  skipAssertions?: boolean,
) {
  const history: any[] = [];
  let stepCounter = 1;

  if (artifactsDir) {
    await fs.mkdir(artifactsDir, { recursive: true });
    console.log(`[Agent] Saving artifacts to ${artifactsDir}`);
  }

  console.log(`[Agent] Starting goal: "${requirement}"`);

  let previousSnapshot = "";
  let lastActionString = "";
  let consecutiveSameAction = 0;

  const systemPrompt = await fs.readFile(
    path.join(__dirname, "prompt.txt"),
    "utf-8",
  );

  while (true) {
    // 1. Observe
    await browser.waitForStability();
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

      await fs.writeFile(
        path.join(artifactsDir, `step-${stepCounter}-history.json`),
        JSON.stringify(history, null, 2),
        "utf-8",
      );
    }

    // 2. Decide (Call LLM)
    console.log(`[Agent] Thinking...`);
    let action;
    let stateDescription: string | undefined;
    let actionIntent: string | undefined;
    let actionResult: string | undefined;
    let assertions: any | undefined;

    let retries = 0;
    const maxRetries = 3;

    while (retries < maxRetries) {
      try {
        const result = await generateObject({
          model: model,
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
            ...(skipAssertions
              ? {}
              : {
                  assertions: z
                    .array(AssertionSchema)
                    .optional()
                    .describe(
                      "An array of assertions that MUST be true AFTER the action completes. Use this to deterministically verify the action succeeded during replay.",
                    ),
                }),
          }),
          system: systemPrompt,
          messages: [
            ...history,
            {
              role: "user",
              content: `Goal: ${requirement}\n\nCurrent State:\n${snapshot}${
                snapshot === previousSnapshot
                  ? "\n\nWARNING: The page state has NOT changed since your last action! Stop repeating the exact same action and try a different approach."
                  : ""
              }${
                consecutiveSameAction > 0
                  ? "\n\nCRITICAL WARNING: You have proposed the exact same action that just failed! DO NOT REPEAT YOURSELF. You MUST choose a different `ref` or use a fallback method like `evaluate`."
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
        assertions = response.assertions;
        break; // Success, exit retry loop
      } catch (e: any) {
        retries++;
        console.warn(
          `[Agent] Schema validation failed (Attempt ${retries}/${maxRetries}): ${e.message}`,
        );
        if (e.text) {
          console.warn(`[Agent] Raw text: ${e.text} ${e.message}`);
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

    // Transform all refs into role/name/nth before execution and serialization
    const mapRefToRoleName = (obj: any) => {
      if (obj.ref && refs[obj.ref]) {
        obj.role = refs[obj.ref].role;
        if (refs[obj.ref].name) obj.name = refs[obj.ref].name;
        if (refs[obj.ref].nth !== undefined) obj.nth = refs[obj.ref].nth;
        if (obj.kind === "screenshot") {
          obj.elementName = obj.name;
          delete obj.name;
        }
        delete obj.ref;
      }
    };

    mapRefToRoleName(action);

    if (action.kind === "drag") {
      if (action.startRef && refs[action.startRef]) {
        action.startRole = refs[action.startRef].role;
        if (refs[action.startRef].name)
          action.startName = refs[action.startRef].name;
        if (refs[action.startRef].nth !== undefined)
          action.startNth = refs[action.startRef].nth;
        delete action.startRef;
      }
      if (action.endRef && refs[action.endRef]) {
        action.endRole = refs[action.endRef].role;
        if (refs[action.endRef].name) action.endName = refs[action.endRef].name;
        if (refs[action.endRef].nth !== undefined)
          action.endNth = refs[action.endRef].nth;
        delete action.endRef;
      }
    }

    if (action.kind === "fill" && Array.isArray(action.fields)) {
      for (const field of action.fields) {
        mapRefToRoleName(field);
      }
    }

    if (Array.isArray(assertions)) {
      for (const assertion of assertions) {
        mapRefToRoleName(assertion);
      }
    }

    console.log(`[Agent] Action elected & transformed:`, action);

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

      if (!skipAssertions && assertions && assertions.length > 0) {
        await browser.waitForStability();
        const { refs: evalRefs } = await browser.getSnapshotForLLM(true);
        await evaluateAssertions(assertions, browser, evalRefs);
      }

      if (serializer) {
        serializer.logAction(action, {
          stateDescription,
          actionIntent,
          assertions,
        });
        await serializer.saveTest();
      }
      history.push({
        role: "assistant",
        content: JSON.stringify({
          stateDescription,
          actionIntent,
          action,
          assertions,
        }),
      });
      history.push({
        role: "user",
        content: actionResult || `Action executed successfully.`,
      });
      lastActionString = JSON.stringify(action);
      consecutiveSameAction = 0;
    } catch (e: any) {
      console.error(`[Agent] Action execution failed: ${e.message}`);
      history.push({
        role: "assistant",
        content: JSON.stringify({
          stateDescription,
          actionIntent,
          action,
          assertions,
        }),
      });
      history.push({
        role: "user",
        content: `Action failed with error: ${e.message}`,
      });

      const currentActionStr = JSON.stringify(action);
      if (currentActionStr === lastActionString) {
        consecutiveSameAction++;
        if (consecutiveSameAction >= 3) {
          throw new Error(
            `[Agent] Aborting test: Agent is caught in a loop, repeating the exact same failing action 3 times: ${currentActionStr}`,
          );
        }
      } else {
        lastActionString = currentActionStr;
        consecutiveSameAction = 1;
      }
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
