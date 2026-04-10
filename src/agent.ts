import { generateObject, type LanguageModel } from "ai";
import { BrowserManager } from "./browser";

/**
 * Concrete type for agent conversation history
 */
export type AgentHistoryMessage = 
  | { role: 'user'; content: string | Array<{ type: 'text'; text: string } | { type: 'image'; image: Buffer | string }> }
  | { role: 'assistant'; content: string | Array<{ type: 'text'; text: string }> }
  | { role: 'system'; content: string };
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

export type PlanApprovalResult = 
  | { action: 'accept' }
  | { action: 'modify', checklist: Checklist }
  | { action: 'reject' };

export type GoalReachedResult = 
  | { action: 'validate' }
  | { action: 'prompt', feedback: string }
  | { action: 'cancel' };

function mapRefsToIdentifiers(obj: any, refs: Record<string, any>) {
  if (!obj) return;
  const map = (target: any) => {
    if (target && target.ref && refs[target.ref]) {
      const refData = refs[target.ref];
      target.role = refData.role;
      if (refData.name) target.name = refData.name;
      if (refData.nth !== undefined) target.nth = refData.nth;
      if (target.kind === "screenshot") {
        target.elementName = target.name;
        delete target.name;
      }
      delete target.ref;
    }
  };
  map(obj);
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
    for (const field of obj.fields) map(field);
  }
  if (Array.isArray(obj.assertions)) {
    for (const assertion of obj.assertions) map(assertion);
  }
}

