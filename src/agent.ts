import { generateObject, type LanguageModel } from "ai";
import { BrowserManager } from "./browser";
import {
  ChecklistSchema,
  ExecutionResponseSchema,
  AssertionAgentResponseSchema,
  type Checklist,
  type ExecutionResponse,
  type AssertionAgentResponse,
} from "./actions";
import { TestSerializer } from "./recorder";
import * as fs from "fs/promises";
import * as path from "path";
import { z } from "zod";
import { evaluateAssertions } from "./replay";

/**
 * Transforms element references (ref IDs) into role/name/nth identifiers
 * that can be used for deterministic replay.
 */
function mapRefsToIdentifiers(obj: any, refs: Record<string, any>) {
  if (!obj) return;

  const map = (target: any) => {
    if (target && target.ref && refs[target.ref]) {
      const refData = refs[target.ref];
      target.role = refData.role;
      if (refData.name) target.name = refData.name;
      if (refData.nth !== undefined) target.nth = refData.nth;

      // Special case for screenshot elements
      if (target.kind === "screenshot") {
        target.elementName = target.name;
        delete target.name;
      }
      delete target.ref;
    }
  };

  map(obj);

  // Handle nested structures
  if (obj.kind === "drag") {
    if (obj.startRef) {
      const startRefData = refs[obj.startRef];
      if (startRefData) {
        obj.startRole = startRefData.role;
        if (startRefData.name) obj.startName = startRefData.name;
        if (startRefData.nth !== undefined) obj.startNth = startRefData.nth;
      }
      delete obj.startRef;
    }
    if (obj.endRef) {
      const endRefData = refs[obj.endRef];
      if (endRefData) {
        obj.endRole = endRefData.role;
        if (endRefData.name) obj.endName = endRefData.name;
        if (endRefData.nth !== undefined) obj.endNth = endRefData.nth;
      }
      delete obj.endRef;
    }
  }

  if (obj.kind === "fill" && Array.isArray(obj.fields)) {
    for (const field of obj.fields) {
      map(field);
    }
  }

  if (Array.isArray(obj.assertions)) {
    for (const assertion of obj.assertions) {
      map(assertion);
    }
  }
}

export interface AgentStepUpdate {
  id: string;
  step: string;
  status: 'success' | 'failed' | 'pending';
  duration: string;
  description: string;
  error?: string;
}

