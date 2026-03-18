import { generateObject, type LanguageModel } from "ai";
import { BrowserManager } from "./browser";
import { ActionSchema, Action, Assertion } from "./actions";
import { TestSerializer, TestStep } from "./recorder";
import * as path from "path";

async function evaluateAssertions(
  assertions: Assertion[],
  browser: BrowserManager,
  refs: Record<string, any>,
) {
  if (!browser.page) throw new Error("No active page to evaluate assertions");

  for (const assertion of assertions) {
    console.log(
      `[Replay] Evaluating assertion: ${assertion.type} on ref ${assertion.ref}`,
    );
    let locator;

    if (assertion.ref && refs[assertion.ref]) {
      locator = await browser.getLocatorByRef(assertion.ref, refs);
    } else if (assertion.ref && !refs[assertion.ref]) {
      if (assertion.type === "isHidden") {
        console.log(
          `[Replay] Assertion passed: ref '${assertion.ref}' is entirely absent from the DOM.`,
        );
        continue; // Implicitly hidden/removed!
      }
      throw new Error(
        `Assertion failed: Could not resolve ref '${assertion.ref}' in the current accessibility tree.`,
      );
    }

    if (!locator && assertion.ref) {
      throw new Error(
        `Assertion failed: Locator not found for ref '${assertion.ref}'`,
      );
    }

    // Default to the body/root if no ref is provided (e.g. for general textContains on the page)
    if (!locator) {
      locator = browser.page.locator("body");
    }

    try {
      switch (assertion.type) {
        case "isVisible":
          await locator.waitFor({ state: "visible", timeout: 5000 });
          break;
        case "isHidden":
          await locator.waitFor({ state: "hidden", timeout: 5000 });
          break;
        case "textContains":
          if (!assertion.value)
            throw new Error("Assertion 'textContains' requires a value.");
          // Ensure it's rendered, wait for text
          // Playwright locator.filter({ hasText }) or expect equivalent
          const textContent = await locator.textContent();
          if (!textContent || !textContent.includes(assertion.value)) {
            throw new Error(
              `Expected text '${assertion.value}' not found in element.`,
            );
          }
          break;
        case "textEquals":
          if (!assertion.value)
            throw new Error("Assertion 'textEquals' requires a value.");
          const exactText = await locator.textContent();
          if (exactText?.trim() !== assertion.value) {
            throw new Error(
              `Expected exact text '${assertion.value}', got '${exactText?.trim()}'`,
            );
          }
          break;
        case "hasClass":
          if (!assertion.value)
            throw new Error("Assertion 'hasClass' requires a value.");
          const classAttr = await locator.getAttribute("class");
          if (!classAttr || !classAttr.split(" ").includes(assertion.value)) {
            throw new Error(
              `Element missing expected class '${assertion.value}'. Current classes: '${classAttr}'`,
            );
          }
          break;
        case "hasAttribute":
          if (!assertion.attributeNode)
            throw new Error(
              "Assertion 'hasAttribute' requires an attributeNode.",
            );
          const attrVal = await locator.getAttribute(assertion.attributeNode);
          if (assertion.value && attrVal !== assertion.value) {
            throw new Error(
              `Attribute '${assertion.attributeNode}' value '${attrVal}' does not match expected '${assertion.value}'`,
            );
          }
          if (attrVal === null) {
            throw new Error(
              `Element missing expected attribute '${assertion.attributeNode}'`,
            );
          }
          break;
        default:
          throw new Error(`Unknown assertion type: ${(assertion as any).type}`);
      }
    } catch (e: any) {
      throw new Error(
        `Assertion type '${assertion.type}' failed: ${e.message}`,
      );
    }
  }
}

// Extract to heal step
async function heal(
  step: TestStep,
  browser: BrowserManager,
  errorMsg: string,
  testGoal: string,
  model: LanguageModel,
): Promise<Action> {
  console.log(
    `[Healer] Attempting to heal step: ${JSON.stringify(step.action)}`,
  );

  const { text: snapshot } = await browser.getSnapshotForLLM();

  const fs = await import("fs/promises");
  const path = await import("path");
  const systemPromptTemplate = await fs.readFile(
    path.join(__dirname, "replay-prompt.txt"),
    "utf-8",
  );
  const systemPrompt = systemPromptTemplate
    .replace("{{testGoal}}", testGoal)
    .replace("{{brokenAction}}", JSON.stringify(step.action))
    .replace("{{errorMsg}}", errorMsg);

  const { object: action } = await generateObject({
    model: model,
    schema: ActionSchema,
    system: systemPrompt,
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
  model: LanguageModel,
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
      await browser.waitForStability();
      await browser.getSnapshotForLLM();
      await browser.execute(step.action);

      // Post-action verification
      await browser.waitForStability();
      const { refs } = await browser.getSnapshotForLLM(true);

      if (step.assertions && step.assertions.length > 0) {
        await evaluateAssertions(step.assertions, browser, refs);
      } else {
        console.log(`[Replay] No assertions to evaluate for this step.`);
      }

      if (artifactsDir && browser.page) {
        await browser.page.screenshot({
          path: path.join(artifactsDir, `step-${i + 1}-screenshot.png`),
          fullPage: false,
        });
      }
    } catch (e: any) {
      console.error(`[Replay] ❌ Step ${i + 1} Failed: ${e.message}`);

      // Attempt Healing
      const newAction = await heal(step, browser, e.message, test.name, model);

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
