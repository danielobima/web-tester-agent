import { type LanguageModel, generateObject } from "ai";
import { BrowserManager } from "./browser";
import { TestSerializer } from "./recorder";
import * as fs from "fs/promises";
import * as path from "path";
import * as data from "./data";
import { z } from "zod";
import { evaluateAssertions } from "./replay";
import { saveAgentErrorReport, type TokenBreakdown } from "./error_logger";
import {
  prepareImagePart,
  getProviderOptions,
  generateObjectWithTimeout,
} from "./utils";

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
  runWithSchemaRecovery,
  extractSchemaErrors,
  reformatJsonWithAgent,
  interceptVariables,
} from "./agent/utils";

import { planTask } from "./agent/planner";
import { executeTask } from "./agent/executor";
import { runFallbackAnalyser } from "./fallback-analyser";

import {
  Checklist,
  ChecklistSchema,
  ExecutionResponse,
  ExecutionResponseSchema,
  VisualExecutionResponse,
  getVisualExecutionResponseSchema,
  AssertionAgentResponse,
  AssertionAgentResponseSchema,
  getExecutionResponseSchema,
} from "./actions";

export async function runVisualAgent(
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
  appId?: string,
  testId?: string,
) {
  let activeVariables: data.Variable[] = [];
  if (appId) {
    const allVars = await data.listVariables(appId);
    const appVars = allVars.filter(v => !v.testId);
    const testVars = testId ? allVars.filter(v => v.testId === testId) : [];
    activeVariables = data.resolveVariables(appVars, testVars);
  }
  if (serializer) {
    serializer.setVariables(activeVariables);
  }
  const history: AgentHistoryMessage[] = [];
  let stepCounter = 1;
  let needsPlanApproval = !autoApprovePlan;
  let checklist: Checklist = {
    currentStateDescription: "Starting visual-first test execution",
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

  // Load visual-specific prompts
  const planningPrompt = await fs.readFile(
    path.join(__dirname, "prompts", "visual-planning.txt"),
    "utf-8",
  );
  const executionPromptTemplate = await fs.readFile(
    path.join(__dirname, "prompts", "visual-execution.txt"),
    "utf-8",
  );
  const searchPromptTemplate = await fs.readFile(
    path.join(__dirname, "prompts", "visual-search.txt"),
    "utf-8",
  );
  const assertionPromptTemplate = await fs.readFile(
    path.join(__dirname, "prompts", "visual-assertion.txt"),
    "utf-8",
  );

  let consecutiveSameAction = 0;
  let lastActionString = "";
  let lastTaskId = "";
  let currentTaskBeforeSnapshot = "";
  let currentTaskBeforeUrl = "";
  let currentTaskBeforeScreenshot: Buffer | undefined;

  console.log(`[VisualAgent] Starting visual-first execution loop...`);

  try {
    while (stepCounter < 50) {
      if (signal?.aborted) {
        throw new Error("Test run aborted by user.");
      }

      let currentRequirement = requirement;
      if (activeVariables.length > 0) {
        const formattedVars = activeVariables
          .map(
            (v) =>
              `- ${v.name} (${v.type}): ${v.value} [Purpose: ${v.purpose}]`,
          )
          .join("\n");
        currentRequirement += `\n\nAvailable Application Variables:\n${formattedVars}`;
      }

      console.log(`\n--- Step ${stepCounter} ---`);
      await browser.waitForStability(1500);

      const currentUrl = browser.page ? browser.page.url() : "";
      console.log(`[VisualAgent] Fetching snapshot and screenshot locally...`);

      const {
        text: snapshot,
        axTree,
        refs,
      } = await browser.getSnapshotForLLM(false, false, fullSnapshot);

      let screenshot: Buffer | undefined;
      let screenshotPath = "";

      if (browser.page) {
        if (screenshotsDir) {
          const fullPath = path.join(
            screenshotsDir,
            `step-${stepCounter}-${Date.now()}.png`,
          );
          try {
            const somRes = await browser.captureAnnotatedScreenshot(fullPath);
            screenshot = somRes.buffer;
            console.log(
              `[VisualAgent] SoM Annotated Screenshot saved to: ${fullPath} (${somRes.marks.totalMarks} interactive marks detected)`,
            );
          } catch (somErr) {
            screenshot = await browser.page.screenshot({ path: fullPath });
            console.log("[VisualAgent] Standard screenshot saved to:", fullPath);
          }
          screenshotPath = `media://${fullPath}`;
        } else {
          try {
            const somRes = await browser.captureAnnotatedScreenshot();
            screenshot = somRes.buffer;
          } catch {
            screenshot = await browser.page.screenshot();
          }
        }
      }

      if (onIssuesUpdate && serializer) {
        onIssuesUpdate(serializer.getTest()?.issues || []);
      }

      // Check pause request from UI
      if (onManualPause) {
        const pauseResult = await onManualPause(checklist);
        if (pauseResult.action === "reprompt") {
          requirement += `\nLatest User Feedback: ${pauseResult.feedback}`;
          needsPlanApproval = true;
        } else if (pauseResult.action === "modify") {
          checklist = pauseResult.checklist;
          if (onChecklist) onChecklist(checklist);
          if (serializer) serializer.updateChecklist(checklist);
        }
      }

      if (onPlanning) onPlanning(true);
      const planningStartTime = Date.now();

      const visualStateSnapshot =
        "(DOM snapshot hidden. Focus entirely on the visual layout, URL, and checklist.)";

      checklist = await runWithSchemaRecovery({
        model,
        schema: ChecklistSchema,
        label: "Planner",
        history,
        abortSignal: signal,
        taskFn: () =>
          planTask({
            model,
            requirement: currentRequirement,
            checklist,
            snapshot: visualStateSnapshot,
            history,
            planningPrompt,
            screenshot,
            supportsVision,
            abortSignal: signal,
          }),
        onMaxRetriesExceeded: async (e) => {
          if (onPlanning) onPlanning(false);
          const tokenBreakdown = getTokenBreakdown({
            systemPrompt: planningPrompt,
            history,
            latestUserText: `Goal: ${currentRequirement}\n\nChecklist: ${JSON.stringify(checklist, null, 2)}`,
            screenshot,
            supportsVision,
          });

          if (artifactsDir) {
            await saveAgentErrorReport(
              artifactsDir,
              {
                error: e,
                type: "planning",
                step: stepCounter,
                requirement: currentRequirement,
                url: currentUrl,
                history: [...history],
                snapshot,
                axTree,
                refs,
                checklist,
                llmPrompt: planningPrompt,
                llmRawResponse: e.text || e.cause?.text || e.response?.text,
                tokenBreakdown,
              },
              browser,
            );
          }
        },
      });

      console.log("[VisualAgent][Planner] Planning result:", checklist);
      if (onChecklist) onChecklist(checklist);
      if (serializer) {
        serializer.updateChecklist(checklist);
        if (checklist.issues && checklist.issues.length > 0) {
          serializer.logFindings(`step-${stepCounter}`, checklist.issues);
          if (onIssuesUpdate) {
            onIssuesUpdate(serializer.getTest()?.issues || []);
          }
        }
        await serializer.saveTest();
      }

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

      const allTasksFinished =
        checklist.tasks.length > 0 &&
        checklist.tasks.every(
          (t) => t.status === "completed" || t.status === "failed",
        );
      if (!checklist.nextTaskId && !checklist.finished && allTasksFinished) {
        console.log(
          "[VisualAgent] Implicit goal achievement detected (all tasks finished).",
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
          console.log(
            `[VisualAgent] Goal achieved. Requesting human validation...`,
          );
          const validationResult = await onGoalReached(checklist);
          if (validationResult.action === "validate") break;
          if (validationResult.action === "cancel")
            throw new Error("Execution cancelled by user during validation");
          if (validationResult.action === "prompt") {
            console.log(
              `[VisualAgent] Human prompted further: ${validationResult.feedback}`,
            );
            requirement += `\nLatest User Feedback: ${validationResult.feedback}`;
            checklist.finished = false;
            needsPlanApproval = true;
            continue;
          }
        } else {
          break;
        }
      }

      let currentTaskId = checklist.nextTaskId;
      if (!currentTaskId) {
        const firstPending = checklist.tasks.find(
          (t) => t.status === "pending" || t.status === "in_progress",
        );
        if (firstPending) {
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
        console.log(
          `[VisualAgent] No further tasks provided. Terminating loop.`,
        );
        break;
      }

      if (currentTaskId !== lastTaskId) {
        currentTaskBeforeSnapshot = snapshot;
        currentTaskBeforeUrl = currentUrl;
        currentTaskBeforeScreenshot = screenshot;
        browser.networkLogs = [];
        lastTaskId = currentTaskId;
      }

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

      const visualExecutionSnapshot = `Current URL: ${currentUrl}${technicalObservations}`;
      let searchResultsText = "";
      let afterSnapshotText = "";

      const taskType = (currentTask as any).type || "general";
      let taskPromptTemplate = executionPromptTemplate;
      try {
        const visualSpecializedPath = path.join(
          __dirname,
          "prompts",
          `visual-execution-${taskType}.txt`,
        );
        const specializedContent = await fs.readFile(
          visualSpecializedPath,
          "utf-8",
        );
        taskPromptTemplate =
          specializedContent + "\n\n" + executionPromptTemplate;
      } catch (err) {
        try {
          const specializedPath = path.join(
            __dirname,
            "prompts",
            `execution-${taskType}.txt`,
          );
          const specializedContent = await fs.readFile(
            specializedPath,
            "utf-8",
          );
          taskPromptTemplate =
            specializedContent + "\n\n" + executionPromptTemplate;
        } catch (e) {
          taskPromptTemplate = executionPromptTemplate;
        }
      }

      const executionPrompt =
        taskPromptTemplate
          .replace("{taskDescription}", currentTask.description)
          .replace("{overallGoal}", currentRequirement) + technicalObservations;

      let executionResponse!: VisualExecutionResponse;
      let executionSuccess = false;
      let visualAttempts = 0;
      const maxVisualAttempts = 3;
      let lastExecError = "";
      const actionStartTime = Date.now();

      while (visualAttempts < maxVisualAttempts && !executionSuccess) {
        visualAttempts++;
        if (signal?.aborted) {
          throw new Error("Test run aborted by user.");
        }

        console.log(`[VisualAgent][Executor] Beginning visual execution turn (Attempt ${visualAttempts}/${maxVisualAttempts})`);

        const specializedSchema = getVisualExecutionResponseSchema(taskType);

        executionResponse = await runWithSchemaRecovery({
          model,
          schema: specializedSchema,
          label: `Executor-Attempt-${visualAttempts}`,
          history,
          abortSignal: signal,
          taskFn: () =>
            executeTask({
              model,
              requirement: currentRequirement,
              currentTask,
              checklist,
              snapshot: visualExecutionSnapshot,
              history,
              executionPromptTemplate: executionPrompt,
              screenshot,
              supportsVision,
              consecutiveSameAction,
              serializer,
              abortSignal: signal,
              schema: specializedSchema,
            }),
          onMaxRetriesExceeded: async (e) => {
            const tokenBreakdown = getTokenBreakdown({
              systemPrompt: executionPrompt,
              history,
              latestUserText: `Goal: ${currentRequirement}\nTask: ${currentTask.description}`,
              screenshot,
              supportsVision,
            });

            if (artifactsDir) {
              await saveAgentErrorReport(
                artifactsDir,
                {
                  error: e,
                  type: "execution",
                  step: stepCounter,
                  requirement: currentRequirement,
                  url: currentUrl,
                  taskId: currentTaskId,
                  taskDescription: currentTask.description,
                  history: [...history],
                  snapshot: visualExecutionSnapshot,
                  axTree,
                  refs,
                  checklist,
                  llmPrompt: executionPrompt,
                  llmRawResponse: e.text || e.cause?.text || e.response?.text,
                  tokenBreakdown,
                },
                browser,
              );
            }
          },
        });

        if (!executionResponse) {
          throw new Error(
            "[VisualAgent][Executor] Failed to generate a valid execution response.",
          );
        }

        const action: any = executionResponse.action;
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

        if (action.kind === "create_variable") {
          try {
            let extractedValue = "";
            if (action.source === "arbitrary") {
              extractedValue = action.value || "";
            } else if (action.source === "website_content") {
              if (action.ref) {
                const locator = await browser.getLocator(action.ref);
                extractedValue = await locator.innerText().catch(() => "");
              } else if (action.selector) {
                const locator = browser.page!.locator(action.selector);
                extractedValue = await locator.innerText().catch(() => "");
              }
            }

            if (action.regex) {
              const match = extractedValue.match(new RegExp(action.regex));
              if (match) {
                extractedValue = match[1] || match[0];
              } else {
                console.warn(
                  `[VisualAgent] Regex '${action.regex}' did not match extracted content.`,
                );
              }
            }

            console.log(
              `[VisualAgent] Extracted variable '${action.name}' value: '${extractedValue}'`,
            );

            const varName = data.normalizeVariableName(action.name);
            if (appId) {
              const vars = await data.listVariables(appId);
              const existingIndex = vars.findIndex((v) => data.isSimilarVariable(v, { name: varName, purpose: action.purpose }));
              const updatedVar: data.Variable = {
                id: existingIndex !== -1 ? vars[existingIndex].id : `var-${Date.now()}`,
                appId,
                name: existingIndex !== -1 ? vars[existingIndex].name : varName,
                type: action.type || (existingIndex !== -1 ? vars[existingIndex].type : "string"),
                value: extractedValue,
                purpose: action.purpose || (existingIndex !== -1 ? vars[existingIndex].purpose : ""),
                expiry: action.expiry || (existingIndex !== -1 ? vars[existingIndex].expiry : undefined),
                createdAt: existingIndex !== -1 ? vars[existingIndex].createdAt : Date.now(),
              };
              if (existingIndex !== -1) {
                vars[existingIndex] = updatedVar;
              } else {
                vars.push(updatedVar);
              }
              await data.saveVariables(vars);
              activeVariables = vars;
            } else {
              const existingIndex = activeVariables.findIndex((v) => data.isSimilarVariable(v, { name: varName, purpose: action.purpose }));
              const updatedVar: data.Variable = {
                id: existingIndex !== -1 ? activeVariables[existingIndex].id : `var-${Date.now()}`,
                appId: "cli",
                name: existingIndex !== -1 ? activeVariables[existingIndex].name : varName,
                type: action.type || (existingIndex !== -1 ? activeVariables[existingIndex].type : "string"),
                value: extractedValue,
                purpose: action.purpose || (existingIndex !== -1 ? activeVariables[existingIndex].purpose : ""),
                expiry: action.expiry || (existingIndex !== -1 ? activeVariables[existingIndex].expiry : undefined),
                createdAt: existingIndex !== -1 ? activeVariables[existingIndex].createdAt : Date.now(),
              };
              if (existingIndex !== -1) {
                activeVariables[existingIndex] = updatedVar;
              } else {
                activeVariables.push(updatedVar);
              }
            }

            executionResponse.previousActionResult = `Successfully created/updated variable '${action.name}' with value '${extractedValue}'.`;
            executionResponse.isTaskComplete = true;
            executionSuccess = true;

            if (onStep) {
              onStep({
                id: `step-${stepCounter}`,
                step: `Creating Variable: ${action.name}`,
                status: "success",
                duration: `${((Date.now() - actionStartTime) / 1000).toFixed(1)}s`,
                description: `Extracted value from ${action.source}. Purpose: ${action.purpose}`,
                stateDescription: `Variable '${action.name}' value: '${extractedValue}'`,
                screenshot: screenshotPath,
                action,
                issues: executionResponse.issues,
                url: browser.page?.url() || "",
              });
            }

            if (serializer) {
              serializer.logAction(action, {
                stateDescription: `Created variable ${action.name} with value ${extractedValue}`,
                actionIntent: `Declare variable ${action.name}`,
                taskId: currentTaskId,
                stateSnapshot: screenshotPath,
                issues: executionResponse.issues,
              });
              await serializer.saveTest();
            }
          } catch (e: any) {
            console.error(
              `[VisualAgent] Failed to create variable: ${e.message}`,
            );
            executionResponse.previousActionResult = `Failed to create variable: ${e.message}`;
            lastExecError = e.message;
          }
        } else if (action.kind === "stop" || action.kind === "none") {
          console.log(
            `[VisualAgent][Executor] Task completion indicated via ${action.kind}.`,
          );
          executionResponse.previousActionResult = `Task finished with ${action.kind}.`;
          executionResponse.isTaskComplete = true;
          executionSuccess = true;
        } else {
          try {
            try {
              activeVariables = await interceptVariables(
                action,
                browser,
                appId,
                activeVariables,
                executionResponse.intendedActionDescription,
                testId,
                taskType,
                currentTask.description,
                executionResponse.createdVariableName,
                executionResponse.createdVariablePurpose,
              );
              if (serializer) {
                serializer.setVariables(activeVariables);
              }
            } catch (interceptError) {
              console.warn("[VisualAgent] Failed to intercept variables:", interceptError);
            }

            await browser.execute(action);
            executionSuccess = true;
            executionResponse.previousActionResult = `Successfully executed action: ${action.kind}${action.ref ? ` on ref #${action.ref}` : ""}.`;

            // Get snapshot after action has completed
            try {
              const afterSnapshotObj = await browser.getSnapshotForLLM(
                false,
                false,
                fullSnapshot,
              );
              afterSnapshotText = afterSnapshotObj.text;
            } catch (snapshotError) {
              console.warn(
                "[VisualAgent] Failed to retrieve after-snapshot:",
                snapshotError,
              );
            }

            if (serializer && executionResponse.previousActionResult) {
              serializer.updatePreviousResult(
                executionResponse.previousActionResult,
              );
            }

            if (serializer) {
              serializer.logAction(action, {
                stateDescription: executionResponse.currentStateDescription,
                actionIntent: executionResponse.intendedActionDescription,
                taskId: currentTaskId,
                stateSnapshot: screenshotPath,
                issues: executionResponse.issues,
                usedVariables: executionResponse.usedVariables,
              });
              if (onIssuesUpdate)
                onIssuesUpdate(serializer.getTest()?.issues || []);
              await serializer.saveTest();
            }
          } catch (execError: any) {
            lastExecError = execError.message;
            console.warn(
              `[VisualAgent] Visual attempt ${visualAttempts} failed: ${execError.message}`,
            );
            executionResponse.previousActionResult = `Visual attempt ${visualAttempts} failed: ${execError.message}`;

            if (visualAttempts < maxVisualAttempts) {
              console.log("[VisualAgent] Re-capturing fresh SoM annotated screenshot for retry...");
              if (screenshotsDir && browser.page) {
                const retryPath = path.join(
                  screenshotsDir,
                  `step-${stepCounter}-retry-${visualAttempts}-${Date.now()}.png`,
                );
                try {
                  const retryRes = await browser.captureAnnotatedScreenshot(retryPath);
                  screenshot = retryRes.buffer;
                  screenshotPath = `media://${retryPath}`;
                } catch {
                  screenshot = await browser.page.screenshot().catch(() => undefined);
                }
              }
              // Record retry turn in history
              history.push({
                role: "assistant",
                content: [
                  {
                    type: "text",
                    text: JSON.stringify(executionResponse),
                  },
                ],
              });
              history.push({
                role: "user",
                content: [
                  {
                    type: "text",
                    text: `Action failed with error: "${execError.message}". Review the updated screenshot and select the correct mark number or action to proceed.`,
                  },
                ],
              });
            }
          }
        }
      }

      // If all visual attempts failed, invoke Fallback Analyser
      if (!executionSuccess) {
        console.log("[VisualAgent] Visual attempts exhausted. Invoking Fallback Dedicated Snapshot + Screenshot Analyser Agent...");
        const fallbackRes = await runFallbackAnalyser({
          model,
          requirement: currentRequirement,
          currentTask,
          checklist,
          failureReason: lastExecError,
          history,
          browser,
          serializer,
          signal,
          supportsVision,
          onStep,
        });

        if (fallbackRes.success) {
          console.log("[VisualAgent] Fallback Analyser successfully recovered test execution.");
          executionResponse = fallbackRes.response as any;
          executionSuccess = true;
          if (serializer) {
            serializer.logAction(fallbackRes.response.action, {
              stateDescription: fallbackRes.response.currentStateDescription,
              actionIntent: `[Fallback Recovery] ${fallbackRes.response.intendedActionDescription}`,
              taskId: currentTaskId,
              stateSnapshot: screenshotPath,
              issues: fallbackRes.response.issues,
            });
            await serializer.saveTest();
          }
        } else {
          console.warn("[VisualAgent] Fallback Analyser was unable to recover.");
          executionResponse.previousActionResult = `All visual attempts and fallback analyser failed. Last error: ${lastExecError}`;
          executionResponse.isTaskComplete = false;
        }
      }

      // Format observation logs for assertion
      const logsText = browser.consoleLogs
        .map((l) => `[${l.type}] ${l.text}`)
        .join("\n");
      const netText = browser.networkLogs
        .map((n) => `[${n.method}]${n.url}(${n.status})`)
        .join("\n");

      // Verify the task execution
      let isVerified = true;
      if (!skipAssertions && currentTask && executionResponse.isTaskComplete) {
        const assertionHistory: any[] = [];

        let assertionResponse;
        try {
          assertionResponse = await runWithSchemaRecovery({
            model,
            schema: AssertionAgentResponseSchema,
            label: "Asserter",
            history: assertionHistory,
            abortSignal: signal,
            taskFn: async () => {
              console.log(
                `[VisualAgent][Asserter] Verifying task completion...`,
              );
              const assertionResult = await generateObjectWithTimeout({
                model,
                schema: AssertionAgentResponseSchema,
                system: assertionPromptTemplate,
                providerOptions: getProviderOptions(model),
                messages: [
                  {
                    role: "user",
                    content: [
                      {
                        type: "text",
                        text: `Task: ${currentTask.description}\nGoal: ${currentRequirement}\n\nBEFORE URL: ${currentTaskBeforeUrl}\nAFTER URL: ${currentUrl}\n\nConsole Logs: \n${logsText || "None"} \n\nNetwork Logs: \n${netText || "None"} `,
                      },
                      ...(currentTaskBeforeScreenshot && supportsVision
                        ? [prepareImagePart(currentTaskBeforeScreenshot)]
                        : []),
                      ...(screenshot && supportsVision
                        ? [prepareImagePart(screenshot)]
                        : []),
                    ],
                  },
                ],
                abortSignal: signal,
              });

              const res = assertionResult.object;
              console.log(`[VisualAgent][Asserter] Response: `, res);

              if (serializer && res.issues && res.issues.length > 0) {
                serializer.logFindings(`step - ${stepCounter} `, res.issues);
                if (onIssuesUpdate)
                  onIssuesUpdate(serializer.getTest()?.issues || []);
              }

              const afterAx = await browser.getSnapshotForLLM(
                false,
                false,
                fullSnapshot,
              );
              const afterRefs = afterAx.refs;

              if (res.assertions && Array.isArray(res.assertions)) {
                for (const ass of res.assertions) {
                  mapRefsToIdentifiers(ass, afterRefs);
                }
                const { passed, failures } = await evaluateAssertions(
                  res.assertions,
                  browser,
                  afterRefs,
                );
                res.assertions = passed;

                if (failures.length > 0) {
                  isVerified = false;
                  throw new Error(
                    `The assertions you generated failed programmatic verification: ${failures.join("\n")}`,
                  );
                }
              }

              return res;
            },
            onMaxRetriesExceeded: (e) => {
              isVerified = false;
            },
          });
        } catch (error: any) {
          console.warn(
            `[VisualAgent][Asserter] ⚠️ Verification failed but continuing:`,
            error.message,
          );
          isVerified = false;
          assertionResponse = {
            currentStateDescription:
              "Failed to programmatically verify task completion.",
            assertions: [],
            isTaskVerified: false,
            verificationReasoning: `Programmatic verification of assertions failed. Continuing anyway. Details: ${error.message}`,
            issues: [],
          };
        }

        if (assertionResponse) {
          if (isVerified) {
            const tIdx = checklist.tasks.findIndex(
              (t) => t.id === currentTask.id,
            );
            if (tIdx !== -1) {
              checklist.tasks[tIdx].status = "completed";
              checklist.tasks[tIdx].result =
                assertionResponse.verificationReasoning;
              if (onChecklist) onChecklist(checklist);
            }
            if (
              serializer &&
              assertionResponse.assertions &&
              assertionResponse.assertions.length > 0
            ) {
              serializer.logVerificationToLastStep(
                assertionResponse.assertions,
              );
            }
          } else {
            const tIdx = checklist.tasks.findIndex(
              (t) => t.id === currentTask.id,
            );
            if (tIdx !== -1) {
              checklist.tasks[tIdx].status = "failed";
              checklist.tasks[tIdx].result =
                `Verification failed: ${assertionResponse.verificationReasoning} `;
              if (onChecklist) onChecklist(checklist);
            }
          }
        }
      } else if (executionResponse.isTaskComplete) {
        const tIdx = checklist.tasks.findIndex((t) => t.id === currentTask.id);
        if (tIdx !== -1) {
          checklist.tasks[tIdx].status = "completed";
          checklist.tasks[tIdx].result = "Task complete (assertions skipped)";
          if (onChecklist) onChecklist(checklist);
        }
      }

      const finalAction: any = executionResponse.action;

      // Show step update in UI
      if (onStep && currentTask) {
        onStep({
          id: `step-${stepCounter}`,
          step: `Action: ${finalAction.kind}`,
          status: isVerified ? "success" : "failed",
          duration: `${((Date.now() - actionStartTime) / 1000).toFixed(1)}s`,
          description: executionResponse.intendedActionDescription,
          stateDescription:
            executionResponse.previousActionResult ||
            checklist.currentStateDescription,
          screenshot: screenshotPath,
          url: currentUrl,
          action: finalAction,
          snapshotBefore: snapshot,
          searchResults: searchResultsText,
          snapshotAfter: afterSnapshotText,
          usedVariables: executionResponse.usedVariables,
        });
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

      // Record clean visual LLM history turn (sanitized to prevent fallback DOM attributes from polluting visual agent context)
      const sanitizedHistoryResponse = {
        currentStateDescription: executionResponse.currentStateDescription,
        intendedActionDescription: executionResponse.intendedActionDescription,
        action: {
          kind: executionResponse.action.kind,
          ...((executionResponse.action as any).ref ? { ref: (executionResponse.action as any).ref } : {}),
          ...((executionResponse.action as any).text ? { text: (executionResponse.action as any).text } : {}),
          ...((executionResponse.action as any).value ? { value: (executionResponse.action as any).value } : {}),
          ...((executionResponse.action as any).submit !== undefined ? { submit: (executionResponse.action as any).submit } : {}),
        },
        isTaskComplete: executionResponse.isTaskComplete,
        issues: executionResponse.issues,
      };

      history.push({
        role: "assistant",
        content: [
          {
            type: "text",
            text: JSON.stringify(sanitizedHistoryResponse),
          },
        ],
      });

      if (executionResponse.previousActionResult) {
        history.push({
          role: "user",
          content: [
            {
              type: "text",
              text: `Previous action result: ${executionResponse.previousActionResult}`,
            },
          ],
        });
      }

      if (history.length > 20) history.splice(0, 2);

      if (finalAction.kind === "screenshot" && finalAction.name === "success") {
        console.log(`[VisualAgent] Final success milestone reached.`);
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