export async function runAgent(
  requirement: string,
  browser: BrowserManager,
  model: LanguageModel,
  serializer?: TestSerializer,
  artifactsDir?: string,
  skipAssertions?: boolean,
  fullSnapshot?: boolean,
  onStep?: (update: AgentStepUpdate) => void,
  onChecklist?: (checklist: Checklist) => void,
  signal?: AbortSignal,
) {
  const history: any[] = [];
  let stepCounter = 1;

  let checklist: Checklist = {
    currentStateDescription: "Starting test execution",
    tasks: [],
    isGoalAchieved: false,
  };

  if (artifactsDir) {
    await fs.mkdir(artifactsDir, { recursive: true });
    console.log(`[Agent] Saving artifacts to ${artifactsDir}`);
  }

  const planningPrompt = await fs.readFile(
    path.join(__dirname, "prompts", "planning.txt"),
    "utf-8",
  );
  const executionPromptTemplate = await fs.readFile(
    path.join(__dirname, "prompts", "execution.txt"),
    "utf-8",
  );
  const assertionPromptTemplate = await fs.readFile(
    path.join(__dirname, "prompts", "assertion.txt"),
    "utf-8",
  );

  console.log(`[Agent] Starting goal: "${requirement}"`);

  let lastActionString = "";
  let consecutiveSameAction = 0;

  let currentTaskBeforeSnapshot: string = "";
  let currentTaskBeforeUrl: string = "";
  let currentTaskBeforeScreenshot: Buffer | undefined = undefined;
  let lastTaskId: string | undefined = undefined;

  try {
    while (stepCounter < 50) {
      if (signal?.aborted) {
        throw new Error("Agent terminated by user");
      }
      // 1. Observe
      await browser.waitForStability();
      const {
        text: snapshot,
        axTree,
        refs,
      } = await browser.getSnapshotForLLM(false, false, fullSnapshot);
      const currentUrl = browser.page?.url() || "";
      const screenshot = await browser.page?.screenshot({
        type: "jpeg",
        quality: 80,
      });

      console.log(`[Agent] Acquired snapshot (${snapshot.length} chars)`);

      if (artifactsDir) {
        await saveStepArtifacts(
          artifactsDir,
          stepCounter,
          snapshot,
          axTree,
          refs,
          browser,
          history,
          checklist,
        );
      }

      // 2. Planning Step
      console.log(`[Agent][Planner] Planning...`);
      const planningStartTime = Date.now();
      try {
        const planningResult = await generateObject({
          model: model,
          schema: ChecklistSchema,
          system: planningPrompt,
          messages: [
            ...history,
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `Goal: ${requirement}\n\nChecklist: ${JSON.stringify(
                    checklist,
                    null,
                    2,
                  )}\n\nCurrent State:\n${snapshot}`,
                },
                ...(screenshot
                  ? [
                      {
                        type: "image" as const,
                        image: screenshot,
                      },
                    ]
                  : []),
              ],
            },
          ],
        });
        checklist = planningResult.object;
        if (onChecklist) onChecklist(checklist);
        if (serializer) {
          serializer.updateChecklist(checklist);
        }
        console.log(
          `[Agent][Planner] Checklist updated (${checklist.tasks.length} tasks):`,
          checklist.nextTaskId,
        );
        console.log("[Agent][Planner] Tasks:");
        console.log(
          checklist.tasks
            .map(
              (t) =>
                `\t${t.id === checklist.nextTaskId ? "-" : t.status === "completed" ? "✓" : "✗"} ${t.id}: ${t.description}`,
            )
            .join("\n"),
        );
      } catch (e: any) {
        console.error(`[Agent][Planner] Planning failed: ${e.message}`);
        // Fallback: If planning fails, try to continue with current checklist if possible
      }

      if (checklist.isGoalAchieved) {
        console.log(`[Agent][Planner] Success condition met. Goal achieved.`);
        break;
      }

      const currentTaskId = checklist.nextTaskId;
      const currentTask = checklist.tasks.find((t) => t.id === currentTaskId);

      if (onStep && currentTask) {
        const planningDuration = `${((Date.now() - planningStartTime) / 1000).toFixed(1)}s`;
        onStep({
          id: `planning-${stepCounter}`,
          step: `Planning: ${currentTask.id}`,
          status: 'success',
          duration: planningDuration,
          description: `Strategic focus: ${currentTask.description}`
        });
      }

      if (!currentTaskId || !currentTask) {
        console.error(
          `[Agent][Planner] No valid nextTaskId found. Terminating.`,
        );
        break;
      }

      // Check if task changed, update "before" markers
      if (checklist.nextTaskId !== lastTaskId) {
        currentTaskBeforeSnapshot = snapshot;
        currentTaskBeforeUrl = currentUrl;
        currentTaskBeforeScreenshot = screenshot;
        browser.networkLogs = []; // Reset logs for the new task
        lastTaskId = checklist.nextTaskId;
        console.log(
          `[Agent][Asserter] Tracked "before" state for task: ${currentTaskId}`,
        );
      }

      // 3. Execution Step
      console.log(
        `[Agent][Executor] Thinking (Task: ${currentTask.description})...`,
      );

      const executionPrompt = executionPromptTemplate
        .replace("{taskDescription}", currentTask.description)
        .replace("{overallGoal}", requirement);

      let executionResponse: ExecutionResponse | undefined;
      let retries = 0;
      const maxRetries = 3;
      const actionStartTime = Date.now();

      while (retries < maxRetries) {
        try {
          const result = await generateObject({
            model: model,
            schema: ExecutionResponseSchema,
            system: executionPrompt,
            messages: [
              ...history,
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: `Goal: ${requirement}\nTask: ${
                      currentTask.description
                    }\n\nCurrent State:\n${snapshot}${
                      consecutiveSameAction > 0
                        ? "\n\nWARNING: You are repeating an action that recently failed. Try a different approach."
                        : ""
                    }`,
                  },
                  ...(screenshot
                    ? [
                        {
                          type: "image" as const,
                          image: screenshot,
                        },
                      ]
                    : []),
                ],
              },
            ],
          });
          executionResponse = result.object;
          break;
        } catch (e: any) {
          retries++;

          let errorMessage = e.message;
          // If it's a Zod-like validation error, try to extract more details
          if (e.errors && Array.isArray(e.errors)) {
            const details = e.errors
              .map((err: any) => `- ${err.path.join(".")}: ${err.message}`)
              .join("\n");
            errorMessage = `Schema validation failed:\n${details}`;
          } else if (errorMessage.includes("No object generated")) {
            // Sometimes the error is nested or just a generic string
            // We'll try to use the message as is, but if we have e.cause we can check it
            if (e.cause?.errors) {
              const details = (e.cause.errors as any[])
                .map((err: any) => `- ${err.path.join(".")}: ${err.message}`)
                .join("\n");
              errorMessage = `Schema validation failed:\n${details}`;
            }
          }

          console.warn(
            `[Agent][Executor] Execution schema validation failed (Attempt ${retries}/${maxRetries}): ${errorMessage}`,
          );
          if (e.text) {
            console.warn(`[Agent][Executor] Raw text from model: ${e.text}`);
          }

          history.push({
            role: "assistant",
            content: e.text || JSON.stringify({ error: errorMessage }),
          });
          history.push({
            role: "user",
            content: `Your previous response failed schema validation. 

ERROR:
${errorMessage}

Please review the ExecutionResponseSchema and correct your output. Common issues:
1. Using 'kind': 'fill' but providing 'ref'/'value' directly instead of a 'fields' array.
2. Using 'kind': 'type' but forgetting 'text' or 'value'.
3. Using 'name' instead of 'kind' in the action object.`,
          });

          if (retries >= maxRetries) {
            console.error(
              `[Agent][Executor] Failed to generate valid execution object after ${maxRetries} attempts.`,
            );
            throw new Error(errorMessage);
          }
        }
      }

      if (!executionResponse) {
        throw new Error(
          `[Agent][Executor] Failed to generate a valid execution response.`,
        );
      }

      const action = executionResponse.action;

      mapRefsToIdentifiers(action, refs);

      console.log(`[Agent][Executor] Action:`, action);

      // 4. Act & Serialize
      try {
        if (serializer && executionResponse.previousActionResult) {
          serializer.updatePreviousResult(
            executionResponse.previousActionResult,
          );
        }

        await browser.execute(action);
        const actionDuration = `${((Date.now() - actionStartTime) / 1000).toFixed(1)}s`;

        if (serializer) {
          serializer.logAction(action, {
            stateDescription: executionResponse.currentStateDescription,
            actionIntent: executionResponse.intendedActionDescription,
            taskId: currentTaskId,
          });
          await serializer.saveTest();
        }

        history.push({
          role: "assistant",
          content: JSON.stringify(executionResponse),
        });
        history.push({
          role: "user",
          content: `Action check: ${
            executionResponse.intendedActionDescription
          } completed. Result: ${
            executionResponse.taskResult || "Action successful"
          }`,
        });

        lastActionString = JSON.stringify(action);
        consecutiveSameAction = 0;

        if (onStep && currentTask) {
          onStep({
            id: `exec-${stepCounter}`,
            step: `Executing: ${action.kind}`,
            status: 'success',
            duration: actionDuration,
            description: executionResponse.intendedActionDescription
          });
        }

        // Update task status if the execution agent says it's done
        if (executionResponse.isTaskComplete) {
          console.log(`[Agent][Asserter] Task reported complete. Verifying...`);

          await browser.waitForStability();
          const { text: afterSnapshot, refs: afterRefs } =
            await browser.getSnapshotForLLM(false, false, fullSnapshot);
          const afterUrl = browser.page?.url() || "";
          const verificationStartTime = Date.now();

          let assertionRetries = 0;
          let assertionResponse: AssertionAgentResponse | undefined;
          const assertionHistory: any[] = [];

          while (assertionRetries < 3) {
            try {
              const assertionResult = await generateObject({
                model: model,
                schema: AssertionAgentResponseSchema,
                system: assertionPromptTemplate,
                messages: [
                  {
                    role: "user",
                    content: [
                      {
                        type: "text",
                        text: `Task: ${currentTask.description}\nGoal: ${requirement}\n\nBEFORE Snapshot:\n${currentTaskBeforeSnapshot}\nBEFORE URL: ${currentTaskBeforeUrl}\n\nAFTER Snapshot:\n${afterSnapshot}\nAFTER URL: ${afterUrl}\n\nNetwork Logs during task:\n${JSON.stringify(browser.networkLogs, null, 2)}`,
                      },
                      ...(currentTaskBeforeScreenshot
                        ? [
                            {
                              type: "image" as const,
                              image: currentTaskBeforeScreenshot,
                            },
                          ]
                        : []),
                      ...(screenshot
                        ? [
                            {
                              type: "image" as const,
                              image: screenshot,
                            },
                          ]
                        : []),
                    ],
                  },
                  ...assertionHistory,
                ],
              });

              assertionResponse = assertionResult.object;
              console.log(
                `[Agent][Asserter] Verification (Attempt ${assertionRetries + 1}): ${assertionResponse.isTaskVerified ? "PASSED" : "FAILED"}`,
              );
              console.log(
                `[Agent][Asserter] Reasoning: ${assertionResponse.verificationReasoning}`,
              );

              if (assertionResponse.assertions.length > 0) {
                for (const ass of assertionResponse.assertions)
                  mapRefsToIdentifiers(ass, afterRefs);

                console.log(
                  `[Agent][Asserter] Executing generated assertions...`,
                );
                const { passed, failures } = await evaluateAssertions(
                  assertionResponse.assertions,
                  browser,
                  afterRefs,
                );

                // Update the response with potentially corrected (resilience) assertions
                assertionResponse.assertions = passed;

                if (failures.length > 0) {
                  console.error(
                    `[Agent][Asserter] ❌ One or more generated assertions FAILED: Verification failed with ${failures.length} error(s):\n${failures.join("\n")}`,
                  );
                  assertionHistory.push({
                    role: "assistant",
                    content: JSON.stringify(assertionResponse),
                  });
                  assertionHistory.push({
                    role: "user",
                    content: `The assertions you generated failed programmatic verification: ${failures.join("\n")}. Please generate different assertions that correctly reflect the actual task completion state.`,
                  });
                  assertionRetries++;
                } else {
                  console.log(
                    `[Agent][Asserter] ✅ All generated assertions PASSED.`,
                  );
                  break; // Success, exit retry loop
                }
              } else {
                // No assertions generated, but LLM claims task is verified
                // We'll accept it if it's verified, but usually we want proof
                break;
              }
            } catch (e: any) {
              assertionRetries++;
              console.warn(
                `[Agent][Asserter] Assertion schema validation failed (Attempt ${assertionRetries}/3): ${e.message}`,
              );
              assertionHistory.push({
                role: "user",
                content: `Your previous response failed schema validation: ${e.message}. Please output a valid JSON object matching AssertionAgentResponseSchema.`,
              });
            }
          }

          if (assertionResponse) {
            if (serializer && assertionResponse.assertions.length > 0) {
              serializer.logVerificationToLastStep(
                assertionResponse.assertions,
              );
            }
            history.push({
              role: "user",
              content: `Verification Result: ${assertionResponse.isTaskVerified ? "Passed" : "Failed"}. Reasoning: ${assertionResponse.verificationReasoning}`,
            });

            const tIdx = checklist.tasks.findIndex(
              (t) => t.id === currentTaskId,
            );
            if (tIdx !== -1) {
              checklist.tasks[tIdx].status = assertionResponse.isTaskVerified
                ? "completed"
                : "pending";
              checklist.tasks[tIdx].result =
                assertionResponse.verificationReasoning;
              if (onChecklist) onChecklist(checklist);
            }

            if (onStep) {
              const verificationDuration = `${((Date.now() - verificationStartTime) / 1000).toFixed(1)}s`;
              onStep({
                id: `verify-${stepCounter}`,
                step: `Verifying: ${currentTaskId}`,
                status: assertionResponse.isTaskVerified ? 'success' : 'failed',
                duration: verificationDuration,
                description: assertionResponse.verificationReasoning,
                error: assertionResponse.isTaskVerified ? undefined : "Task verification failed after execution."
              });
            }
          } else {
            // Fallback if all 3 attempts failed to even generate a response
            console.error(
              `[Agent][Asserter] Failed to generate any valid assertion response after 3 attempts.`,
            );
            const tIdx = checklist.tasks.findIndex(
              (t) => t.id === currentTaskId,
            );
            if (tIdx !== -1) {
              checklist.tasks[tIdx].status = "completed"; // Assume done to avoid getting stuck
            }
          }
        }
      } catch (e: any) {
        console.error(
          `[Agent][Executor] Action execution failed: ${e.message}`,
        );
        history.push({
          role: "user",
          content: `Action failed with error: ${e.message}`,
        });

        const currentActionStr = JSON.stringify(action);
        if (currentActionStr === lastActionString) {
          consecutiveSameAction++;
          if (consecutiveSameAction >= 3) {
            throw new Error(
              `[Agent][Executor] Loop detected: Same failing action repeated 3 times.`,
            );
          }
        } else {
          lastActionString = currentActionStr;
          consecutiveSameAction = 1;
        }
      }

      if (action.kind === "screenshot" && action.name === "success") {
        console.log(`[Agent][Executor] Final success milestone reached.`);
        checklist.isGoalAchieved = true;
        break;
      }

      stepCounter++;
    }
  } finally {
    if (serializer) {
      console.log(`[Agent] Ensuring final test results are saved...`);
      serializer.updateChecklist(checklist);
      await serializer.saveTest();
      console.log(`[Agent] Final test results saved successfully.`);
    }
  }
}

async function saveStepArtifacts(
  dir: string,
  step: number,
  snapshot: string,
  axTree: any,
  refs: any,
  browser: BrowserManager,
  history: any[],
  checklist: Checklist,
) {
  await fs.writeFile(path.join(dir, `step-${step}-snapshot.txt`), snapshot);
  if (axTree) {
    await fs.writeFile(
      path.join(dir, `step-${step}-axtree.json`),
      JSON.stringify(axTree, null, 2),
    );
  }
  await fs.writeFile(
    path.join(dir, `step-${step}-refs.json`),
    JSON.stringify(refs, null, 2),
  );
  if (browser.page) {
    await browser.page.screenshot({
      path: path.join(dir, `step-${step}-screenshot.png`),
    });
  }
  await fs.writeFile(
    path.join(dir, `step-${step}-checklist.json`),
    JSON.stringify(checklist, null, 2),
  );
  await fs.writeFile(
    path.join(dir, `step-${step}-history.json`),
    JSON.stringify(history, null, 2),
  );
}
