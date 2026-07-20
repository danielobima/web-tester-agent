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
  appId?: string,
) {
  let activeVariables = appId ? await data.listVariables(appId) : [];
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

      // 1. Run Search Element Agent to locate initial elements needed for the task
      console.log("[VisualAgent][Search] Running Search Element Agent...");

      const searchPrompt = searchPromptTemplate
        .replace("{taskDescription}", currentTask.description)
        .replace("{overallGoal}", requirement);

      const SearchResponseSchema = z.object({
        currentStateDescription: z
          .string()
          .describe("Description of the visual state and the elements to find"),
        queries: z
          .array(z.string())
          .describe(
            "Search queries to run in the DOM snapshot to find relevant elements",
          ),
      });

      let searchResponse;
      try {
        const searchResult = await generateObjectWithTimeout({
          model,
          schema: SearchResponseSchema,
          system: searchPrompt,
          providerOptions: getProviderOptions(model),
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `Goal: ${requirement}\nTask: ${currentTask.description}\nURL: ${currentUrl}`,
                },
                ...(screenshot && supportsVision
                  ? [prepareImagePart(screenshot)]
                  : []),
              ],
            },
          ],
          abortSignal: signal,
        });
        searchResponse = searchResult.object;
        console.log(
          "[VisualAgent][Search] Search queries:",
          searchResponse.queries,
        );
      } catch (e: any) {
        console.warn(
          "[VisualAgent][Search] Search element agent failed, falling back to empty queries:",
          e.message,
        );
        searchResponse = {
          currentStateDescription: "Failed to determine search queries",
          queries: [],
        };
      }

      let combinedMatches: string[] = [];
      if (searchResponse.queries && searchResponse.queries.length > 0) {
        const lines = snapshot.split("\n");
        for (const query of searchResponse.queries) {
          const matches = lines.filter((line) =>
            line.toLowerCase().includes(query.toLowerCase()),
          );
          combinedMatches.push(...matches);
        }
      }
      // Remove duplicate lines while preserving order
      combinedMatches = [...new Set(combinedMatches)];
      let filteredSnapshot = combinedMatches.join("\n");
      if (!filteredSnapshot) {
        filteredSnapshot = "No elements found in initial search.";
      } else {
        filteredSnapshot = `Initial search results for elements relevant to the current task:\n\n${filteredSnapshot}`;
      }

      let currentFilteredSnapshot = filteredSnapshot;
      let searchResultsText = `Initial Search Queries: ${JSON.stringify(searchResponse.queries || [])}\n\n${filteredSnapshot}`;
      let afterSnapshotText = snapshot;

      const executionPrompt =
        executionPromptTemplate
          .replace("{taskDescription}", currentTask.description)
          .replace("{overallGoal}", currentRequirement) + technicalObservations;

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

        const currentIssues =
          serializer?.getTest()?.issues || checklist.issues || [];
        const issuesSummary = currentIssues
          .map((i) => `${i.id}: ${i.description}`)
          .join("; ");

        console.log("[VisualAgent][Executor] Beginning execution turn");

        executionResponse = await runWithSchemaRecovery({
          model,
          schema: ExecutionResponseSchema,
          label: "Executor",
          history,
          abortSignal: signal,
          taskFn: () =>
            executeTask({
              model,
              requirement: currentRequirement,
              currentTask,
              checklist,
              snapshot: currentFilteredSnapshot,
              history,
              executionPromptTemplate: executionPrompt,
              screenshot,
              supportsVision,
              consecutiveSameAction,
              serializer,
              abortSignal: signal,
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
                  snapshot,
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
            resultsText = matches.join("\n");
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
              snapshotBefore: snapshot,
              searchResults: `Search Query: "${query}"\n\n${resultsText}`,
              snapshotAfter: snapshot,
            });
          }

          searchResultsText += `\n\nSearch Query: "${query}"\n${resultsText}`;

          // Append new matches to the filtered snapshot
          if (matches.length > 0) {
            const currentLines = currentFilteredSnapshot
              .split("\n")
              .filter(
                (l) =>
                  !l.startsWith("No elements found") &&
                  !l.startsWith("Initial search results") &&
                  !l.startsWith("Search results for elements"),
              );
            const newFilteredLines = [...currentLines, ...matches];
            currentFilteredSnapshot = `Search results for elements relevant to the current task:\n\n${[...new Set(newFilteredLines)].join("\n")}`;
          }

          // Perform another execution turn in-place
          continue;
        }

        break;
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

      if (action.kind === "create_variable") {
        try {
          let extractedValue = "";
          if (action.source === "arbitrary") {
            extractedValue = action.value || "";
          } else if (action.source === "website_content") {
            if (action.ref) {
              const locator = await browser.getLocator(action.ref);
              extractedValue = await locator.innerText().catch(() => "");
              if (!extractedValue) {
                extractedValue = await locator.inputValue().catch(() => "");
              }
            } else if (action.selector) {
              extractedValue =
                (await browser.page
                  ?.locator(action.selector)
                  .first()
                  .innerText()
                  .catch(() => "")) || "";
              if (!extractedValue) {
                extractedValue =
                  (await browser.page
                    ?.locator(action.selector)
                    .first()
                    .inputValue()
                    .catch(() => "")) || "";
              }
            } else {
              extractedValue =
                (await browser.page
                  ?.locator("body")
                  .innerText()
                  .catch(() => "")) || "";
            }
          } else if (action.source === "network_logs") {
            extractedValue = browser.networkLogs
              .map((n) => `[${n.method}] ${n.url} (${n.status})`)
              .join("\n");
          } else if (action.source === "console_logs") {
            extractedValue = browser.consoleLogs.map((l) => l.text).join("\n");
          }

          if (action.regex) {
            const match = new RegExp(action.regex).exec(extractedValue);
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

          if (appId) {
            const vars = await data.listVariables(appId);
            const existingIndex = vars.findIndex((v) => v.name === action.name);
            const updatedVar: data.Variable = {
              id:
                existingIndex !== -1
                  ? vars[existingIndex].id
                  : `var-${Date.now()}`,
              appId,
              name: action.name,
              type: action.type || "string",
              value: extractedValue,
              purpose: action.purpose,
              expiry: action.expiry,
              createdAt: Date.now(),
            };
            if (existingIndex !== -1) {
              vars[existingIndex] = updatedVar;
            } else {
              vars.push(updatedVar);
            }
            await data.saveVariables(vars);
            activeVariables = vars;
          } else {
            const existingIndex = activeVariables.findIndex(
              (v) => v.name === action.name,
            );
            const updatedVar: data.Variable = {
              id:
                existingIndex !== -1
                  ? activeVariables[existingIndex].id
                  : `var-${Date.now()}`,
              appId: "cli",
              name: action.name,
              type: action.type || "string",
              value: extractedValue,
              purpose: action.purpose,
              expiry: action.expiry,
              createdAt: Date.now(),
            };
            if (existingIndex !== -1) {
              activeVariables[existingIndex] = updatedVar;
            } else {
              activeVariables.push(updatedVar);
            }
          }

          executionResponse.previousActionResult = `Successfully created/updated variable '${action.name}' with value '${extractedValue}'.`;
          executionResponse.isTaskComplete = true;

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

          history.push({
            role: "assistant",
            content: [
              {
                type: "text",
                text: JSON.stringify(executionResponse),
              },
            ],
          });

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
          executionResponse.isTaskComplete = false;
        }
      } else if (action.kind === "stop" || action.kind === "none") {
        console.log(
          `[VisualAgent][Executor] Task completion indicated via ${action.kind}.`,
        );
        executionResponse.isTaskComplete = true;
      } else {
        try {
          await browser.execute(action);

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
          snapshotBefore: snapshot,
          searchResults: searchResultsText,
          snapshotAfter: afterSnapshotText,
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
