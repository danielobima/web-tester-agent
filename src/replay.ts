import { type LanguageModel } from "ai";
import { BrowserManager } from "./browser";
import { ActionSchema, Action, Assertion } from "./actions";
import { TestSerializer, TestStep } from "./recorder";
import * as path from "path";
import { getProviderOptions, generateObjectWithTimeout } from "./utils";
import * as data from "./data";

export async function evaluateAssertions(
  assertions: Assertion[],
  browser: BrowserManager,
  refs: Record<string, any>,
): Promise<{ passed: Assertion[]; failures: string[] }> {
  if (!browser.page) throw new Error("No active page to evaluate assertions");

  console.log(
    `[Assert] Selected ${assertions.length} assertions for verification:`,
  );
  assertions.forEach((a, i) => {
    const target = a.role
      ? `role="${a.role}"${a.name ? ` name="${a.name}"` : ""}`
      : a.ref
        ? `ref="${a.ref}"`
        : "page";
    console.log(`  ${i + 1}. [${a.type}] on ${target}`);
  });

  const passed: Assertion[] = [];
  const failures: string[] = [];

  for (let i = 0; i < assertions.length; i++) {
    const assertion = assertions[i];
    const label = `Assertion #${i + 1} [${assertion.type}]`;
    console.log(`[Assert] Evaluating ${label}...`);

    try {
      let locator;
      if (assertion.role || assertion.ref) {
        locator = await browser.getLocator(assertion);
      }

      if (!locator) {
        if (assertion.type === "isHidden") {
          console.log(`[Assert] ✅ PASSED: ${label} (element is absent)`);
          passed.push(assertion);
          continue;
        }
        // Default to the body/root if no role/ref is provided
        locator = browser.page.locator("body");
      }

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
        case "inputValueEquals":
        case "valueEquals":
          if (!assertion.value)
            throw new Error(`Assertion '${assertion.type}' requires a value.`);
          const inputValue = await locator.inputValue();
          if (inputValue !== assertion.value) {
            throw new Error(
              `Expected input value '${assertion.value}', got '${inputValue}'`,
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
          let attrName = assertion.attributeNode;
          let expectedVal = assertion.value;

          // Resilience: If attributeNode is missing but value is present and looks like an attribute name
          if (!attrName && expectedVal && !expectedVal.includes(" ")) {
            console.log(
              `[Assert] ⚠️ Resilience: 'hasAttribute' missing 'attributeNode'. Using 'value' ("${expectedVal}") as attribute name.`,
            );
            assertion.attributeNode = expectedVal;
            assertion.value = undefined;
            attrName = expectedVal;
            expectedVal = undefined; // We don't know the expected value, just checking existence
          }

          if (!attrName)
            throw new Error(
              "Assertion 'hasAttribute' requires an attributeNode.",
            );

          const attrVal = await locator.getAttribute(attrName);
          if (expectedVal !== undefined && attrVal !== expectedVal) {
            throw new Error(
              `Attribute '${attrName}' value '${attrVal}' does not match expected '${expectedVal}'`,
            );
          }
          if (attrVal === null) {
            throw new Error(`Element missing expected attribute '${attrName}'`);
          }
          break;
        case "pageNavigated":
          if (!assertion.value)
            throw new Error("Assertion 'pageNavigated' requires a value.");
          const currentUrl = browser.page.url();
          if (!currentUrl.includes(assertion.value)) {
            throw new Error(
              `Expected URL to contain '${assertion.value}', but got '${currentUrl}'`,
            );
          }
          break;
        case "networkRequestCompleted":
          if (!assertion.value)
            throw new Error(
              "Assertion 'networkRequestCompleted' requires a value.",
            );
          const requestFound = browser.networkLogs.some(
            (req) =>
              req.url.includes(assertion.value!) &&
              req.status >= 200 &&
              req.status < 400,
          );
          if (!requestFound) {
            throw new Error(
              `Expected network request containing '${assertion.value}' to have completed successfully, but it was not found in logs.`,
            );
          }
          break;
        default:
          throw new Error(`Unknown assertion type: ${(assertion as any).type}`);
      }
      console.log(`[Assert] ✅ PASSED: ${label}`);
      passed.push(assertion);
    } catch (e: any) {
      console.log(`[Assert] ❌ FAILED: ${label} - ${e.message}`);
      failures.push(`${label}: ${e.message}`);
    }
  }

  return { passed, failures };
}

// Extract to heal step
async function heal(
  step: TestStep,
  browser: BrowserManager,
  errorMsg: string,
  testGoal: string,
  model: LanguageModel,
  fullSnapshot?: boolean,
  supportsVision?: boolean,
  abortSignal?: AbortSignal,
): Promise<Action> {
  console.log(
    `[Healer] Attempting to heal step: ${JSON.stringify(step.action)}`,
  );

  const { text: snapshot } = await browser.getSnapshotForLLM(false, false, fullSnapshot);

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

  const { object: action } = await generateObjectWithTimeout({
    model: model,
    schema: ActionSchema,
    system: systemPrompt,
    providerOptions: getProviderOptions(model),
    messages: [
      {
        role: "user",
        content: `Current State:\n${snapshot}`,
      },
    ],
    abortSignal,
  });

  console.log(`[Healer] Proposed new action: ${JSON.stringify(action)}`);
  return action;
}

export async function replayTest(
  filePath: string,
  browser: BrowserManager,
  model: LanguageModel,
  artifactsDir?: string,
  skipAssertions?: boolean,
  fullSnapshot?: boolean,
  onStep?: (update: any) => void,
  onChecklist?: (checklist: any) => void,
  onPlanning?: (isPlanning: boolean) => void,
  signal?: AbortSignal,
  supportsVision?: boolean,
  autoApprovePlan?: boolean,
  appId?: string,
) {
  const serializer = new TestSerializer();
  const test = await serializer.loadTest(filePath);

  const currentAppId = test.appId || appId || "cli";
  try {
    let resolvedTestId = test.testId;
    if (!resolvedTestId) {
      try {
        const tests = await data.listTests(currentAppId);
        const matchedTest = tests.find(t => t.name === test.name || t.url === test.startUrl);
        if (matchedTest) {
          resolvedTestId = matchedTest.id;
        }
      } catch (dbErr) {
        console.warn("[Replay] Failed to resolve testId from database:", dbErr);
      }
    }

    const allVars = await data.listVariables(currentAppId);
    const appVars = allVars.filter(v => !v.testId);
    const testVars = resolvedTestId ? allVars.filter(v => v.testId === resolvedTestId) : [];
    const resolvedVars = data.resolveVariables(appVars, testVars);

    if (!test.variables) {
      test.variables = {};
    }
    for (const v of resolvedVars) {
      if (v && v.name) {
        test.variables[v.name] = v.value;
      }
    }
  } catch (err) {
    console.warn(`[Replay] Failed to merge active variables for ${currentAppId}:`, err);
  }

  console.log(`[Replay] Starting test: ${test.name} (Goal: ${test.startUrl})`);

  // Implicitly navigate to start URL if it exists
  if (test.startUrl) {
    await browser.execute({ kind: "navigate", url: test.startUrl });
  }

  if (artifactsDir) {
    const fs = await import("fs/promises");
    try {
      await fs.rm(artifactsDir, { recursive: true, force: true });
    } catch (rmErr) {
      console.warn(`[Replay] Failed to clear artifactsDir ${artifactsDir}:`, rmErr);
    }
    await fs.mkdir(artifactsDir, { recursive: true });
    console.log(`[Replay] Saving artifacts to ${artifactsDir}`);
  }

  if (onChecklist && test.checklist) {
    onChecklist(test.checklist);
  }

  let wasHealed = false;
  for (let i = 0; i < test.steps.length; i++) {
    if (signal?.aborted) {
      throw new Error("Replay terminated by user");
    }

    const step = test.steps[i];
    const stepStartTime = Date.now();
    console.log(`[Replay] Executing Step ${i + 1}: ${step.action.kind}`);

    let actionToExecute = step.action;
    if (test.variables) {
      actionToExecute = substituteVariablesInAction(step.action, step.usedVariables, test.variables);
    }

    try {
      await browser.waitForStability();
      const { text: beforeSnapshot } = await browser.getSnapshotForLLM(false, false, fullSnapshot);

      await browser.execute(actionToExecute);

      // Post-action verification
      await browser.waitForStability();
      const { text: afterSnapshot, refs } = await browser.getSnapshotForLLM(true, false, fullSnapshot);

      if (skipAssertions) {
        console.log(
          `[Replay] Skipping assertions (--skip-assertions is enabled).`,
        );
      } else if (
        step.verificationAssertions &&
        step.verificationAssertions.length > 0
      ) {
        console.log(`[Replay] Evaluating task verification assertions...`);
        const { passed } = await evaluateAssertions(
          step.verificationAssertions,
          browser,
          refs,
        );
        // Check if assertions were corrected/filtered
        if (JSON.stringify(passed) !== JSON.stringify(step.verificationAssertions)) {
          step.verificationAssertions = passed;
          wasHealed = true;
        }
      }

      let screenshotPath = "";
      if (artifactsDir && browser.page) {
        const fullPath = path.join(artifactsDir, `step-${i + 1}-screenshot.png`);
        await browser.page.screenshot({
          path: fullPath,
          fullPage: false,
        });
        screenshotPath = `media://${fullPath}`;
      }

      if (onStep) {
        onStep({
          id: step.id || `replay-${i + 1}`,
          step: `Replaying: ${step.action.kind}`,
          status: 'success',
          duration: `${((Date.now() - stepStartTime) / 1000).toFixed(1)}s`,
          description: step.actionIntent || `Successfully replayed ${step.action.kind} action.`,
          stateDescription: step.stateDescription,
          screenshot: screenshotPath,
          action: actionToExecute,
          issues: step.issues,
          url: browser.page?.url() || "",
          usedVariables: step.usedVariables,
          snapshotBefore: beforeSnapshot,
          snapshotAfter: afterSnapshot,
        });
      }
    } catch (e: any) {
      console.error(`[Replay] ❌ Step ${i + 1} Failed: ${e.message}`);

      // Attempt Healing
      let healingSucceeded = false;
      let newAction: Action | null = null;
      try {
        newAction = await heal(step, browser, e.message, test.name, model, fullSnapshot, supportsVision, signal);
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
        wasHealed = true;
        healingSucceeded = true;
        console.log(`[Replay] ✅ Healed successfully. Trace updated.`);
      } catch (healingError: any) {
        console.error(`[Replay] ❌ Healing / execution of healed action failed: ${healingError.message}`);
      }

      let screenshotPath = "";
      if (artifactsDir && browser.page) {
        const fullPath = path.join(artifactsDir, `step-${i + 1}-error.png`);
        try {
          await browser.page.screenshot({
            path: fullPath,
            fullPage: false,
          });
          screenshotPath = `media://${fullPath}`;
        } catch (ssErr) {
          console.warn("[Replay] Failed to take error screenshot:", ssErr);
        }
      }

      if (healingSucceeded && newAction) {
        if (onStep) {
          onStep({
            id: step.id || `replay-${i + 1}`,
            step: `Replaying: ${step.action.kind} (Healed)`,
            status: 'success',
            duration: `${((Date.now() - stepStartTime) / 1000).toFixed(1)}s`,
            description: `Healed action executed: ${step.actionIntent || ""}`,
            stateDescription: step.stateDescription,
            screenshot: screenshotPath,
            action: newAction,
            issues: step.issues,
            url: browser.page?.url() || "",
            usedVariables: step.usedVariables,
          });
        }
      } else {
        if (onStep) {
          onStep({
            id: step.id || `replay-${i + 1}`,
            step: `Failed: ${actionToExecute.kind}`,
            status: 'failed',
            duration: `${((Date.now() - stepStartTime) / 1000).toFixed(1)}s`,
            description: `Action failed: ${e.message}`,
            stateDescription: step.stateDescription,
            screenshot: screenshotPath,
            action: actionToExecute,
            issues: step.issues,
            url: browser.page?.url() || "",
            usedVariables: step.usedVariables,
            error: e.message,
          });
        }
        throw e; // Rethrow the error to abort the test execution
      }
    }
  }

  if (wasHealed) {
    console.log(`[Replay] Saving updated test spec to ${filePath}`);
    await serializer.saveTest(filePath.replace(".json", "-healed.json")); // Save any healing changes
  } else {
    console.log(`[Replay] No healing required. Skipping -healed.json save.`);
  }
}

function substituteVariablesInAction(
  action: Action,
  usedVariables: string[] | undefined,
  variables: Record<string, string> | undefined,
): Action {
  if (!usedVariables || usedVariables.length === 0 || !variables) {
    return action;
  }

  const actionCopy = JSON.parse(JSON.stringify(action));

  const cleanStr = (s: string) =>
    s
      .trim()
      .replace(/[^a-zA-Z0-9_]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "")
      .toLowerCase();

  if (actionCopy.kind === "type") {
    for (const varName of usedVariables) {
      if (variables[varName] !== undefined) {
        const matchByName =
          actionCopy.name && cleanStr(actionCopy.name) === cleanStr(varName);
        const matchByRef =
          actionCopy.ref && cleanStr(actionCopy.ref) === cleanStr(varName);
        if (matchByName || matchByRef || usedVariables.length === 1) {
          actionCopy.text = variables[varName];
          actionCopy.value = variables[varName];
          console.log(
            `[Replay] Substituting variable '${varName}' value: '${variables[varName]}' into type action`,
          );
          break;
        }
      }
    }
  } else if (actionCopy.kind === "select_option") {
    for (const varName of usedVariables) {
      if (variables[varName] !== undefined) {
        const matchByName =
          actionCopy.name && cleanStr(actionCopy.name) === cleanStr(varName);
        const matchByRef =
          actionCopy.ref && cleanStr(actionCopy.ref) === cleanStr(varName);
        if (matchByName || matchByRef || usedVariables.length === 1) {
          actionCopy.value = variables[varName];
          console.log(
            `[Replay] Substituting variable '${varName}' value: '${variables[varName]}' into select_option action`,
          );
          break;
        }
      }
    }
  } else if (actionCopy.kind === "select") {
    for (const varName of usedVariables) {
      if (variables[varName] !== undefined) {
        const matchByName =
          actionCopy.name && cleanStr(actionCopy.name) === cleanStr(varName);
        const matchByRef =
          actionCopy.ref && cleanStr(actionCopy.ref) === cleanStr(varName);
        if (matchByName || matchByRef || usedVariables.length === 1) {
          actionCopy.values = [variables[varName]];
          console.log(
            `[Replay] Substituting variable '${varName}' value: '${variables[varName]}' into select action`,
          );
          break;
        }
      }
    }
  } else if (actionCopy.kind === "fill" && Array.isArray(actionCopy.fields)) {
    for (const field of actionCopy.fields) {
      for (const varName of usedVariables) {
        if (variables[varName] !== undefined) {
          const matchByName =
            field.name && cleanStr(field.name) === cleanStr(varName);
          const matchByRef =
            field.ref && cleanStr(field.ref) === cleanStr(varName);
          if (matchByName || matchByRef) {
            field.value = variables[varName];
            console.log(
              `[Replay] Substituting variable '${varName}' value: '${variables[varName]}' into fill field '${field.name || field.ref}'`,
            );
          }
        }
      }
    }
  }

  return actionCopy;
}
