import { type LanguageModel, generateObject } from "ai";
import { BrowserManager } from "./browser";
import { TestSerializer } from "./recorder";
import * as fs from "fs/promises";
import * as path from "path";
import { z } from "zod";
import { evaluateAssertions } from "./replay";
import { saveAgentErrorReport, type TokenBreakdown } from "./error_logger";
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
  reformatJsonWithAgent,
} from "./agent/utils";

import { planTask } from "./agent/planner";
import { executeTask } from "./agent/executor";

import {
  Checklist,
  ChecklistSchema,
  ExecutionResponse,
  ExecutionResponseSchema,
  AssertionAgentResponse,
  AssertionAgentResponseSchema,
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
) {
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

      console.log(`\n--- Step ${stepCounter} ---`);
      await browser.waitForStability(1500);

      const currentUrl = browser.page ? browser.page.url() : "";
      console.log(`[VisualAgent] Fetching snapshot and screenshot locally...`);

      const {
        text: snapshot,
        axTree,
        refs,
      } = await browser.getSnapshotForLLM(false, false, fullSnapshot);

      const screenshot = browser.page
        ? await browser.page.screenshot()
        : undefined;
      let screenshotPath = "";

      if (screenshot && screenshotsDir) {
        const fullPath = path.join(
          screenshotsDir,
          `step-${stepCounter}-${Date.now()}.png`,
        );

        console.log("[VisualAgent] Screenshot saved to:", fullPath);
        await fs.writeFile(fullPath, screenshot);
        screenshotPath = `media://${fullPath}`;
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

      let planRetries = 0;
      const maxPlanRetries = 3;

      while (planRetries < maxPlanRetries) {
        try {
          // Pass a visual-first state placeholder to the planner
          const visualStateSnapshot =
            "(DOM snapshot hidden. Focus entirely on the visual layout, URL, and checklist.)";
          checklist = await planTask({
            model,
            requirement,
            checklist,
            snapshot: visualStateSnapshot,
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
            errorMessage = `${details}`;
            const rawResponse = e.text || e.cause?.text || e.response?.text;
            if (rawResponse) {
              try {
                checklist = await reformatJsonWithAgent({
                  model,
                  schema: ChecklistSchema,
                  rawResponse,
                  errors: details,
                });
                console.log(`[VisualAgent][Planner] Successfully recovered invalid JSON using reformatter agent!`);
                break;
              } catch (reformatErr: any) {
                console.error(`[VisualAgent][Planner] Reformatter agent failed:`, reformatErr);
              }
            }
          }

          const rawResponse = e.text || e.cause?.text || e.response?.text;
          console.log(`[VisualAgent][Planner] Raw response:`, rawResponse);

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
                text: `Your previous response failed schema validation.\n\nERROR:\n${errorMessage}\n\n`,
              },
            ],
          });

          if (planRetries >= maxPlanRetries) {
            if (onPlanning) onPlanning(false);
            const tokenBreakdown = getTokenBreakdown({
              systemPrompt: planningPrompt,
              history,
              latestUserText: `Goal: ${requirement}\n\nChecklist: ${JSON.stringify(checklist, null, 2)}`,
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

      console.log("[VisualAgent][Planner] Planning result:", checklist);
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

      const executionPrompt =
        executionPromptTemplate
          .replace("{taskDescription}", currentTask.description)
          .replace("{overallGoal}", requirement) + technicalObservations;

      let executionResponse: ExecutionResponse | undefined;
      let retries = 0;
      const maxRetries = 3;
      const actionStartTime = Date.now();

      let searchesCount = 0;
      const maxSearches = 5;

      while (searchesCount < maxSearches) {
        if (signal?.aborted) {
          throw new Error("Test run aborted by user.");
        }

        try {
          const currentIssues =
            serializer?.getTest()?.issues || checklist.issues || [];
          const issuesSummary = currentIssues
            .map((i) => `${i.id}: ${i.description}`)
            .join("; ");

          console.log("[VisualAgent][Executor] Beginning execution turn");

          // Keep snapshot hidden for LLM
          const hiddenSnapshot =
            "(Complete DOM snapshot hidden. Use 'search_snapshot' to locate reference IDs, or issue immediate actions.)";

          executionResponse = await executeTask({
            model,
            requirement,
            currentTask,
            checklist,
            snapshot: hiddenSnapshot,
            history,
            executionPromptTemplate: executionPrompt,
            screenshot,
            supportsVision,
            consecutiveSameAction,
            serializer,
          });

          const action = executionResponse.action;

          if (action.kind === "search_snapshot") {
            searchesCount++;
            const query = action.query;
            console.log(
              `[VisualAgent][Executor] Intercepting search_snapshot. Query: "${query}"`,
            );

            const lines = snapshot.split("\n");
            const matches = lines.filter((line) =>
              line.toLowerCase().includes(query.toLowerCase()),
            );

            let resultsText = "";
            if (matches.length === 0) {
              resultsText = `No elements found matching "${query}". Try searching for HTML roles (e.g. "button", "textbox"), text labels, or broad categories.`;
            } else {
              resultsText =
                `Search results for "${query}":\n` + matches.join("\n");
            }

            // Record turn in history so LLM gets it
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
                  text: `Search results for query "${query}":\n\n${resultsText}\n\nSelect the next action using these reference IDs.`,
                },
              ],
            });

            if (onStep) {
              onStep({
                id: `search-${stepCounter}-${searchesCount}`,
                step: `Searching DOM for "${query}"`,
                status: "success",
                duration: `${((Date.now() - actionStartTime) / 1000).toFixed(1)}s`,
                description: `Queried snapshot for "${query}". Found ${matches.length} elements.`,
                stateDescription: resultsText,
                screenshot: screenshotPath,
                url: currentUrl,
                action: action,
              });
            }

            // Perform another execution turn in-place
            continue;
          }

          break;
        } catch (e: any) {
          retries++;
          let errorMessage = e.message;
          const details = extractSchemaErrors(e);
          if (details) {
            errorMessage = `${details}`;
            const rawResponse = e.text || e.cause?.text || e.response?.text;
            if (rawResponse) {
              try {
                executionResponse = await reformatJsonWithAgent({
                  model,
                  schema: ExecutionResponseSchema,
                  rawResponse,
                  errors: details,
                });
                console.log(`[VisualAgent][Executor] Successfully recovered invalid JSON using reformatter agent!`);
                break;
              } catch (reformatErr: any) {
                console.error(`[VisualAgent][Executor] Reformatter agent failed:`, reformatErr);
              }
            }
          }

          const rawResponse = e.text || e.cause?.text || e.response?.text;
          console.log(`[VisualAgent][Executor] Raw response:`, rawResponse);
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
                text: `Your previous response failed schema validation.\n\nERROR:\n${errorMessage}`,
              },
            ],
          });

          if (retries >= maxRetries) {
            const tokenBreakdown = getTokenBreakdown({
              systemPrompt: executionPrompt,
              history,
              latestUserText: `Goal: ${requirement}\nTask: ${currentTask.description}`,
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
          "[VisualAgent][Executor] Failed to generate a valid execution response.",
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
          `[VisualAgent][Executor] Task completion indicated via ${action.kind}.`,
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
        } catch (execError: any) {
          console.error(
            `[VisualAgent] Action execution failed: `,
            execError.message,
          );
          executionResponse.previousActionResult = `Execution failed: ${execError.message}`;
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
        let assRetries = 0;
        const maxAssRetries = 3;

        while (assRetries < maxAssRetries) {
          try {
            console.log(`[VisualAgent][Asserter] Verifying task completion...`);
            const assertionResult = await generateObject({
              model,
              schema: AssertionAgentResponseSchema,
              system: assertionPromptTemplate,
              messages: [
                {
                  role: "user",
                  content: [
                    {
                      type: "text",
                      text: `Task: ${currentTask.description}\nGoal: ${requirement}\n\nBEFORE URL: ${currentTaskBeforeUrl}\nAFTER URL: ${currentUrl}\n\nConsole Logs: \n${logsText || "None"} \n\nNetwork Logs: \n${netText || "None"} `,
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
            });

            const assertionResponse = assertionResult.object;
            console.log(`[VisualAgent][Asserter] Response: `, assertionResponse);

            if (
              serializer &&
              assertionResponse.issues &&
              assertionResponse.issues.length > 0
            ) {
              serializer.logFindings(
                `step - ${stepCounter} `,
                assertionResponse.issues,
              );
              if (onIssuesUpdate)
                onIssuesUpdate(serializer.getTest()?.issues || []);
            }

            const afterAx = await browser.getSnapshotForLLM(
              false,
              false,
              fullSnapshot,
            );
            const afterRefs = afterAx.refs;

            if (
              assertionResponse.assertions &&
              Array.isArray(assertionResponse.assertions)
            ) {
              for (const ass of assertionResponse.assertions) {
                mapRefsToIdentifiers(ass, afterRefs);
              }
              const { passed, failures } = await evaluateAssertions(
                assertionResponse.assertions,
                browser,
                afterRefs,
              );
              if (failures.length > 0) {
                isVerified = false;
              }
            }

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

            break;
          } catch (assError: any) {
            assRetries++;
            let errorMessage = assError.message;
            const details = extractSchemaErrors(assError);
            if (details) {
              errorMessage = `${details}`;
              const rawResponse = assError.text || assError.cause?.text || assError.response?.text;
              if (rawResponse) {
                try {
                  const assertionResponse = await reformatJsonWithAgent({
                    model,
                    schema: AssertionAgentResponseSchema,
                    rawResponse,
                    errors: details,
                  });
                  console.log(`[VisualAgent][Asserter] Successfully recovered invalid JSON using reformatter agent!`);

                  if (
                    serializer &&
                    assertionResponse.issues &&
                    assertionResponse.issues.length > 0
                  ) {
                    serializer.logFindings(
                      `step - ${stepCounter} `,
                      assertionResponse.issues,
                    );
                    if (onIssuesUpdate)
                      onIssuesUpdate(serializer.getTest()?.issues || []);
                  }

                  const afterAx = await browser.getSnapshotForLLM(
                    false,
                    false,
                    fullSnapshot,
                  );
                  const afterRefs = afterAx.refs;

                  if (
                    assertionResponse.assertions &&
                    Array.isArray(assertionResponse.assertions)
                  ) {
                    for (const ass of assertionResponse.assertions) {
                      mapRefsToIdentifiers(ass, afterRefs);
                    }
                    const { passed, failures } = await evaluateAssertions(
                      assertionResponse.assertions,
                      browser,
                      afterRefs,
                    );
                    if (failures.length > 0) {
                      isVerified = false;
                    }
                  }

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
                  break;
                } catch (reformatErr: any) {
                  console.error(`[VisualAgent][Asserter] Reformatter agent failed:`, reformatErr);
                }
              }
            }
            console.warn(
              `[VisualAgent][Asserter] Retry ${assRetries} due to: `,
              errorMessage,
            );
            if (assRetries >= maxAssRetries) {
              isVerified = false;
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

      // Show step update in UI
      if (onStep && currentTask) {
        onStep({
          id: `step - ${stepCounter} `,
          step: `Action: ${action.kind} `,
          status: isVerified ? "success" : "failed",
          duration: `${((Date.now() - actionStartTime) / 1000).toFixed(1)} s`,
          description: executionResponse.intendedActionDescription,
          stateDescription:
            executionResponse.previousActionResult ||
            checklist.currentStateDescription,
          screenshot: screenshotPath,
          url: currentUrl,
          action: action,
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

      // Record LLM history turn
      history.push({
        role: "assistant",
        content: [
          {
            type: "text",
            text: JSON.stringify(executionResponse),
          },
        ],
      });

      if (executionResponse.previousActionResult) {
        history.push({
          role: "user",
          content: [
            {
              type: "text",
              text: `Previous action result: ${executionResponse.previousActionResult} `,
            },
          ],
        });
      }

      if (history.length > 20) history.splice(0, 2);

      if (action.kind === "screenshot" && action.name === "success") {
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
