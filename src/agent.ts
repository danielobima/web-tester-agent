import { generateObject, type LanguageModel } from "ai";
import { BrowserManager } from "./browser";
import { TestSerializer } from "./recorder";
import * as fs from "fs/promises";
import * as path from "path";
import { z } from "zod";
import { evaluateAssertions } from "./replay";
import { saveAgentErrorReport } from "./error_logger";
import { prepareImagePart } from "./utils";

import {
  AgentHistoryMessage,
  PlanApprovalResult,
  GoalReachedResult,
  ManualPauseResult,
  AgentStepUpdate,
} from "./agent/types";

import {
  mapRefsToIdentifiers,
  saveStepArtifacts,
  estimateTextTokens,
  estimateImageTokens,
  getTokenBreakdown,
  extractSchemaErrors,
} from "./agent/utils";

import { planTask } from "./agent/planner";
import { executeTask } from "./agent/executor";

import {
  Checklist,
  ExecutionResponse,
  AssertionAgentResponse,
  AssertionAgentResponseSchema,
} from "./actions";

// Re-export for compatibility with other files (benchmark-mind2web.ts, cli.ts, etc.)
export {
  AgentHistoryMessage,
  PlanApprovalResult,
  GoalReachedResult,
  ManualPauseResult,
  AgentStepUpdate,
} from "./agent/types";

export {
  mapRefsToIdentifiers,
  saveStepArtifacts,
  estimateTextTokens,
  estimateImageTokens,
  getTokenBreakdown,
  extractSchemaErrors,
} from "./agent/utils";