export interface AgentStepUpdate {
  id: string;
  step: string;
  status: 'success' | 'failed' | 'pending';
  duration: string;
  description: string;
  stateDescription?: string;
  error?: string;
  screenshot?: string;
  action?: any;
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
  onPlanApproval?: (checklist: Checklist) => Promise<PlanApprovalResult>,
  onGoalReached?: (checklist: Checklist) => Promise<GoalReachedResult>,
  onPlanning?: (isPlanning: boolean) => void,
  signal?: AbortSignal,
) {
  const history: AgentHistoryMessage[] = [];
  let stepCounter = 1;
  let needsPlanApproval = true;
  let checklist: Checklist = {
    currentStateDescription: "Starting test execution",
    tasks: [],
    isGoalAchieved: false,
  };

  if (artifactsDir) {
    await fs.mkdir(artifactsDir, { recursive: true });
  }

  const planningPrompt = await fs.readFile(path.join(__dirname, "prompts", "planning.txt"), "utf-8");
  const executionPromptTemplate = await fs.readFile(path.join(__dirname, "prompts", "execution.txt"), "utf-8");
  const assertionPromptTemplate = await fs.readFile(path.join(__dirname, "prompts", "assertion.txt"), "utf-8");

  let lastActionString = "";
  let consecutiveSameAction = 0;
  let currentTaskBeforeSnapshot: string = "";
  let currentTaskBeforeUrl: string = "";
  let currentTaskBeforeScreenshot: Buffer | undefined = undefined;
  let lastTaskId: string | undefined = undefined;

  try {
    while (stepCounter < 50) {
      if (signal?.aborted) throw new Error("Agent terminated by user");
      await browser.waitForStability();
      const { text: snapshot, axTree, refs } = await browser.getSnapshotForLLM(false, false, fullSnapshot);
      const currentUrl = browser.page?.url() || "";
      const screenshot = await browser.page?.screenshot({ type: "jpeg", quality: 80 });

      if (artifactsDir) {
        await saveStepArtifacts(artifactsDir, stepCounter, snapshot, axTree, refs, browser, history, checklist);
      }

      console.log(`[Agent][Planner] Planning...`);
      const planningStartTime = Date.now();
      if (onPlanning) onPlanning(true);
      try {
        const planningResult = await generateObject({
          model,
          schema: ChecklistSchema,
          system: planningPrompt,
          messages: [...history, { role: "user", content: [{ type: "text" as const, text: `Goal: ${requirement}\n\nChecklist: ${JSON.stringify(checklist, null, 2)}\n\nCurrent State:\n${snapshot}` }, ...(screenshot ? [{ type: "image" as const, image: screenshot }] : [])] }],
        });
        checklist = planningResult.object;
        if (onChecklist) onChecklist(checklist);
        if (serializer) serializer.updateChecklist(checklist);
        
        if (needsPlanApproval && onPlanApproval) {
          if (onPlanning) onPlanning(false);
          const approvalResult = await onPlanApproval(checklist);
          if (approvalResult.action === 'reject') throw new Error("Plan rejected by user");
          if (approvalResult.action === 'modify') {
            checklist = approvalResult.checklist;
            if (onChecklist) onChecklist(checklist);
            if (serializer) serializer.updateChecklist(checklist);
          }
          needsPlanApproval = false;
        }
        history.push({ role: "assistant", content: [{ type: "text" as const, text: `I am updating the plan. ${checklist.currentStateDescription}. ${checklist.tasks.length} tasks in total.` }] });
        if (history.length > 20) history.splice(0, 2); 
      } catch (e: any) {
        if (onPlanning) onPlanning(false);
        console.error(`[Agent][Planner] Planning failed: ${e.message}`);
      }

      if (checklist.isGoalAchieved) {
        if (onGoalReached) {
          if (screenshot) {
            checklist.screenshot = screenshot.toString("base64");
          }
          console.log(`[Agent] Goal achieved. Requesting human validation...`);
          const validationResult = await onGoalReached(checklist);
          if (validationResult.action === 'validate') break;
          if (validationResult.action === 'cancel') throw new Error("Execution cancelled by user during validation");
          if (validationResult.action === 'prompt') {
            console.log(`[Agent] Human prompted further: ${validationResult.feedback}`);
            requirement += `\nLatest User Feedback: ${validationResult.feedback}`;
            checklist.isGoalAchieved = false;
            needsPlanApproval = true; // Force re-approval of the next plan
            continue; // Go back to planning
          }
        } else {
          break;
        }
      }
      const currentTaskId = checklist.nextTaskId;
      const currentTask = checklist.tasks.find((t) => t.id === currentTaskId);

      if (onStep && currentTask) {
        onStep({
          id: `planning-${stepCounter}`,
          step: `Planning: ${currentTask.id}`,
          status: 'success',
          duration: `${((Date.now() - planningStartTime) / 1000).toFixed(1)}s`,
          description: `Strategic focus: ${currentTask.description}`,
          stateDescription: checklist.currentStateDescription,
          screenshot: screenshot?.toString('base64')
        });
      }
      if (onPlanning) onPlanning(false);

      if (!currentTaskId || !currentTask) break;

      if (currentTaskId !== lastTaskId) {
        currentTaskBeforeSnapshot = snapshot;
        currentTaskBeforeUrl = currentUrl;
        currentTaskBeforeScreenshot = screenshot;
        browser.networkLogs = [];
        lastTaskId = currentTaskId;
      }

      const executionPrompt = executionPromptTemplate.replace("{taskDescription}", currentTask.description).replace("{overallGoal}", requirement);
      let executionResponse: ExecutionResponse | undefined;
      let retries = 0;
      const maxRetries = 3;
      const actionStartTime = Date.now();

      while (retries < maxRetries) {
        try {
          const result = await generateObject({
            model,
            schema: ExecutionResponseSchema,
            system: executionPrompt,
            messages: [
              ...history, 
              { 
                role: "user", 
                content: [
                  { 
                    type: "text" as const, 
                    text: `Goal: ${requirement}\nTask: ${currentTask.description}\n\nCurrent State:\n${snapshot}${consecutiveSameAction > 0 ? `\n\nWARNING: You are repeating an action that recently failed. Try a different approach.` : ""}` 
                  }, 
                  ...(screenshot ? [{ type: "image" as const, image: screenshot }] : [])
                ] 
              }
            ],
          });
          executionResponse = result.object;
          break;
        } catch (e: any) {
          retries++;
          let errorMessage = e.message;
          if (e.errors && Array.isArray(e.errors)) {
            const details = e.errors.map((err: any) => `- ${err.path.join(".")}: ${err.message}`).join("\n");
            errorMessage = `Schema validation failed:\n${details}`;
          } else if (errorMessage.includes("No object generated") && e.cause?.errors) {
            const details = (e.cause.errors as any[]).map((err: any) => `- ${err.path.join(".")}: ${err.message}`).join("\n");
            errorMessage = `Schema validation failed:\n${details}`;
          }

          console.warn(`[Agent][Executor] Execution schema validation failed (Attempt ${retries}/${maxRetries}): ${errorMessage}`);
          history.push({ 
            role: "assistant", 
            content: [{ type: "text", text: e.text || JSON.stringify({ error: errorMessage }) }] 
          });
          history.push({ 
            role: "user", 
            content: [{ 
              type: "text", 
              text: `Your previous response failed schema validation.\n\nERROR:\n${errorMessage}\n\nPlease correct your output based on the ExecutionResponseSchema.` 
            }] 
          });

          if (retries >= maxRetries) throw new Error(errorMessage);
        }
      }

      if (!executionResponse) throw new Error("[Agent][Executor] Failed to generate a valid execution response.");

      const action = executionResponse.action;
      mapRefsToIdentifiers(action, refs);

      const actionStr = JSON.stringify(action);
      if (actionStr === lastActionString) {
        consecutiveSameAction++;
        if (consecutiveSameAction > 3) throw new Error(`Agent stuck in loop: repeated the same action 3 times: ${actionStr}`);
      } else {
        lastActionString = actionStr;
        consecutiveSameAction = 0;
      }

      try {
        await browser.execute(action);

        if (onStep) {
          if (serializer && executionResponse.previousActionResult) {
            serializer.updatePreviousResult(executionResponse.previousActionResult);
          }
          
          onStep({
            id: `exec-${stepCounter}`,
            step: `Executing: ${action.kind}`,
            status: 'success',
            duration: `${((Date.now() - actionStartTime) / 1000).toFixed(1)}s`,
            description: executionResponse.intendedActionDescription,
            stateDescription: executionResponse.currentStateDescription,
            screenshot: screenshot?.toString('base64'),
            action
          });

          history.push({ 
            role: "assistant", 
            content: [{ 
              type: "text", 
              text: `Observation: ${executionResponse.currentStateDescription}\nAction: ${executionResponse.intendedActionDescription}` 
            }] 
          });
          
          if (serializer) {
            serializer.logAction(action, {
              stateDescription: executionResponse.currentStateDescription,
              actionIntent: executionResponse.intendedActionDescription,
              taskId: currentTaskId,
            });
            await serializer.saveTest();
          }
        }
      } catch (e: any) {
        console.error(`[Agent] Action failed: ${e.message}`);
        if (onStep) {
          onStep({
            id: `exec-fail-${stepCounter}`,
            step: `Failed: ${action.kind}`,
            status: 'failed',
            error: e.message,
            duration: `${((Date.now() - actionStartTime) / 1000).toFixed(1)}s`,
            description: `Action failed: ${executionResponse.intendedActionDescription}`,
            stateDescription: `ERROR: ${e.message}`,
            screenshot: screenshot?.toString('base64'),
            action
          });
        }
        history.push({ 
          role: "user", 
          content: [{ 
            type: "text", 
            text: `ACTION FAILED: ${e.message}. Please try a different approach (e.g., look for alternative selectors, scroll, or wait).` 
          }] 
        });
        if (history.length > 20) history.splice(0, 2);
        stepCounter++;
        continue; // RE-PLAN with error context
      }

      if (executionResponse.isTaskComplete) {
        await browser.waitForStability();
        const { text: afterSnapshot, refs: afterRefs } = await browser.getSnapshotForLLM(false, false, fullSnapshot);
        const afterUrl = browser.page?.url() || "";
        const afterActionScreenshot = await browser.page?.screenshot({ type: "jpeg", quality: 80 });

        const verificationStartTime = Date.now();
        let assertionRetries = 0;
        let assertionResponse: AssertionAgentResponse | undefined;
        const assertionHistory: any[] = [];

        while (assertionRetries < 3) {
          try {
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
                      text: `Task: ${currentTask.description}\nGoal: ${requirement}\n\nBEFORE Snapshot:\n${currentTaskBeforeSnapshot}\nAFTER Snapshot:\n${afterSnapshot}\n\nNetwork Logs:\n${JSON.stringify(browser.networkLogs, null, 2)}` 
                    }, 
                    ...(currentTaskBeforeScreenshot ? [{ type: "image" as const, image: currentTaskBeforeScreenshot }] : []),
                    ...(afterActionScreenshot ? [{ type: "image" as const, image: afterActionScreenshot }] : [])
                  ] 
                },
                ...assertionHistory
              ],
            });
            assertionResponse = assertionResult.object;
            
            if (assertionResponse.assertions.length > 0) {
              for (const ass of assertionResponse.assertions) mapRefsToIdentifiers(ass, afterRefs);
              console.log(`[Agent][Asserter] Executing generated assertions...`);
              const { passed, failures } = await evaluateAssertions(assertionResponse.assertions, browser, afterRefs);
              assertionResponse.assertions = passed;

              if (failures.length > 0) {
                console.error(`[Agent][Asserter] Assertions FAILED: ${failures.join("\n")}`);
                assertionHistory.push({ role: "assistant", content: [{ type: "text", text: JSON.stringify(assertionResponse) }] });
                assertionHistory.push({ role: "user", content: [{ type: "text", text: `The assertions you generated failed programmatic verification: ${failures.join("\n")}. Please generate different assertions that correctly reflect the actual task completion state.` }] });
                assertionRetries++;
                continue;
              }
            }
            break;
          } catch (e: any) {
            assertionRetries++;
            assertionHistory.push({ role: "user", content: [{ type: "text", text: `Your previous response failed schema validation: ${e.message}. Please corrective-output a valid object.` }] });
          }
        }

        if (!assertionResponse) throw new Error("Failed to verify task after 3 attempts.");

        if (onStep) {
          onStep({
            id: `verify-${stepCounter}`,
            step: `Verifying: ${currentTaskId}`,
            status: assertionResponse.isTaskVerified ? 'success' : 'failed',
            duration: `${((Date.now() - verificationStartTime) / 1000).toFixed(1)}s`,
            description: assertionResponse.verificationReasoning,
            stateDescription: assertionResponse.currentStateDescription,
            screenshot: afterActionScreenshot?.toString('base64')
          });
        }

        if (serializer && assertionResponse.assertions.length > 0) {
          serializer.logVerificationToLastStep(assertionResponse.assertions);
        }

        history.push({ 
          role: "assistant", 
          content: [{ 
            type: "text" as const, 
            text: `Verification for ${currentTaskId}: ${assertionResponse.isTaskVerified ? "SUCCESS" : "FAILED"}. Reasoning: ${assertionResponse.verificationReasoning}` 
          }] 
        });
        if (history.length > 20) history.splice(0, 2);

        const tIdx = checklist.tasks.findIndex(t => t.id === currentTaskId);
        if (tIdx !== -1) {
          checklist.tasks[tIdx].status = assertionResponse.isTaskVerified ? "completed" : "pending";
          checklist.tasks[tIdx].result = assertionResponse.verificationReasoning;
          if (onChecklist) onChecklist(checklist);
        }
      }

      if (action.kind === "screenshot" && action.name === "success") {
        console.log(`[Agent][Executor] Final success milestone reached.`);
        checklist.isGoalAchieved = true;
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

async function saveStepArtifacts(dir: string, step: number, snapshot: string, axTree: any, refs: any, browser: BrowserManager, history: any[], checklist: Checklist) {
  await fs.writeFile(path.join(dir, `step-${step}-snapshot.txt`), snapshot);
  if (axTree) await fs.writeFile(path.join(dir, `step-${step}-axtree.json`), JSON.stringify(axTree, null, 2));
  await fs.writeFile(path.join(dir, `step-${step}-refs.json`), JSON.stringify(refs, null, 2));
  await fs.writeFile(path.join(dir, `step-${step}-checklist.json`), JSON.stringify(checklist, null, 2));
  await fs.writeFile(path.join(dir, `step-${step}-history.json`), JSON.stringify(history, null, 2));
  if (browser.page) await browser.page.screenshot({ path: path.join(dir, `step-${step}-screenshot.png`) });
}