export { planTask } from "./agent/planner";
export { executeTask } from "./agent/executor";

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
  onPlanApproval?: (checklist: Checklist) => Promise<PlanApprovalResult>,
  onGoalReached?: (checklist: Checklist) => Promise<GoalReachedResult>,
  onPlanning?: (isPlanning: boolean) => void,
  onManualPause?: (checklist: Checklist) => Promise<ManualPauseResult>,
  screenshotsDir?: string,
  onIssuesUpdate?: (issues: any[]) => void,
  signal?: AbortSignal,
  supportsVision?: boolean,
  autoApprovePlan?: boolean,
) {
  const history: AgentHistoryMessage[] = [];
  let stepCounter = 1;
  let needsPlanApproval = !autoApprovePlan;
  let checklist: Checklist = {
    currentStateDescription: "Starting test execution",
    tasks: [],
    finished: false,
    issues: [],
  };

  if (artifactsDir) {
    await fs.mkdir(artifactsDir, { recursive: true });
  }
  if (screenshotsDir) {
    await fs.mkdir(screenshotsDir, { recursive: true });
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

  let lastActionString = "";
  let consecutiveSameAction = 0;
  let currentTaskBeforeSnapshot: string = "";
  let currentTaskBeforeUrl: string = "";
  let currentTaskBeforeScreenshot: Buffer | undefined = undefined;
  let lastTaskId: string | undefined = undefined;

  console.log(
    `[Agent] Starting test execution. autoApprovePlan: ${autoApprovePlan}`,
  );
  console.log(`[Agent] Running model: ${model}`);
  console.log(`[Agent] Supports vision: ${supportsVision}`);

  try {
    while (stepCounter < 50) {
      if (signal?.aborted) throw new Error("Agent terminated by user");

      if (onManualPause) {
        const pauseResult = await onManualPause(checklist);
        if (pauseResult.action === "reprompt") {
          requirement += `\nLatest User Feedback: ${pauseResult.feedback}`;
          checklist.finished = false;
          needsPlanApproval = true;
          // No break/continue needed here, it will naturally re-plan below
        } else if (pauseResult.action === "modify") {
          checklist = pauseResult.checklist;
          if (onChecklist) onChecklist(checklist);
          if (serializer) serializer.updateChecklist(checklist);
          needsPlanApproval = false; // Usually if they manually modified it they don't want to re-approve immediately?
          // Actually, let's keep it false if they just modified it themselves.
        }
      }

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
      let screenshotPath = "";

      if (screenshot && screenshotsDir) {
        const screenshotFileName = `step-${stepCounter}.jpg`;
        const fullPath = path.join(screenshotsDir, screenshotFileName);
        await fs.writeFile(fullPath, screenshot);
        screenshotPath = `media://${fullPath}`;
      }

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

      const planningStartTime = Date.now();
      if (onPlanning) onPlanning(true);

      let planRetries = 0;
      const maxPlanRetries = 3;
      while (planRetries < maxPlanRetries) {
        try {
          checklist = await planTask({
            model,
            requirement,
            checklist,
            snapshot,
            history,
            planningPrompt,
            screenshot,
            supportsVision,
          });
          break;
        } catch (e: any) {
          planRetries++;
          let errorMessage = e.message;
          const details = extractSchemaErrors(e);
          if (details) {
            errorMessage = `Schema validation failed:\n${details}`;
          }


          const rawResponse = e.text || e.cause?.text || e.response?.text;
          console.log(`[Agent][Planner] Raw response:`, rawResponse);

          history.push({
            role: "assistant",
            content: [
              {
                type: "text",
                text: rawResponse || JSON.stringify({ error: errorMessage }),
              },
            ],
          });
          history.push({
            role: "user",
            content: [
              {
                type: "text",
                text: `Your previous response failed schema validation.\n\nERROR:\n${errorMessage}\n\nPlease correct your output based on the ChecklistSchema.`,
              },
            ],
          });

          if (planRetries >= maxPlanRetries) {
            if (onPlanning) onPlanning(false);
            const latestUserText = `Goal: ${requirement}\n\nChecklist: ${JSON.stringify(checklist, null, 2)}\n\nCurrent State:\n${snapshot}`;
            const tokenBreakdown = getTokenBreakdown({
              systemPrompt: planningPrompt,
              history,
              latestUserText,
              screenshot,
              supportsVision,
            });
            console.error(`[Agent][Planner] Error occurred. Input token size breakdown:`, tokenBreakdown);

            if (artifactsDir) {
              await saveAgentErrorReport(
                artifactsDir,
                {
                  error: e,
                  type: "planning",
                  step: stepCounter,
                  requirement,
                  url: currentUrl,
                  history: [...history],
                  snapshot,
                  axTree,
                  refs,
                  checklist,
                  llmPrompt: planningPrompt,
                  llmRawResponse: rawResponse,
                  tokenBreakdown,
                },
                browser,
              );
            }
            throw e;
          }
        }
      }

      console.log("[Agent][Planner] Planning result:", checklist);
      if (onChecklist) onChecklist(checklist);
      if (serializer) serializer.updateChecklist(checklist);

      if (needsPlanApproval && onPlanApproval) {
        if (onPlanning) onPlanning(false);
        const approvalResult = await onPlanApproval(checklist);
        if (approvalResult.action === "reject")
          throw new Error("Plan rejected by user");
        if (approvalResult.action === "modify") {
          checklist = approvalResult.checklist;
          if (onChecklist) onChecklist(checklist);
          if (serializer) serializer.updateChecklist(checklist);
        }
        needsPlanApproval = false;
      }

      // Safety: If no next task is found but the goal isn't marked as achieved,
      // check if all existing tasks are finished. If so, treat it as goal completion.
      const allTasksFinished =
        checklist.tasks.length > 0 &&
        checklist.tasks.every(
          (t) => t.status === "completed" || t.status === "failed",
        );
      if (
        !checklist.nextTaskId &&
        !checklist.finished &&
        allTasksFinished
      ) {
        console.log(
          "[Agent] Implicit goal achievement detected (all tasks finished).",
        );
        checklist.finished = true;
      }

      if (!checklist.finished) {
        history.push({
          role: "assistant",
          content: [
            {
              type: "text" as const,
              text: `I am updating the plan. ${checklist.currentStateDescription}. ${checklist.tasks.length} tasks in total.`,
            },
          ],
        });
        if (history.length > 20) history.splice(0, 2);
      }
      if (checklist.finished) {
        console.log(
          `[Agent] Planner indicates goal achieved: ${checklist.currentStateDescription}`,
        );
      }

      if (checklist.finished) {
        if (screenshotPath && !checklist.screenshot) {
          checklist.screenshot = screenshotPath;
        }
        if (serializer) {
          checklist.issues =
            serializer.getTest()?.issues.map((i) => ({
              id: i.id,
              description: i.description,
              severity: i.severity,
            })) || [];
          serializer.updateChecklist(checklist);
          await serializer.saveTest();
        }

        if (onGoalReached) {
          console.log(`[Agent] Goal achieved. Requesting human validation...`);
          const validationResult = await onGoalReached(checklist);
          if (validationResult.action === "validate") break;
          if (validationResult.action === "cancel")
            throw new Error("Execution cancelled by user during validation");
          if (validationResult.action === "prompt") {
            console.log(
              `[Agent] Human prompted further: ${validationResult.feedback}`,
            );
            requirement += `\nLatest User Feedback: ${validationResult.feedback}`;
            checklist.finished = false;
            needsPlanApproval = true; // Force re-approval of the next plan
            continue; // Go back to planning
          }
        } else {
          break;
        }
      }
      let currentTaskId = checklist.nextTaskId;

      // Fallback: If the model didn't provide nextTaskId, pick the first pending task
      if (!currentTaskId) {
        const firstPending = checklist.tasks.find(
          (t) => t.status === "pending" || t.status === "in_progress",
        );
        if (firstPending) {
          console.log(
            `[Agent] Fallback: No nextTaskId provided, picking first pending task: ${firstPending.id}`,
          );
          currentTaskId = firstPending.id;
        }
      }

      const currentTask = checklist.tasks.find((t) => t.id === currentTaskId);

      if (onStep && currentTask) {
        onStep({
          id: `planning-${stepCounter}`,
          step: `Planning: ${currentTask.id}`,
          status: "success",
          duration: `${((Date.now() - planningStartTime) / 1000).toFixed(1)}s`,
          description: `Strategic focus: ${currentTask.description}`,
          stateDescription: checklist.currentStateDescription,
          screenshot: screenshotPath,
          url: currentUrl,
        });
      }
      if (onPlanning) onPlanning(false);

      if (!currentTaskId || !currentTask) {
        console.log(`[Agent] No further tasks provided. Terminating loop.`);
        break;
      }

      if (currentTaskId !== lastTaskId) {
        currentTaskBeforeSnapshot = snapshot;
        currentTaskBeforeUrl = currentUrl;
        currentTaskBeforeScreenshot = screenshot;
        browser.networkLogs = [];
        lastTaskId = currentTaskId;
      }

      const knownIssuesText =
        serializer && serializer.getTest()?.issues.length
          ? `\n\nPreviously Identified Issues:\n${serializer
            .getTest()
            ?.issues.map((i) => `- ${i.id} (${i.severity}): ${i.description}`)
            .join("\n")}`
          : "";

      const consoleLogs = browser.consoleLogs
        .map((l) => `[${l.type}] ${l.text}`)
        .join("\n");
      const networkErrors = browser.networkLogs
        .filter((n) => n.status >= 400)
        .map((n) => `[${n.method}] ${n.url} (${n.status})`)
        .join("\n");
      const technicalObservations =
        consoleLogs || networkErrors
          ? `\n\nTechnical Observations:\n${consoleLogs ? `Console Logs:\n${consoleLogs}\n` : ""}${networkErrors ? `Network Errors:\n${networkErrors}\n` : ""}`
          : "";

      const executionPrompt =
        executionPromptTemplate
          .replace("{taskDescription}", currentTask.description)
          .replace("{overallGoal}", requirement) +
        technicalObservations +
        knownIssuesText;
      let executionResponse: ExecutionResponse | undefined;
      let retries = 0;
      const maxRetries = 3;
      const actionStartTime = Date.now();

      while (retries < maxRetries) {
        try {
          const currentIssues =
            serializer?.getTest()?.issues || checklist.issues || [];
          const issuesSummary = currentIssues
            .map((i) => `${i.id}: ${i.description}`)
            .join("; ");

          console.log("[Agent][Executor] Beginning execution prompt");

          executionResponse = await executeTask({
            model,
            requirement,
            currentTask,
            checklist,
            snapshot,
            history,
            executionPromptTemplate,
            screenshot,
            supportsVision,
            consecutiveSameAction,
            serializer,
          });
          break;
        } catch (e: any) {
          retries++;
          let errorMessage = e.message;
          const details = extractSchemaErrors(e);
          if (details) {
            errorMessage = `Schema validation failed:\n${details}`;
          }

          const rawResponse = e.text || e.cause?.text || e.response?.text;
          console.log(`[Agent][Executor] Raw response:`, rawResponse);
          history.push({
            role: "assistant",
            content: [
              {
                type: "text",
                text: e.text || JSON.stringify({ error: errorMessage }),
              },
            ],
          });
          history.push({
            role: "user",
            content: [
              {
                type: "text",
                text: `Your previous response failed schema validation.\n\nERROR:\n${errorMessage}\n\nPlease correct your output based on the ExecutionResponseSchema.`,
              },
            ],
          });

          if (retries >= maxRetries) {
            const currentIssues =
              serializer?.getTest()?.issues || checklist.issues || [];
            const issuesSummary = currentIssues
              .map((i) => `${i.id}: ${i.description}`)
              .join("; ");
            const latestUserText = `Goal: ${requirement}\nTask: ${currentTask.description}\n\nIdentified Issues: ${issuesSummary || "None"}\n\nCurrent State:\n${snapshot}${consecutiveSameAction && consecutiveSameAction > 0 ? `\n\nWARNING: You are repeating an action that recently failed. Try a different approach.` : ""}`;

            const tokenBreakdown = getTokenBreakdown({
              systemPrompt: executionPrompt,
              history,
              latestUserText,
              screenshot,
              supportsVision,
            });
            console.error(`[Agent][Executor] Error occurred. Input token size breakdown:`, tokenBreakdown);

            if (artifactsDir) {
              await saveAgentErrorReport(
                artifactsDir,
                {
                  error: e,
                  type: "execution",
                  step: stepCounter,
                  requirement,
                  url: currentUrl,
                  taskId: currentTaskId,
                  taskDescription: currentTask.description,
                  history: [...history],
                  snapshot,
                  axTree,
                  refs,
                  checklist,
                  llmPrompt: executionPrompt,
                  llmRawResponse: e.text,
                  tokenBreakdown,
                },
                browser,
              );
            }
            throw new Error(errorMessage);
          }
        }
      }

      if (!executionResponse)
        throw new Error(
          "[Agent][Executor] Failed to generate a valid execution response.",
        );

      const action = executionResponse.action;
      mapRefsToIdentifiers(action, refs);

      const actionStr = JSON.stringify(action);
      if (actionStr === lastActionString) {
        consecutiveSameAction++;
        if (consecutiveSameAction > 3)
          throw new Error(
            `Agent stuck in loop: repeated the same action 3 times: ${actionStr}`,
          );
      } else {
        lastActionString = actionStr;
        consecutiveSameAction = 0;
      }

      if (action.kind === "stop" || action.kind === "none") {
        console.log(
          `[Agent][Executor] Task completion indicated via ${action.kind}.`,
        );
        executionResponse.isTaskComplete = true;
      } else {
        try {
          await browser.execute(action);

          if (serializer && executionResponse.previousActionResult) {
            serializer.updatePreviousResult(
              executionResponse.previousActionResult,
            );
          }

          if (onStep) {
            onStep({
              id: `exec-${stepCounter}`,
              step: `Executing: ${action.kind}`,
              status: "success",
              duration: `${((Date.now() - actionStartTime) / 1000).toFixed(1)}s`,
              description: executionResponse.intendedActionDescription,
              stateDescription: executionResponse.currentStateDescription,
              screenshot: screenshotPath,
              action,
              issues: executionResponse.issues,
              url: browser.page?.url() || "",
            });
          }

          history.push({
            role: "assistant",
            content: [
              {
                type: "text",
                text: `Observation: ${executionResponse.currentStateDescription}\nAction: ${executionResponse.intendedActionDescription}${executionResponse.issues && executionResponse.issues.length > 0 ? `\nIssues: ${executionResponse.issues.join(", ")}` : ""}`,
              },
            ],
          });

          if (serializer) {
            serializer.logAction(action, {
              stateDescription: executionResponse.currentStateDescription,
              actionIntent: executionResponse.intendedActionDescription,
              taskId: currentTaskId,
              stateSnapshot: screenshotPath,
              issues: executionResponse.issues,
            });
            if (onIssuesUpdate)
              onIssuesUpdate(serializer.getTest()?.issues || []);
            await serializer.saveTest();
          }
        } catch (e: any) {
          console.error(`[Agent] Action failed: ${e.message}`);

          const currentIssues =
            serializer?.getTest()?.issues || checklist.issues || [];
          const issuesSummary = currentIssues
            .map((i) => `${i.id}: ${i.description}`)
            .join("; ");
          const latestUserText = `Goal: ${requirement}\nTask: ${currentTask.description}\n\nIdentified Issues: ${issuesSummary || "None"}\n\nCurrent State:\n${snapshot}${consecutiveSameAction && consecutiveSameAction > 0 ? `\n\nWARNING: You are repeating an action that recently failed. Try a different approach.` : ""}`;

          const tokenBreakdown = getTokenBreakdown({
            systemPrompt: executionPrompt,
            history,
            latestUserText,
            screenshot,
            supportsVision,
          });
          console.error(`[Agent][Browser] Action failed. Input token size breakdown:`, tokenBreakdown);

          if (artifactsDir) {
            await saveAgentErrorReport(
              artifactsDir,
              {
                error: e,
                type: "browser",
                step: stepCounter,
                requirement,
                url: browser.page?.url() || currentUrl,
                taskId: currentTaskId,
                taskDescription: currentTask.description,
                history: [...history],
                snapshot,
                axTree,
                refs,
                checklist,
                tokenBreakdown,
              },
              browser,
            );
          }

          let errorScreenshotPath = "";
          if (screenshot && screenshotsDir) {
            const screenshotFileName = `step-${stepCounter}-error.jpg`;
            const fullPath = path.join(screenshotsDir, screenshotFileName);
            await fs.writeFile(fullPath, screenshot);
            errorScreenshotPath = `media://${fullPath}`;
          }

          if (onStep) {
            onStep({
              id: `exec-fail-${stepCounter}`,
              step: `Failed: ${action.kind}`,
              status: "failed",
              error: e.message,
              duration: `${((Date.now() - actionStartTime) / 1000).toFixed(1)}s`,
              description: `Action failed: ${executionResponse.intendedActionDescription}`,
              stateDescription: `ERROR: ${e.message}`,
              screenshot: errorScreenshotPath || "",
              action,
              url: browser.page?.url() || "",
            });
          }
          history.push({
            role: "user",
            content: [
              {
                type: "text",
                text: `ACTION FAILED: ${e.message}. Please try a different approach (e.g., look for alternative selectors, scroll, or wait).`,
              },
            ],
          });
          if (history.length > 20) history.splice(0, 2);
          stepCounter++;
          continue; // RE-PLAN with error context
        }
      }

      if (executionResponse.isTaskComplete) {
        await browser.waitForStability();
        const { text: afterSnapshot, refs: afterRefs } =
          await browser.getSnapshotForLLM(false, false, fullSnapshot);
        const afterUrl = browser.page?.url() || "";
        const afterActionScreenshot = await browser.page?.screenshot({
          type: "jpeg",
          quality: 80,
        });

        const verificationStartTime = Date.now();
        let assertionRetries = 0;
        let assertionResponse: AssertionAgentResponse | undefined;
        const assertionHistory: any[] = [];

        while (assertionRetries < 3) {
          try {
            const currentIssues =
              serializer?.getTest()?.issues || checklist.issues || [];
            const issuesSummary = currentIssues
              .map((i) => `${i.id}: ${i.description}`)
              .join("; ");

            const assertionResult = await generateObject({
              model,
              schema: AssertionAgentResponseSchema,
              system: assertionPromptTemplate,
              messages: [
                {
                  role: "user" as const,
                  content: [
                    {
                      type: "text" as const,
                      text: `Task: ${currentTask.description}\nGoal: ${requirement}\n\nIdentified Issues: ${issuesSummary || "None"}\n\nBEFORE Snapshot:\n${currentTaskBeforeSnapshot}\nAFTER Snapshot:\n${afterSnapshot}\n\nNetwork Logs:\n${JSON.stringify(browser.networkLogs, null, 2)}\n\nConsole Logs:\n${JSON.stringify(browser.consoleLogs, null, 2)}`,
                    },
                    ...(currentTaskBeforeScreenshot && supportsVision
                      ? [prepareImagePart(currentTaskBeforeScreenshot)]
                      : []),
                    ...(afterActionScreenshot && supportsVision
                      ? [prepareImagePart(afterActionScreenshot)]
                      : []),
                  ],
                },
                ...assertionHistory,
              ],
            });
            assertionResponse = assertionResult.object;

            if (assertionResponse && assertionResponse.assertions && assertionResponse.assertions.length > 0) {
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
              assertionResponse.assertions = passed;

              if (failures.length > 0) {
                console.error(
                  `[Agent][Asserter] Assertions FAILED: ${failures.join("\n")}`,
                );
                assertionHistory.push({
                  role: "assistant",
                  content: [
                    { type: "text", text: JSON.stringify(assertionResponse) },
                  ],
                });
                assertionHistory.push({
                  role: "user",
                  content: [
                    {
                      type: "text",
                      text: `The assertions you generated failed programmatic verification: ${failures.join("\n")}. Please generate different assertions that correctly reflect the actual task completion state.`,
                    },
                  ],
                });
                assertionRetries++;
                continue;
              }
            }
            break;
          } catch (e: any) {
            assertionRetries++;
            let errorMessage = e.message;
            const details = extractSchemaErrors(e);
            if (details) {
              errorMessage = `Schema validation failed:\n${details}`;
            }
            const rawResponse = e.text || e.cause?.text || e.response?.text;
            console.log(`[Agent][Asserter] Raw response:`, rawResponse);

            const currentIssues =
              serializer?.getTest()?.issues || checklist.issues || [];
            const issuesSummary = currentIssues
              .map((i) => `${i.id}: ${i.description}`)
              .join("; ");
            const latestUserText = `Task: ${currentTask.description}\nGoal: ${requirement}\n\nIdentified Issues: ${issuesSummary || "None"}\n\nBEFORE Snapshot:\n${currentTaskBeforeSnapshot}\nAFTER Snapshot:\n${afterSnapshot}\n\nNetwork Logs:\n${JSON.stringify(browser.networkLogs, null, 2)}\n\nConsole Logs:\n${JSON.stringify(browser.consoleLogs, null, 2)}`;

            const systemPromptTokens = estimateTextTokens(assertionPromptTemplate);
            const historyTokens = assertionHistory.reduce((sum: number, msg: any) => {
              if (typeof msg.content === "string") {
                return sum + estimateTextTokens(msg.content);
              } else if (Array.isArray(msg.content)) {
                return sum + msg.content.reduce((innerSum: number, part: any) => {
                  if (part.type === "text") {
                    return innerSum + estimateTextTokens(part.text);
                  } else if (part.type === "image") {
                    return innerSum + estimateImageTokens(part.image);
                  }
                  return innerSum;
                }, 0);
              }
              return sum;
            }, 0);

            const latestUserTextTokens = estimateTextTokens(latestUserText);

            let imageTokens = 0;
            if (currentTaskBeforeScreenshot && supportsVision) imageTokens += estimateImageTokens(currentTaskBeforeScreenshot);
            if (afterActionScreenshot && supportsVision) imageTokens += estimateImageTokens(afterActionScreenshot);

            const totalTokens = systemPromptTokens + historyTokens + latestUserTextTokens + imageTokens;

            const tokenBreakdown = {
              systemPromptTokens,
              historyTokens,
              latestUserTextTokens,
              imageTokens,
              totalTokens,
            };

            console.error(`[Agent][Asserter] Error occurred. Input token size breakdown:`, tokenBreakdown);

            if (assertionRetries >= 3 && artifactsDir) {
              await saveAgentErrorReport(
                artifactsDir,
                {
                  error: e,
                  type: "verification",
                  step: stepCounter,
                  requirement,
                  url: browser.page?.url() || currentUrl,
                  taskId: currentTaskId,
                  taskDescription: currentTask.description,
                  history: [...history],
                  snapshot: afterSnapshot,
                  refs: afterRefs,
                  checklist,
                  llmPrompt: assertionPromptTemplate,
                  llmRawResponse: e.text,
                  tokenBreakdown,
                },
                browser,
              );
            }

            assertionHistory.push({
              role: "user",
              content: [
                {
                  type: "text",
                  text: `Your previous response failed schema validation.\n\nERROR:\n${errorMessage}\n\nPlease corrective-output a valid object.`,
                },
              ],
            });
          }
        }

        if (!assertionResponse)
          throw new Error("Failed to verify task after 3 attempts.");

        if (onStep) {
          onStep({
            id: `verify-${stepCounter}`,
            step: `Verifying: ${currentTaskId}`,
            status: assertionResponse.isTaskVerified ? "success" : "failed",
            duration: `${((Date.now() - verificationStartTime) / 1000).toFixed(1)}s`,
            description: assertionResponse.verificationReasoning,
            stateDescription: assertionResponse.currentStateDescription,
            screenshot: "", // Placeholder, or save to disk if needed. For now, empty is safer than base64.
            issues: assertionResponse.issues,
            url: browser.page?.url() || "",
          });
        }

        if (serializer) {
          if (assertionResponse.assertions.length > 0) {
            serializer.logVerificationToLastStep(assertionResponse.assertions);
          }
          if (assertionResponse.issues) {
            serializer.logFindings(
              `step-${stepCounter}`,
              assertionResponse.issues,
            );
            if (onIssuesUpdate)
              onIssuesUpdate(serializer.getTest()?.issues || []);
          }
        }

        history.push({
          role: "assistant",
          content: [
            {
              type: "text" as const,
              text: `Verification Reasoning: ${assertionResponse.verificationReasoning}${assertionResponse.issues && assertionResponse.issues.length > 0 ? `\nIssues found during verify: ${assertionResponse.issues.join(", ")}` : ""}`,
            },
          ],
        });
        if (history.length > 20) history.splice(0, 2);

        const tIdx = checklist.tasks.findIndex((t) => t.id === currentTaskId);
        if (tIdx !== -1) {
          checklist.tasks[tIdx].status = assertionResponse.isTaskVerified
            ? "completed"
            : "pending";
          checklist.tasks[tIdx].result =
            assertionResponse.verificationReasoning;
          if (onChecklist) onChecklist(checklist);
        }
      }

      if (action.kind === "screenshot" && action.name === "success") {
        console.log(`[Agent][Executor] Final success milestone reached.`);
        checklist.finished = true;
      }

      stepCounter++;
    }
  } finally {
    if (serializer) {
      serializer.updateChecklist(checklist);
      await serializer.saveTest();
    }
  }
}


